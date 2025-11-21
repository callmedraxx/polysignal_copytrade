/**
 * CLOB Client Cache
 * Caches CLOB clients per user to avoid repeated API key creation
 * This helps prevent hitting the API key creation rate limit (50 req/10s)
 */

import { ClobClient } from "@polymarket/clob-client";
import { createClobClientForUser } from './clob-client';

// Cache of CLOB clients by user address
// Key: userAddress (lowercase), Value: { client, createdAt, lastUsed }
interface CachedClient {
  client: ClobClient;
  createdAt: Date;
  lastUsed: Date;
}

const clientCache: Map<string, CachedClient> = new Map();

// Promise cache to prevent race conditions when multiple calls happen concurrently
// Key: userAddress (lowercase), Value: Promise<ClobClient>
const pendingPromises: Map<string, Promise<ClobClient>> = new Map();

// Cache TTL: 1 hour (clients can be reused for a while)
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Maximum cache size to prevent memory leaks
const MAX_CACHE_SIZE = 1000;

/**
 * Get or create a CLOB client for a user
 * Uses cache to avoid repeated API key creation
 * Prevents race conditions by caching in-flight promises
 */
export async function getClobClientForUser(userAddress: string): Promise<ClobClient> {
  const normalizedAddress = userAddress.toLowerCase();
  
  // Check cache first
  const cached = clientCache.get(normalizedAddress);
  
  if (cached) {
    const age = Date.now() - cached.createdAt.getTime();
    
    // If cache is still valid, return cached client
    if (age < CACHE_TTL_MS) {
      cached.lastUsed = new Date();
      const ageMinutes = Math.floor(age / 60000);
      console.log(`♻️  Reusing cached CLOB client for user ${normalizedAddress} (age: ${ageMinutes}m)`);
      return cached.client;
    } else {
      // Cache expired, remove it
      console.log(`⏰ Cached CLOB client expired for user ${normalizedAddress}, creating new one`);
      clientCache.delete(normalizedAddress);
    }
  }
  
  // Check if there's already a pending request for this user
  // This prevents race conditions when multiple calls happen concurrently
  const pendingPromise = pendingPromises.get(normalizedAddress);
  if (pendingPromise) {
    // Another request is already creating the client, wait for it
    console.log(`⏳ Another request is creating CLOB client for user ${normalizedAddress}, waiting for it...`);
    return pendingPromise;
  }
  
  // Create a new promise for this client creation
  console.log(`🆕 Creating new CLOB client for user ${normalizedAddress} (will be cached for reuse)`);
  const clientPromise = (async () => {
    try {
      // Create new client (this will call createOrDeriveApiKey, which is rate limited)
      const client = await createClobClientForUser(userAddress);
      
      // Cache the client
      // If cache is too large, remove oldest entries
      if (clientCache.size >= MAX_CACHE_SIZE) {
        // Remove oldest entry (least recently used)
        let oldestKey: string | null = null;
        let oldestTime = Date.now();
        
        for (const [key, value] of clientCache.entries()) {
          if (value.lastUsed.getTime() < oldestTime) {
            oldestTime = value.lastUsed.getTime();
            oldestKey = key;
          }
        }
        
        if (oldestKey) {
          clientCache.delete(oldestKey);
        }
      }
      
      clientCache.set(normalizedAddress, {
        client,
        createdAt: new Date(),
        lastUsed: new Date(),
      });
      
      console.log(`✅ CLOB client created and cached for user ${normalizedAddress} (will be reused for ${Math.floor(CACHE_TTL_MS / 60000)} minutes)`);
      
      return client;
    } finally {
      // Remove from pending promises once done (success or failure)
      pendingPromises.delete(normalizedAddress);
    }
  })();
  
  // Store the pending promise
  pendingPromises.set(normalizedAddress, clientPromise);
  
  return clientPromise;
}

/**
 * Clear the client cache (useful for testing or when credentials change)
 */
export function clearClobClientCache(userAddress?: string): void {
  if (userAddress) {
    const normalizedAddress = userAddress.toLowerCase();
    clientCache.delete(normalizedAddress);
    pendingPromises.delete(normalizedAddress);
  } else {
    clientCache.clear();
    pendingPromises.clear();
  }
}

/**
 * Pre-warm CLOB client for a user
 * Creates the client immediately and caches it for future use
 * This is called when a proxy wallet is created to ensure the client is always available
 */
export async function preWarmClobClient(userAddress: string): Promise<ClobClient> {
  const normalizedAddress = userAddress.toLowerCase();
  
  // Check if already cached
  const cached = clientCache.get(normalizedAddress);
  if (cached) {
    const age = Date.now() - cached.createdAt.getTime();
    if (age < CACHE_TTL_MS) {
      // Already cached and valid
      return cached.client;
    }
  }
  
  // Use the same logic as getClobClientForUser to create and cache
  return await getClobClientForUser(userAddress);
}

/**
 * Refresh CLOB client for a user before it expires
 * This is called by the background worker to keep clients fresh
 */
export async function refreshClobClient(userAddress: string): Promise<ClobClient> {
  const normalizedAddress = userAddress.toLowerCase();
  
  // Remove from cache to force refresh
  clientCache.delete(normalizedAddress);
  pendingPromises.delete(normalizedAddress);
  
  // Create new client
  return await getClobClientForUser(userAddress);
}

/**
 * Get all users that have cached CLOB clients
 * Used by the refresh worker to know which clients to refresh
 */
export function getCachedUserAddresses(): string[] {
  return Array.from(clientCache.keys());
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  maxSize: number;
  entries: Array<{ userAddress: string; age: number; lastUsed: number }>;
} {
  const entries = Array.from(clientCache.entries()).map(([address, cached]) => ({
    userAddress: address,
    age: Date.now() - cached.createdAt.getTime(),
    lastUsed: Date.now() - cached.lastUsed.getTime(),
  }));
  
  return {
    size: clientCache.size,
    maxSize: MAX_CACHE_SIZE,
    entries,
  };
}

