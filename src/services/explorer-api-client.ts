import { logger } from "../utils/logger";

// Rate limits
const RATE_LIMIT_CALLS_PER_SECOND = 5;
const RATE_LIMIT_CALLS_PER_DAY = 100000;

// Request queue management
class RateLimiter {
  private requestQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    fn: () => Promise<any>;
  }> = [];
  
  private lastRequestTime: number = 0;
  private minInterval: number = 1000 / RATE_LIMIT_CALLS_PER_SECOND; // 200ms between requests
  private dailyCallCount: number = 0;
  private dailyResetTime: number = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now
  
  private processing: boolean = false;
  
  // Cache for responses (5 minute TTL)
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Process the request queue with rate limiting
   */
  private async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      // Check daily limit
      if (this.dailyCallCount >= RATE_LIMIT_CALLS_PER_DAY) {
        const resetIn = Math.max(0, this.dailyResetTime - Date.now());
        logger.warn("Daily API limit reached. Resets in", {
          resetInMs: resetIn,
          resetInMinutes: Math.ceil(resetIn / 60000),
        });
        
        // Reject remaining requests
        while (this.requestQueue.length > 0) {
          const request = this.requestQueue.shift()!;
          request.reject(new Error(`Daily API limit reached. Resets in ${Math.ceil(resetIn / 60000)} minutes`));
        }
        break;
      }
      
      // Reset daily counter if 24 hours passed
      if (Date.now() >= this.dailyResetTime) {
        this.dailyCallCount = 0;
        this.dailyResetTime = Date.now() + 24 * 60 * 60 * 1000;
        logger.info("Daily API limit reset", {
          dailyCallCount: this.dailyCallCount,
        });
      }
      
      const request = this.requestQueue.shift()!;
      
      // Wait for minimum interval between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.minInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastRequest));
      }
      
      this.lastRequestTime = Date.now();
      this.dailyCallCount++;
      
      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, cacheKey?: string): Promise<T> {
    // Check cache first
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        logger.debug("Cache hit for", { cacheKey });
        return cached.data as T;
      }
    }
    
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({
        resolve: (result) => {
          // Cache the result
          if (cacheKey) {
            this.cache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + this.CACHE_TTL,
            });
          }
          resolve(result);
        },
        reject,
        fn: async () => {
          const result = await fn();
          return result;
        },
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Get current rate limit stats
   */
  getStats() {
    return {
      queueLength: this.requestQueue.length,
      dailyCallCount: this.dailyCallCount,
      dailyLimit: RATE_LIMIT_CALLS_PER_DAY,
      remainingCalls: RATE_LIMIT_CALLS_PER_DAY - this.dailyCallCount,
      resetInMs: Math.max(0, this.dailyResetTime - Date.now()),
      cacheSize: this.cache.size,
    };
  }
  
  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
  
  /**
   * Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

// Check if API keys are the same (Etherscan keys work across all Etherscan networks)
const etherscanKey = process.env.ETHERSCAN_API_KEY;
const polygonscanKey = process.env.POLYGONSCAN_API_KEY;
const useSharedRateLimiter = etherscanKey && polygonscanKey && etherscanKey === polygonscanKey;

// Create rate limiter instances
// If keys are the same, share rate limiter (limits are shared across Etherscan networks)
const etherscanRateLimiter = new RateLimiter();
const polygonscanRateLimiter = useSharedRateLimiter ? etherscanRateLimiter : new RateLimiter();

if (useSharedRateLimiter) {
  logger.info("Using shared rate limiter for Etherscan and Polygonscan (same API key)");
}

// Clean cache every 5 minutes
setInterval(() => {
  etherscanRateLimiter.cleanCache();
  polygonscanRateLimiter.cleanCache();
}, 5 * 60 * 1000);

const ETHERSCAN_API_URL = process.env.ETHERSCAN_API_URL || "https://api.etherscan.com/api";
const POLYGONSCAN_API_URL = process.env.POLYGONSCAN_API_URL || "https://api.polygonscan.com/api";

/**
 * Make rate-limited API call to Etherscan
 * Note: Etherscan API keys work across all Etherscan networks (Ethereum, Polygon, BSC, etc.)
 */
