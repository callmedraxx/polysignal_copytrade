/**
 * Rate limiter for Polymarket API calls
 * Implements token bucket algorithm to respect API rate limits
 * 
 * Based on Polymarket API rate limits:
 * - CLOB API Keys: 50 requests / 10s
 * - CLOB POST /order: 2400 requests / 10s (burst), 24000 requests / 10 minutes (40/s sustained)
 * 
 * Reference: https://docs.polymarket.com/quickstart/introduction/rate-limits
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  burstAllowance?: number; // Optional burst allowance
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();

  /**
   * Register a rate limit configuration
   */
  registerLimit(name: string, config: RateLimitConfig): void {
    this.configs.set(name, config);
  }

  /**
   * Check if a request is allowed and wait if necessary
   * Returns the delay in milliseconds if throttled, 0 if allowed immediately
   */
  async waitIfNeeded(name: string): Promise<number> {
    const config = this.configs.get(name);
    if (!config) {
      // No rate limit configured, allow immediately
      return 0;
    }

    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    // Get or create request history for this limit
    if (!this.requests.has(name)) {
      this.requests.set(name, []);
    }
    
    const requestHistory = this.requests.get(name)!;
    
    // Remove old requests outside the window
    const recentRequests = requestHistory.filter(timestamp => timestamp > windowStart);
    this.requests.set(name, recentRequests);
    
    // Check if we're at the limit
    const maxRequests = config.burstAllowance && recentRequests.length < config.burstAllowance
      ? config.burstAllowance
      : config.maxRequests;
    
    if (recentRequests.length >= maxRequests) {
      // Calculate delay until oldest request expires
      const oldestRequest = recentRequests[0];
      const delay = (oldestRequest + config.windowMs) - now;
      
      if (delay > 0) {
        // Wait for the delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Try again after delay
        return this.waitIfNeeded(name);
      }
    }
    
    // Record this request
    recentRequests.push(now);
    this.requests.set(name, recentRequests);
    
    return 0;
  }

  /**
   * Get current request count in the window
   */
  getCurrentCount(name: string): number {
    const config = this.configs.get(name);
    if (!config) return 0;
    
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const requestHistory = this.requests.get(name) || [];
    
    return requestHistory.filter(timestamp => timestamp > windowStart).length;
  }

  /**
   * Clear request history (useful for testing)
   */
  clear(name?: string): void {
    if (name) {
      this.requests.delete(name);
    } else {
      this.requests.clear();
    }
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimiter();

// Register Polymarket API rate limits
// CLOB API Keys: 50 requests / 10s
rateLimiter.registerLimit('clob-api-keys', {
  maxRequests: 50,
  windowMs: 10000, // 10 seconds
});

// CLOB POST /order: 2400 requests / 10s (burst), 24000 requests / 10 minutes (40/s sustained)
// We'll use the sustained rate limit (40/s = 2400/60s) to be safe
rateLimiter.registerLimit('clob-post-order', {
  maxRequests: 2400, // Burst allowance
  windowMs: 10000, // 10 seconds
  burstAllowance: 2400, // Allow burst up to 2400 in 10s
});

// Also enforce sustained rate: 40/s = 2400 per minute
rateLimiter.registerLimit('clob-post-order-sustained', {
  maxRequests: 2400, // 40/s * 60s = 2400 per minute
  windowMs: 60000, // 1 minute
});

// CLOB DELETE /order: Same limits as POST
rateLimiter.registerLimit('clob-delete-order', {
  maxRequests: 2400,
  windowMs: 10000,
  burstAllowance: 2400,
});

rateLimiter.registerLimit('clob-delete-order-sustained', {
  maxRequests: 2400,
  windowMs: 60000,
});

// CLOB Markets: 250 requests / 10s
rateLimiter.registerLimit('clob-markets', {
  maxRequests: 250,
  windowMs: 10000,
});

// CLOB /book: 200 requests / 10s
rateLimiter.registerLimit('clob-book', {
  maxRequests: 200,
  windowMs: 10000,
});

// Data API: 200 requests / 10s
rateLimiter.registerLimit('data-api', {
  maxRequests: 200,
  windowMs: 10000,
});

/**
 * Wait for rate limit before making a request
 */
export async function waitForRateLimit(limitName: string): Promise<void> {
  await rateLimiter.waitIfNeeded(limitName);
}

/**
 * Get current request count for a rate limit
 */
export function getRateLimitCount(limitName: string): number {
  return rateLimiter.getCurrentCount(limitName);
}