export async function callEtherscanAPI(
  params: Record<string, string>,
  cacheKey?: string
): Promise<any> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY not configured");
  }
  
  const queryParams = new URLSearchParams({
    ...params,
    apikey: apiKey,
  });
  
  const url = `${ETHERSCAN_API_URL}?${queryParams.toString()}`;
  
  // Use shared rate limiter if keys are the same
  const rateLimiter = useSharedRateLimiter ? etherscanRateLimiter : etherscanRateLimiter;
  
  return rateLimiter.execute(async () => {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Etherscan API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle API responses
      // Status "0" can mean:
      // - Error: "NOTOK" or error message
      // - Success with no results: "No transactions found", "OK" with empty result
      const responseData = data as { status: string; message?: string; result?: any };
      if (responseData.status === "0") {
        const message = responseData.message || "";
        const isError = message === "NOTOK" || 
                       message.toLowerCase().includes("error") ||
                       message.toLowerCase().includes("invalid") ||
                       message.toLowerCase().includes("rate limit") ||
                       (!message.includes("No transactions") && 
                        !message.includes("No records") && 
                        message !== "OK");
        
        if (isError) {
          throw new Error(`Etherscan API error: ${message || "Unknown error"}`);
        }
        
        // Status "0" with "No transactions found" or similar is OK - just return empty result
        // Status "0" with "OK" is also OK
      }
      
      return data;
    } catch (error) {
      logger.error("Error calling Etherscan API", {
        params,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }, cacheKey);
}

/**
 * Make rate-limited API call to Polygonscan
 * Note: If using the same API key as Etherscan, rate limits are shared
 */
export async function callPolygonscanAPI(
  params: Record<string, string>,
  cacheKey?: string
): Promise<any> {
  // Use Etherscan API key if Polygonscan key not set (same key works for all Etherscan networks)
  const apiKey = process.env.POLYGONSCAN_API_KEY || process.env.ETHERSCAN_API_KEY;
  
  if (!apiKey) {
    throw new Error("POLYGONSCAN_API_KEY or ETHERSCAN_API_KEY not configured");
  }
  
  const queryParams = new URLSearchParams({
    ...params,
    apikey: apiKey,
  });
  
  const url = `${POLYGONSCAN_API_URL}?${queryParams.toString()}`;
  
  // Use shared rate limiter if keys are the same (rate limits are shared across Etherscan networks)
  const rateLimiter = useSharedRateLimiter ? etherscanRateLimiter : polygonscanRateLimiter;
  
  return rateLimiter.execute(async () => {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Polygonscan API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const responseData = data as { status: string; message?: string; result?: any };
      if (responseData.status === "0" && responseData.message && responseData.message !== "OK") {
        throw new Error(`Polygonscan API error: ${responseData.message}`);
      }
      
      return data;
    } catch (error) {
      logger.error("Error calling Polygonscan API", {
        params,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }, cacheKey);
}

/**
 * Get token transfers with rate limiting
 */
export async function getTokenTransfers(
  address: string,
  chainId: string | number,
  contractAddress?: string,
  startBlock: number = 0,
  endBlock: number = 99999999
): Promise<any[]> {
  const isEthereum = chainId === "1" || chainId === 1;
  const explorer = isEthereum ? callEtherscanAPI : callPolygonscanAPI;
  
  // Normalize address to lowercase for consistent API calls
  // Polygonscan API accepts lowercase addresses
  const normalizedAddress = address.toLowerCase();
  
  // Create cache key with normalized addresses
  // Use normalized addresses to ensure cache consistency
  const normalizedContract = contractAddress ? contractAddress.toLowerCase() : "all";
  const cacheKey = `transfers-${chainId}-${normalizedAddress}-${normalizedContract}-${startBlock}-${endBlock}`;
  
  const params: Record<string, string> = {
    module: "account",
    action: contractAddress ? "tokentx" : "txlist",
    address: normalizedAddress,
    startblock: startBlock.toString(),
    endblock: endBlock.toString(),
    sort: "desc",
  };
  
  if (contractAddress) {
    // Normalize contract address to lowercase
    params.contractaddress = contractAddress.toLowerCase();
  }
  
  try {
    const data = await explorer(params, cacheKey);
    
    // Handle successful response with results
    if (data.status === "1" && Array.isArray(data.result)) {
      return data.result;
    }
    
    // Handle status "0" with empty results (no transactions found)
    // This is a valid response, not an error
    if (data.status === "0") {
      const message = (data.message || "").toLowerCase();
      if (message.includes("no transactions") || 
          message.includes("no records") || 
          message === "ok" ||
          (Array.isArray(data.result) && data.result.length === 0)) {
        logger.debug("No token transfers found", {
          address,
          chainId,
          contractAddress,
        });
        return [];
      }
    }
    
    // If we get here and status is "0", log it but don't throw
    if (data.status === "0") {
      logger.warn("Unexpected API response", {
        address,
        chainId,
        contractAddress,
        message: data.message,
        result: data.result,
      });
    }
    
    return [];
  } catch (error) {
    // Only log actual errors, not "no transactions" cases
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (!errorMessage.includes("No transactions") && 
        !errorMessage.includes("No records")) {
      logger.error("Error fetching token transfers", {
        address,
        chainId,
        contractAddress,
        error: errorMessage,
      });
    }
    return [];
  }
}

/**
 * Get rate limit stats
 * Note: If using the same API key, stats will be shared between Etherscan and Polygonscan
 */
export function getRateLimitStats() {
  if (useSharedRateLimiter) {
    const sharedStats = etherscanRateLimiter.getStats();
    return {
      etherscan: sharedStats,
      polygonscan: sharedStats,
      note: "Shared rate limiter (same API key used for both)",
    };
  }
  
  return {
    etherscan: etherscanRateLimiter.getStats(),
    polygonscan: polygonscanRateLimiter.getStats(),
    note: "Separate rate limiters (different API keys)",
  };
}

/**
 * Clear cache
 */
export function clearExplorerCache() {
  etherscanRateLimiter.clearCache();
  if (!useSharedRateLimiter) {
    polygonscanRateLimiter.clearCache();
  }
}

/**
 * Check if using shared rate limiter
 */
export function isUsingSharedRateLimiter(): boolean {
  return Boolean(useSharedRateLimiter);
}

