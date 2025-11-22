import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { getClobProxyAgent, isClobProxyEnabled } from '../utils/proxy-agent';
import { createProxyDataTracker, ProxyDataUsage } from '../utils/proxy-data-tracker';
import type { ProxyDataTracker } from '../utils/proxy-data-tracker';

const CLOB_API_URL = config.polymarket.clobApiUrl || 'https://clob.polymarket.com';
/**
 * Get market information from CLOB API
 * Handles both market slugs and condition IDs
 */
export async function getMarketInfo(marketId: string): Promise<any> {
  // If it's a condition ID (starts with 0x), try to find market slug first
  if (marketId.startsWith('0x')) {
    // Try fetching from Polymarket Data API to get market slug
    try {
      // Rate limit Data API requests: 200 requests / 10s
      const { waitForRateLimit } = await import('./rate-limiter');
      await waitForRateLimit('data-api');
      
      const dataApiUrl = config.polymarket.dataApiUrl;
      const response = await fetch(`${dataApiUrl}/markets?condition_id=${marketId}&limit=1`);
      if (response.ok) {
        const markets: any = await response.json();
        if (markets && Array.isArray(markets) && markets.length > 0 && markets[0]?.slug) {
          marketId = markets[0].slug;
          logger.debug('Converted condition ID to market slug', {
            conditionId: marketId,
            slug: markets[0].slug,
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to convert condition ID to slug, trying direct fetch', {
        marketId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
  
  // Rate limit market info requests: 250 requests / 10s
  const { waitForRateLimit } = await import('./rate-limiter');
  await waitForRateLimit('clob-markets');
  
  const response = await fetch(`${CLOB_API_URL}/markets/${marketId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch market ${marketId}: ${response.statusText}`);
  }
  
  const marketInfo: any = await response.json();
  
  // Log token structure for debugging
  if (marketInfo.tokens && Array.isArray(marketInfo.tokens) && marketInfo.tokens.length > 0) {
    logger.debug('Market tokens structure', {
      marketId,
      tokenCount: marketInfo.tokens.length,
      firstTokenType: typeof marketInfo.tokens[0],
      firstToken: marketInfo.tokens[0],
    });
  }
  
  return marketInfo;
}

/**
 * Get order book for a token
 * Respects rate limits: 200 requests / 10s
 */
export async function getOrderBook(tokenId: string): Promise<any> {
  // Rate limit order book requests: 200 requests / 10s
  const { waitForRateLimit } = await import('./rate-limiter');
  await waitForRateLimit('clob-book');
  
  const response = await fetch(`${CLOB_API_URL}/book?token_id=${tokenId}`);
  
  if (!response.ok) {
    // Try to get error details from response
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json() as any;
      if (errorData?.error) {
        errorMessage = errorData.error;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // If JSON parsing fails, use statusText
    }
    
    throw new Error(`Failed to fetch order book for token ${tokenId}: ${errorMessage}`);
  }
  
  return await response.json();
}

/**
 * Create a buy order
 * @param negRisk Set to false for negrisk markets (required by Polymarket)
 */
export async function createBuyOrder(
  clobClient: ClobClient,
  tokenId: string,
  price: number,
  size: string,
  negRisk?: boolean
): Promise<any> {
  // negRisk is passed in options, not in userOrder
  const options: any = {};
  if (negRisk !== undefined) {
    options.negRisk = negRisk;
  }
  
  return await clobClient.createOrder(
    {
    price,
    side: Side.BUY,
    size: parseFloat(size), // Convert string to number
    tokenID: tokenId,
    },
    options // negRisk flag goes in options
  );
}

/**
 * Create a sell order
 * @param negRisk Set to false for negrisk markets (required by Polymarket)
 */
export async function createSellOrder(
  clobClient: ClobClient,
  tokenId: string,
  price: number,
  size: string,
  negRisk?: boolean
): Promise<any> {
  // negRisk is passed in options (CreateOrderOptions), not in userOrder
  // The library will auto-detect tickSize if not provided
  // For negrisk markets, we MUST set negRisk: false explicitly
  const options: any = {};
  if (negRisk !== undefined) {
    options.negRisk = negRisk;
  }
  
  return await clobClient.createOrder(
    {
    price,
    side: Side.SELL,
    size: parseFloat(size), // Convert string to number
    tokenID: tokenId,
    },
    Object.keys(options).length > 0 ? options : undefined // Only pass options if negRisk is set
  );
}

/**
 * Apply proxy patch for CLOB API requests (for BUY orders only)
 * Returns cleanup function to restore original functions
 */
export function applyClobProxyPatch(): { cleanup: () => void } | null {
  if (!isClobProxyEnabled()) {
    return null;
  }

  const agent = getClobProxyAgent();
  if (!agent) {
    return null;
  }

  // Detect proxy type from URL
  const proxyUrl = config.proxy?.clobProxyUrl || config.proxy?.url || '';
  const isSocks5 = proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks5h://') || proxyUrl.startsWith('socks://');
  const proxyType = isSocks5 ? 'SOCKS5' : 'HTTPS';

  try {
    const https = require('https');
    const http = require('http');
    const tls = require('tls');
    
    // Store original functions
    const originalHttpsRequest = https.request;
    const originalHttpRequest = http.request;
    const originalTlsConnect = tls.connect;
    (tls as any)._originalConnect = originalTlsConnect;
    
    // CRITICAL: Patch TLS connect to ALWAYS disable SSL verification for ALL connections
    // When using a proxy, ALL TLS connections during buy execution should bypass verification
    const originalCreateSecureContext = tls.createSecureContext;
    (tls as any)._originalCreateSecureContext = originalCreateSecureContext;
    
    // Patch createSecureContext to disable SSL verification
    tls.createSecureContext = function(options: any) {
      if (options) {
        options.rejectUnauthorized = false;
        options.checkServerIdentity = () => undefined;
      }
      return originalCreateSecureContext.call(this, options);
    };
    
    // Patch TLS connect to disable SSL verification for proxied connections
    tls.connect = function(...args: any[]) {
      const options = typeof args[0] === 'object' ? args[0] : args[2] || {};
      // For proxy connections, ALWAYS disable SSL verification for CLOB requests
      if (options.servername === 'clob.polymarket.com' || 
          options.hostname === 'clob.polymarket.com' ||
          (options.host && options.host.includes('clob.polymarket.com'))) {
        options.rejectUnauthorized = false;
        options.checkServerIdentity = () => undefined; // Skip hostname verification
        if (typeof args[0] === 'object') {
          args[0] = options;
        } else {
          args[2] = options;
        }
      }
      return originalTlsConnect.apply(this, args);
    };
    
    // Patch https.request to use proxy agent for CLOB API requests
    https.request = function(options: any, callback?: any) {
      // Only use proxy for CLOB API requests
      if (options.hostname === 'clob.polymarket.com' || 
          (options.host && options.host.includes('clob.polymarket.com'))) {
        options.agent = agent;
        // ALWAYS disable SSL verification for proxied CLOB requests
        options.rejectUnauthorized = false;
        options.checkServerIdentity = () => undefined;
        if (!options.secureOptions) {
          options.secureOptions = 0;
        }
        logger.debug(`Using ${proxyType} proxy agent for CLOB BUY order`, {
          hostname: options.hostname,
          host: options.host,
          rejectUnauthorized: false,
          proxyType: proxyType,
        });
      }
      return originalHttpsRequest.call(this, options, callback);
    };
    
    // Also patch http.request (though CLOB uses HTTPS)
    http.request = function(options: any, callback?: any) {
      if (options.hostname === 'clob.polymarket.com' || 
          (options.host && options.host.includes('clob.polymarket.com'))) {
        options.agent = agent;
        if (options.rejectUnauthorized !== undefined) {
          options.rejectUnauthorized = false;
        }
        options.checkServerIdentity = () => undefined;
      }
      return originalHttpRequest.call(this, options, callback);
    };

    logger.info(`Applied ${proxyType} proxy patch for CLOB BUY order`);
    
    // Return cleanup function
    return {
      cleanup: () => {
        try {
          const https = require('https');
          const http = require('http');
          const tls = require('tls');
          https.request = originalHttpsRequest;
          http.request = originalHttpRequest;
          if ((tls as any)._originalConnect) {
            tls.connect = (tls as any)._originalConnect;
            delete (tls as any)._originalConnect;
          }
          if ((tls as any)._originalCreateSecureContext) {
            tls.createSecureContext = (tls as any)._originalCreateSecureContext;
            delete (tls as any)._originalCreateSecureContext;
          }
          logger.debug(`Cleaned up ${proxyType} proxy patch`);
        } catch (error) {
          logger.warn('Error during proxy patch cleanup', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    };
  } catch (error) {
    logger.warn('Failed to apply proxy patch', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Submit order to CLOB (automatically adds builder headers)
 * Respects rate limits: 2400 req/10s burst, 24000 req/10min sustained (40/s)
 * Returns order response and proxy data usage if proxy was used
 * 
 * NOTE: Proxy is ONLY used for BUY orders, not for SELL orders or other CLOB requests
 */
export async function submitOrder(
  clobClient: ClobClient,
  order: any
): Promise<{ orderId: string; status: string; proxyDataUsage?: ProxyDataUsage; proxyType?: string }> {
  try {
    // Rate limit order submission
    // Check both burst and sustained limits
    const { waitForRateLimit } = await import('./rate-limiter');
    
    // Wait for burst limit (2400/10s)
    await waitForRateLimit('clob-post-order');
    
    // Also check sustained limit (2400/60s = 40/s)
    await waitForRateLimit('clob-post-order-sustained');
    
    // Check if this is a BUY order - proxy is ONLY used for buy orders
    const isBuyOrder = order.side === 'BUY' || order.side === Side.BUY || order.side === 0;
    
    logger.info('submitOrder called', {
      orderSide: order.side,
      isBuyOrder,
      orderId: order.orderId || 'pending',
    });
    
      let response;
      let dataTracker: ProxyDataTracker | undefined;
      let dataTrackerCleanup: (() => void) | undefined;
      let proxyType: string | undefined;
      let proxyDataUsage: ProxyDataUsage | undefined;
      let axiosPatchState: { 
        patched: boolean; 
        originalDefaults?: number; 
        originalCreate?: any;
        originalRequest?: any;
        originalMethods?: { [key: string]: any };
      } = { patched: false, originalMethods: {} };
      
      try {
        // Use proxy ONLY for BUY orders if enabled
        // Prefer CLOB-specific proxy (for local machine routing) over general proxy (Oxylabs)
        // The @polymarket/clob-client uses axios internally, which uses Node.js http/https modules
        // We need to patch https.request to inject the proxy agent
        let axiosPatched = false;
        let originalHttpsRequest: any;
        let originalHttpRequest: any;
        
        logger.info('Checking if proxy should be used for order submission', {
          isBuyOrder,
          isClobProxyEnabled: isClobProxyEnabled(),
          willUseProxy: isBuyOrder && isClobProxyEnabled(),
        });
        
        if (isBuyOrder && isClobProxyEnabled()) {
          logger.info('Proxy is enabled for BUY order - starting axios and HTTPS patching');
        const agent = getClobProxyAgent();
        if (agent) {
          try {
            // Determine proxy type
            proxyType = config.proxy?.clobProxyUrl ? 'CLOB_PROXY_URL' : 'general_proxy';
            
            // Start tracking data usage
            const trackerResult = createProxyDataTracker();
            dataTracker = trackerResult.tracker;
            dataTrackerCleanup = trackerResult.cleanup;
            
            // Patch Node.js https.request to use proxy agent for CLOB API requests
            // This works because axios uses Node.js http/https modules internally
            const https = require('https');
            const http = require('http');
            const tls = require('tls');
            
            // Store original functions
            originalHttpsRequest = https.request;
            originalHttpRequest = http.request;
            const originalTlsConnect = tls.connect;
            // Store original for cleanup
            (tls as any)._originalConnect = originalTlsConnect;
            
            // Also patch axios to increase redirect limit for proxy requests
            // WHY maxRedirects is needed when using proxy:
            // When using HTTPS proxies (like Oxylabs), the proxy intercepts the connection and may:
            // 1. Perform internal load balancing by redirecting to different proxy servers
            // 2. Handle authentication/authorization redirects
            // 3. Route through multiple proxy nodes for geographic distribution
            // 4. Perform SSL termination and re-encryption, which can trigger redirects
            // Without increasing maxRedirects, axios's default limit (usually 5) can be exceeded,
            // causing "Maximum number of redirects exceeded" errors even for valid requests.
            // We set it to 100 to accommodate these proxy-internal redirects while still preventing infinite loops.
            // The Oxylabs proxy may perform many internal redirects for load balancing and routing.
            // Some proxies can have very long redirect chains, so we use a high limit.
            try {
              const axios = require('axios');
              
              // Log current axios state before patching
              logger.info('Patching axios for proxy redirects', {
                currentMaxRedirects: axios.defaults?.maxRedirects,
                axiosVersion: axios.VERSION || 'unknown',
              });
              
              // Add axios interceptors to track redirects in real-time
              // This will log every request/response and track redirect chains
              const requestInterceptor = axios.interceptors.request.use(
                (config: any) => {
                  // Track redirect count if available
                  const redirectCount = config._redirectCount || 0;
                  if (redirectCount > 0) {
                    logger.debug('🔄 Axios redirect detected', {
                      redirectNumber: redirectCount,
                      url: config.url,
                      method: config.method,
                      maxRedirects: config.maxRedirects,
                      previousUrl: config._previousUrl,
                    });
                  } else {
                    logger.debug('📤 Axios initial request', {
                      url: config.url,
                      method: config.method,
                      maxRedirects: config.maxRedirects,
                      baseURL: config.baseURL,
                    });
                  }
                  return config;
                },
                (error: any) => {
                  logger.error('Axios request interceptor error', {
                    error: error.message,
                    stack: error.stack,
                  });
                  return Promise.reject(error);
                }
              );
              
              const responseInterceptor = axios.interceptors.response.use(
                (response: any) => {
                  // Check if this is a redirect response
                  const status = response.status;
                  const location = response.headers?.location;
                  
                  if (status >= 300 && status < 400 && location) {
                    logger.info('🔄 Axios redirect response detected', {
                      status,
                      location,
                      url: response.config?.url,
                      redirectCount: response.config?._redirectCount || 0,
                      maxRedirects: response.config?.maxRedirects,
                    });
                  }
                  
                  return response;
                },
                (error: any) => {
                  // Log ALL errors, especially redirect errors
                  if (error?.message?.includes('redirect') || 
                      error?.message?.includes('Maximum number of redirects') ||
                      error?.code === 'ERR_TOO_MANY_REDIRECTS') {
                    logger.error('🔴 REDIRECT ERROR in axios interceptor (BEFORE CLOB client wraps it)', {
                      message: error.message,
                      code: error.code,
                      config: error.config ? {
                        url: error.config.url,
                        method: error.config.method,
                        maxRedirects: error.config.maxRedirects,
                        baseURL: error.config.baseURL,
                        _redirectCount: error.config._redirectCount,
                        _previousUrl: error.config._previousUrl,
                      } : 'no config',
                      response: error.response ? {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        location: error.response.headers?.location,
                        headers: Object.keys(error.response.headers || {}),
                      } : 'no response',
                      request: error.request ? {
                        path: error.request.path,
                        method: error.request.method,
                      } : 'no request',
                      stack: error.stack,
                    });
                    
                    // Also log to console for immediate visibility
                    console.error('🔴 REDIRECT ERROR (axios interceptor):', {
                      message: error.message,
                      code: error.code,
                      url: error.config?.url,
                      maxRedirects: error.config?.maxRedirects,
                      redirectCount: error.config?._redirectCount,
                    });
                  }
                  return Promise.reject(error);
                }
              );
              
              // Store interceptors for cleanup
              (axios as any)._redirectInterceptors = {
                request: requestInterceptor,
                response: responseInterceptor,
              };
              
              // Increase maxRedirects for axios during order submission
              // Patch both defaults and the create function to ensure all instances get the limit
              if (axios.defaults) {
                axiosPatchState.originalDefaults = axios.defaults.maxRedirects;
                axios.defaults.maxRedirects = 100; // Very high limit for proxy redirects
                axiosPatchState.patched = true;
                logger.info('Patched axios.defaults.maxRedirects', {
                  original: axiosPatchState.originalDefaults,
                  new: axios.defaults.maxRedirects,
                });
              }
              
              // Also patch axios.create to ensure new instances have the increased limit AND interceptors
              axiosPatchState.originalCreate = axios.create;
              axios.create = function(config: any) {
                const finalConfig = {
                  ...config,
                  maxRedirects: config?.maxRedirects ?? 100, // Ensure new instances also have high limit
                };
                logger.debug('Creating axios instance with maxRedirects', {
                  maxRedirects: finalConfig.maxRedirects,
                  url: config?.url || 'unknown',
                });
                const instance = axiosPatchState.originalCreate!.call(this, finalConfig);
                // Also patch the instance's defaults
                if (instance.defaults) {
                  instance.defaults.maxRedirects = 100;
                }
                
                // Add interceptors to the new instance as well (CLOB client might use its own instance)
                const instanceRequestInterceptor = instance.interceptors.request.use(
                  (config: any) => {
                    const redirectCount = config._redirectCount || 0;
                    if (redirectCount > 0) {
                      logger.debug('🔄 Axios instance redirect detected', {
                        redirectNumber: redirectCount,
                        url: config.url,
                        method: config.method,
                        maxRedirects: config.maxRedirects,
                      });
                    } else {
                      logger.debug('📤 Axios instance initial request', {
                        url: config.url,
                        method: config.method,
                        maxRedirects: config.maxRedirects,
                      });
                    }
                    return config;
                  },
                  (error: any) => Promise.reject(error)
                );
                
                const instanceResponseInterceptor = instance.interceptors.response.use(
                  (response: any) => {
                    const status = response.status;
                    const location = response.headers?.location;
                    if (status >= 300 && status < 400 && location) {
                      logger.info('🔄 Axios instance redirect response', {
                        status,
                        location,
                        url: response.config?.url,
                        maxRedirects: response.config?.maxRedirects,
                      });
                    }
                    return response;
                  },
                  (error: any) => {
                    if (error?.message?.includes('redirect') || 
                        error?.message?.includes('Maximum number of redirects') ||
                        error?.code === 'ERR_TOO_MANY_REDIRECTS') {
                      logger.error('🔴 REDIRECT ERROR in axios instance (BEFORE CLOB client wraps it)', {
                        message: error.message,
                        code: error.code,
                        config: error.config ? {
                          url: error.config.url,
                          method: error.config.method,
                          maxRedirects: error.config.maxRedirects,
                          baseURL: error.config.baseURL,
                        } : 'no config',
                        response: error.response ? {
                          status: error.response.status,
                          location: error.response.headers?.location,
                        } : 'no response',
                      });
                      console.error('🔴 REDIRECT ERROR (axios instance):', {
                        message: error.message,
                        code: error.code,
                        url: error.config?.url,
                        maxRedirects: error.config?.maxRedirects,
                      });
                    }
                    return Promise.reject(error);
                  }
                );
                
                // Store interceptors for cleanup
                (instance as any)._redirectInterceptors = {
                  request: instanceRequestInterceptor,
                  response: instanceResponseInterceptor,
                };
                
                return instance;
              };
              
              // Also patch the default axios instance's request method to ensure all requests get the limit
              axiosPatchState.originalRequest = axios.request;
              axios.request = function(config: any) {
                if (!config) config = {};
                if (config.maxRedirects === undefined) {
                  config.maxRedirects = 100;
                }
                logger.debug('Axios request with maxRedirects', {
                  maxRedirects: config.maxRedirects,
                  method: config.method || 'GET',
                  url: config.url || 'unknown',
                });
                const promise = axiosPatchState.originalRequest!.call(this, config);
                // Add error handler to log redirect details
                promise.catch((error: any) => {
                  if (error?.message?.includes('redirect')) {
                    logger.error('Axios redirect error detected', {
                      message: error.message,
                      code: error.code,
                      config: {
                        url: error.config?.url,
                        method: error.config?.method,
                        maxRedirects: error.config?.maxRedirects,
                      },
                      response: error.response ? {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        headers: error.response.headers,
                      } : undefined,
                      stack: error.stack,
                    });
                  }
                });
                return promise;
              };
              
              // Patch all HTTP methods on default instance
              ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].forEach(method => {
                const originalMethod = axios[method];
                if (originalMethod) {
                  axiosPatchState.originalMethods![method] = originalMethod;
                  axios[method] = function(url: string, config: any) {
                    if (!config) config = {};
                    if (config.maxRedirects === undefined) {
                      config.maxRedirects = 100;
                    }
                    logger.debug(`Axios ${method} with maxRedirects`, {
                      maxRedirects: config.maxRedirects,
                      url: url,
                    });
                    const promise = originalMethod.call(this, url, config);
                    // Add error handler to log redirect details
                    promise.catch((error: any) => {
                      if (error?.message?.includes('redirect')) {
                        logger.error(`Axios ${method} redirect error`, {
                          message: error.message,
                          code: error.code,
                          url: url,
                          maxRedirects: config.maxRedirects,
                          response: error.response ? {
                            status: error.response.status,
                            statusText: error.response.statusText,
                            headers: error.response.headers,
                          } : undefined,
                        });
                      }
                    });
                    return promise;
                  };
                }
              });
              
              logger.info('Axios patching completed', {
                defaultsMaxRedirects: axios.defaults?.maxRedirects,
                patched: axiosPatchState.patched,
              });
            } catch (axiosError) {
              logger.error('Failed to patch axios redirects for order submission', {
                error: axiosError instanceof Error ? axiosError.message : 'Unknown',
                stack: axiosError instanceof Error ? axiosError.stack : undefined,
              });
            }
            
            // Patch TLS connect to disable SSL verification for proxied connections
            tls.connect = function(...args: any[]) {
              const options = typeof args[0] === 'object' ? args[0] : args[2] || {};
              // If connecting through proxy, disable SSL verification
              if (options.servername === 'clob.polymarket.com' || 
                  options.hostname === 'clob.polymarket.com' ||
                  (options.host && options.host.includes('clob.polymarket.com'))) {
                options.rejectUnauthorized = false;
                options.checkServerIdentity = () => undefined; // Skip hostname verification
                if (typeof args[0] === 'object') {
                  args[0] = options;
                } else {
                  args[2] = options;
                }
              }
              return originalTlsConnect.apply(this, args);
            };
            
            // Patch https.request to use proxy agent for CLOB API requests
            // Also disable SSL verification for proxied requests
            https.request = function(options: any, callback?: any) {
              // Only use proxy for CLOB API requests
              if (options.hostname === 'clob.polymarket.com' || 
                  (options.host && options.host.includes('clob.polymarket.com'))) {
                options.agent = agent;
                // CRITICAL: Disable SSL certificate verification when using proxy
                // The Oxylabs proxy intercepts the connection, so the SSL certificate is from the proxy (*.bc.pr.oxylabs.io)
                // not from clob.polymarket.com, which causes certificate mismatch errors
                options.rejectUnauthorized = false;
                options.checkServerIdentity = () => undefined; // Skip hostname verification
                // Also ensure TLS options are set correctly
                if (!options.secureOptions) {
                  options.secureOptions = 0; // Disable SSL verification at TLS level too
                }
                logger.debug('Using Oxylabs proxy agent for CLOB BUY order', {
                  hostname: options.hostname,
                  host: options.host,
                  rejectUnauthorized: false,
                  proxyType: proxyType,
                });
              }
              return originalHttpsRequest.call(this, options, callback);
            };
            
            // Also patch http.request (though CLOB uses HTTPS)
            http.request = function(options: any, callback?: any) {
              if (options.hostname === 'clob.polymarket.com' || 
                  (options.host && options.host.includes('clob.polymarket.com'))) {
                options.agent = agent;
                // Disable SSL certificate verification when using proxy
                if (options.rejectUnauthorized !== undefined) {
                  options.rejectUnauthorized = false;
                }
                options.checkServerIdentity = () => undefined;
              }
              return originalHttpRequest.call(this, options, callback);
            };
            
            axiosPatched = true;
            const proxyTypeLabel = config.proxy?.clobProxyUrl ? 'CLOB-specific (Oxylabs residential)' : 'general (Oxylabs)';
            const axios = require('axios');
            logger.info('Using proxy for BUY order submission', {
              proxyEnabled: true,
              proxyType: proxyTypeLabel,
              method: 'https.request patch',
              orderSide: 'BUY',
              maxRedirects: 100, // Very high redirect limit for proxy
              axiosConfiguration: {
                defaultsMaxRedirects: axios.defaults?.maxRedirects,
                axiosVersion: axios.VERSION,
                hasHttpsAgent: !!agent,
                proxyUrl: config.proxy?.clobProxyUrl ? 'configured' : 'not configured',
              },
            });
            
            // Log detailed axios state before order submission
            logger.debug('Axios state before order submission', {
              defaults: {
                maxRedirects: axios.defaults?.maxRedirects,
                timeout: axios.defaults?.timeout,
                baseURL: axios.defaults?.baseURL,
              },
              patched: axiosPatchState.patched,
              originalDefaults: axiosPatchState.originalDefaults,
            });
          } catch (patchError) {
            logger.warn('Failed to patch https.request for proxy', {
              error: patchError instanceof Error ? patchError.message : 'Unknown error',
            });
          }
        }
      }
      
      try {
        // Use FOK (Fill-or-Kill) order type to ensure orders are filled immediately or cancelled
        // FOK orders must be filled entirely or not at all - no partial fills, no limit orders
        const axios = require('axios');
        logger.info('Submitting order with FOK (Fill-or-Kill) order type', {
          orderId: order.orderId || 'pending',
          side: order.side,
          price: order.price,
          size: order.size,
          orderType: 'FOK',
          proxyEnabled: isBuyOrder && isClobProxyEnabled(),
          axiosState: {
            maxRedirects: axios.defaults?.maxRedirects,
            axiosPatched: axiosPatchState.patched,
          },
        });
        
        // Log axios state right before making the request
        const proxyAgent = isBuyOrder && isClobProxyEnabled() ? getClobProxyAgent() : null;
        logger.debug('Axios state immediately before postOrder call', {
          defaultsMaxRedirects: axios.defaults?.maxRedirects,
          axiosPatched: axiosPatchState.patched,
          proxyEnabled: isBuyOrder && isClobProxyEnabled(),
          proxyAgent: proxyAgent ? 'present' : 'missing',
        });
        
        // Wrap the postOrder call to capture detailed error information
        try {
          response = await clobClient.postOrder(order, OrderType.FOK);
          console.log('Buy order response', response);
        } catch (orderError: any) {
          // Log comprehensive error details for redirect issues
          // Check for nested/cause errors (CLOB client may wrap axios errors)
          const errorDetails: any = {
            message: orderError?.message || 'Unknown error',
            name: orderError?.name,
            code: orderError?.code,
            stack: orderError?.stack,
            hasCause: !!orderError?.cause,
            causeMessage: orderError?.cause?.message,
            causeCode: orderError?.cause?.code,
          };
          
          // Check if the error message or cause mentions redirects
          const isRedirectError = 
            orderError?.message?.includes('redirect') || 
            orderError?.message?.includes('Maximum number of redirects') ||
            orderError?.code === 'ERR_TOO_MANY_REDIRECTS' ||
            orderError?.cause?.message?.includes('redirect') ||
            orderError?.cause?.message?.includes('Maximum number of redirects') ||
            orderError?.cause?.code === 'ERR_TOO_MANY_REDIRECTS';
          
          if (isRedirectError) {
            console.error('🔴 REDIRECT ERROR DETECTED (before detailed logging)');
            console.error('Error message:', orderError?.message);
            console.error('Error code:', orderError?.code);
            console.error('Cause message:', orderError?.cause?.message);
            console.error('Cause code:', orderError?.cause?.code);
          }
          
          // If it's an axios error, capture more details
          // Check both the error and its cause for axios error properties
          const axiosError = orderError?.isAxiosError ? orderError : (orderError?.cause?.isAxiosError ? orderError.cause : null);
          const errorConfig = orderError?.config || orderError?.cause?.config;
          
          if (axiosError || errorConfig) {
            errorDetails.axiosError = {
              url: errorConfig?.url,
              method: errorConfig?.method,
              baseURL: errorConfig?.baseURL,
              maxRedirects: errorConfig?.maxRedirects,
              headers: errorConfig?.headers,
              proxy: errorConfig?.proxy,
              httpsAgent: errorConfig?.httpsAgent ? 'present' : 'missing',
            };
            
            const errorResponse = orderError?.response || orderError?.cause?.response;
            if (errorResponse) {
              errorDetails.response = {
                status: errorResponse.status,
                statusText: errorResponse.statusText,
                headers: errorResponse.headers,
                data: errorResponse.data,
              };
            }
            
            const errorRequest = orderError?.request || orderError?.cause?.request;
            if (errorRequest) {
              errorDetails.request = {
                path: errorRequest.path,
                method: errorRequest.method,
                headers: errorRequest.headers,
              };
            }
          }
          
          // Check if it's a redirect error (check both error and cause)
          if (isRedirectError) {
            const axios = require('axios');
            const proxyUrl = config.proxy?.clobProxyUrl || config.proxy?.url || '';
            logger.error('🔴 MAXIMUM REDIRECTS EXCEEDED - Detailed Analysis', {
              error: errorDetails,
              axiosConfiguration: {
                defaultsMaxRedirects: axios.defaults?.maxRedirects,
                defaultsBaseURL: axios.defaults?.baseURL,
                defaultsTimeout: axios.defaults?.timeout,
                defaultsValidateStatus: axios.defaults?.validateStatus,
              },
              axiosInstanceConfig: errorConfig ? {
                maxRedirects: errorConfig.maxRedirects,
                url: errorConfig.url,
                method: errorConfig.method,
                baseURL: errorConfig.baseURL,
                timeout: errorConfig.timeout,
                validateStatus: errorConfig.validateStatus,
                httpsAgent: errorConfig.httpsAgent ? {
                  protocol: errorConfig.httpsAgent?.protocol,
                  host: errorConfig.httpsAgent?.host,
                  port: errorConfig.httpsAgent?.port,
                } : 'missing',
                httpAgent: errorConfig.httpAgent ? 'present' : 'missing',
                proxy: errorConfig.proxy,
                headers: Object.keys(errorConfig.headers || {}),
              } : 'no config',
              proxyConfiguration: {
                enabled: isBuyOrder && isClobProxyEnabled(),
                proxyUrl: config.proxy?.clobProxyUrl ? 'configured' : 'not configured',
                proxyType: proxyUrl ? (proxyUrl.startsWith('socks5') ? 'SOCKS5' : 'HTTPS') : 'unknown',
              },
              axiosPatchState: {
                patched: axiosPatchState.patched,
                originalDefaults: axiosPatchState.originalDefaults,
                hasOriginalCreate: !!axiosPatchState.originalCreate,
                hasOriginalRequest: !!axiosPatchState.originalRequest,
                patchedMethods: Object.keys(axiosPatchState.originalMethods || {}),
              },
              redirectChain: orderError?.response?.headers?.location ? {
                location: orderError.response.headers.location,
                status: orderError.response.status,
              } : 'no location header',
              requestDetails: orderError?.request ? {
                path: orderError.request.path,
                method: orderError.request.method,
                host: orderError.request.host,
                protocol: orderError.request.protocol,
              } : 'no request object',
              timestamp: new Date().toISOString(),
            });
            
            // Also log to console for immediate visibility
            console.error('🔴 MAXIMUM REDIRECTS EXCEEDED ERROR:', {
              message: orderError?.message,
              code: orderError?.code,
              maxRedirects: orderError?.config?.maxRedirects,
              axiosDefaultsMaxRedirects: axios.defaults?.maxRedirects,
              url: orderError?.config?.url,
              proxyEnabled: isBuyOrder && isClobProxyEnabled(),
            });
          }
          
          // Re-throw the error
          throw orderError;
        }
        
        // Wait a bit for all response data to be received before getting usage stats
        if (dataTracker) {
          await new Promise(resolve => setTimeout(resolve, 200));
          proxyDataUsage = dataTracker.getUsage();
          logger.debug('Proxy data usage tracked', {
            orderId: response?.orderId || 'pending',
            ...proxyDataUsage,
          });
        }
      } finally {
        // Restore original http/https.request and tls.connect if we patched them
        if (axiosPatched && originalHttpsRequest && originalHttpRequest) {
          try {
            const https = require('https');
            const http = require('http');
            const tls = require('tls');
            https.request = originalHttpsRequest;
            http.request = originalHttpRequest;
            // Restore TLS connect if we patched it
            if ((tls as any)._originalConnect) {
              tls.connect = (tls as any)._originalConnect;
              delete (tls as any)._originalConnect;
            }
            
            // Remove axios interceptors if we added them
            const axios = require('axios');
            if ((axios as any)._redirectInterceptors) {
              try {
                axios.interceptors.request.eject((axios as any)._redirectInterceptors.request);
                axios.interceptors.response.eject((axios as any)._redirectInterceptors.response);
                delete (axios as any)._redirectInterceptors;
                logger.debug('Removed axios redirect interceptors');
              } catch (ejectError) {
                logger.warn('Failed to remove axios interceptors', {
                  error: ejectError instanceof Error ? ejectError.message : 'Unknown',
                });
              }
            }
            
            // Restore axios defaults, create function, request, and HTTP methods if we patched them
            if (axiosPatchState.patched) {
              try {
                const axios = require('axios');
                if (axiosPatchState.originalDefaults !== undefined && axios.defaults) {
                  axios.defaults.maxRedirects = axiosPatchState.originalDefaults;
                }
                if (axiosPatchState.originalCreate) {
                  axios.create = axiosPatchState.originalCreate;
                }
                if (axiosPatchState.originalRequest) {
                  axios.request = axiosPatchState.originalRequest;
                }
                // Restore HTTP methods
                if (axiosPatchState.originalMethods) {
                  Object.keys(axiosPatchState.originalMethods).forEach(method => {
                    if (axiosPatchState.originalMethods![method]) {
                      axios[method] = axiosPatchState.originalMethods![method];
                    }
                  });
                }
              } catch (axiosRestoreError) {
                logger.debug('Failed to restore axios defaults', {
                  error: axiosRestoreError instanceof Error ? axiosRestoreError.message : 'Unknown',
                });
              }
            }
            
            logger.debug('Restored original http/https.request and tls.connect functions');
          } catch (restoreError) {
            logger.warn('Error during proxy patch cleanup', {
              error: restoreError instanceof Error ? restoreError.message : 'Unknown error',
            });
          }
        }
        
        // Cleanup data tracker
        if (dataTrackerCleanup) {
          dataTrackerCleanup();
        }
      }
    } catch (error: any) {
      // Enhanced error handling for signature issues
      const errorMessage = error?.message || error?.error || error?.response?.error || 'Unknown error';
      const status = error?.status || error?.response?.status || error?.statusCode || 'unknown';
      
      // Log detailed information for signature errors
      if (errorMessage.includes('invalid signature') || status === 400) {
        const orderDetails = order?.order || order;
        logger.error('Order signature validation failed', {
          error: errorMessage,
          status,
          orderDetails: {
            maker: orderDetails?.maker,
            signer: orderDetails?.signer,
            signatureType: orderDetails?.signatureType,
            side: orderDetails?.side || order?.side,
            tokenId: orderDetails?.tokenId,
            makerAmount: orderDetails?.makerAmount,
            takerAmount: orderDetails?.takerAmount,
          },
          fullError: error,
        });
        
        // Provide helpful error message
        throw new Error(
          `Order submission failed: invalid signature (status: ${status}). ` +
          `The derived wallet (${orderDetails?.signer}) may not be authorized ` +
          `to sign orders on behalf of the Safe wallet (${orderDetails?.maker}) on Polymarket. ` +
          `For POLY_GNOSIS_SAFE signature type, the signer must be an owner of the Safe and ` +
          `may need to be registered with Polymarket. ` +
          `Original error: ${errorMessage}`
        );
      }
      
      // Re-throw other errors
      throw error;
    }
    
    // Log full response for debugging (before validation)
    logger.debug('CLOB order submission response', {
      fullResponse: response,
      side: order.side,
      price: order.price,
      size: order.size,
    });
    
    // Check if response indicates success
    if (!response || !response.orderId) {
      // Check if response has error information
      const errorMsg = (response as any)?.error || (response as any)?.message || 'Unknown error';
      const status = (response as any)?.status || (response as any)?.statusCode || 'unknown';
      
      logger.error('Order submission failed - no orderId in response', {
        response,
        side: order.side,
        price: order.price,
        size: order.size,
        error: errorMsg,
        status,
      });
      
      // Provide specific error messages for common issues
      if (errorMsg.includes('not enough balance') || errorMsg.includes('not enough allowance') || 
          errorMsg.includes('INVALID_ORDER_NOT_ENOUGH_BALANCE')) {
        throw new Error(
          `Order submission failed: insufficient balance or allowance (status: ${status}). ` +
          `The Safe wallet (funder) must have sufficient USDC balance and must approve the Exchange contract ` +
          `to spend USDC. Please check the Safe wallet balance and allowances. ` +
          `Original error: ${errorMsg}`
        );
      }
      
      if (errorMsg.includes('min size') || errorMsg.includes('minimum') || errorMsg.includes('min size:')) {
        throw new Error(
          `Order submission failed: order size below minimum requirement (status: ${status}). ` +
          `Marketable orders must be at least $1. ` +
          `Original error: ${errorMsg}`
        );
      }
      
      // Check for invalid price errors
      if (errorMsg.includes('invalid price') || (errorMsg.includes('price') && (errorMsg.includes('min:') || errorMsg.includes('max:')))) {
        throw new Error(
          `Order submission failed: invalid price (status: ${status}). ` +
          `The price with slippage may have exceeded market limits. ` +
          `For binary markets, prices must be between 0.001 and 0.999. ` +
          `Original error: ${errorMsg}`
        );
      }
      
      throw new Error(
        `Order submission failed: ${errorMsg} (status: ${status})`
      );
    }
    
    // Log successful order submission with full response details
    logger.info('Order submitted to CLOB successfully with FOK (Fill-or-Kill) order type', {
      orderId: response.orderId,
      status: response.status,
      side: order.side,
      price: order.price,
      size: order.size,
      orderType: 'FOK',
      fullResponse: response, // Include full response for debugging
    });
    
    // Also log to console for visibility
    console.log('✅ Order successfully submitted to CLOB with FOK (Fill-or-Kill) order type:', {
      orderId: response.orderId,
      status: response.status,
      side: order.side,
      price: order.price,
      size: order.size,
      orderType: 'FOK',
      fullResponse: JSON.stringify(response, null, 2),
    });
    
    return {
      orderId: response.orderId,
      status: response.status || 'submitted',
      ...(proxyDataUsage && { proxyDataUsage }),
      ...(proxyType && { proxyType }),
    };
  } catch (error) {
    // Enhanced error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a Cloudflare block
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      logger.error('Order submission blocked by Cloudflare/API', {
        error: errorMessage,
        side: order.side,
        price: order.price,
        size: order.size,
        note: 'This might be due to rate limiting or IP blocking. Consider using a different IP or waiting.',
      });
      throw new Error(
        `Order submission blocked (403 Forbidden). This might be due to rate limiting or IP blocking. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    // Check for specific error types in the catch block
    if (errorMessage.includes('not enough balance') || errorMessage.includes('not enough allowance') || 
        errorMessage.includes('INVALID_ORDER_NOT_ENOUGH_BALANCE')) {
      logger.error('Order submission failed - insufficient balance or allowance', {
        error: errorMessage,
        side: order.side,
        price: order.price,
        size: order.size,
        note: 'The Safe wallet may need to approve USDC for the Exchange contract or may not have sufficient balance.',
      });
      throw new Error(
        `Order submission failed: insufficient balance or allowance. ` +
        `The Safe wallet (funder) must have sufficient USDC balance and must approve the Exchange contract ` +
        `to spend USDC. Please check the Safe wallet balance and allowances. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    if (errorMessage.includes('min size') || errorMessage.includes('minimum') || errorMessage.includes('min size:')) {
      logger.error('Order submission failed - below minimum size', {
        error: errorMessage,
        side: order.side,
        price: order.price,
        size: order.size,
      });
      throw new Error(
        `Order submission failed: order size below minimum requirement. ` +
        `Marketable orders must be at least $1. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    // Check for invalid price errors
    if (errorMessage.includes('invalid price') || (errorMessage.includes('price') && (errorMessage.includes('min:') || errorMessage.includes('max:')))) {
      logger.error('Order submission failed - invalid price', {
        error: errorMessage,
        side: order.side,
        price: order.price,
        size: order.size,
        note: 'Price with slippage may have exceeded market limits. For binary markets, prices must be between 0.001 and 0.999.',
      });
      throw new Error(
        `Order submission failed: invalid price. ` +
        `The price with slippage may have exceeded market limits. ` +
        `For binary markets, prices must be between 0.001 and 0.999. ` +
        `Original error: ${errorMessage}`
      );
    }
    
    logger.error('Order submission failed', {
      error: errorMessage,
      side: order.side,
      price: order.price,
      size: order.size,
    });
    
    throw error;
  }
}

/**
 * Get order status from CLOB API
 */
export async function getOrderStatus(orderId: string): Promise<any> {
  const response = await fetch(`${CLOB_API_URL}/order/${orderId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch order status for ${orderId}: ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Cancel an order
 * Respects rate limits: 2400 req/10s burst, 24000 req/10min sustained (40/s)
 */
export async function cancelOrder(
  clobClient: ClobClient,
  orderId: string
): Promise<void> {
  // Rate limit order cancellation
  const { waitForRateLimit } = await import('./rate-limiter');
  
  // Wait for burst limit (2400/10s)
  await waitForRateLimit('clob-delete-order');
  
  // Also check sustained limit (2400/60s = 40/s)
  await waitForRateLimit('clob-delete-order-sustained');
  
  await clobClient.cancelOrder({ orderID: orderId });
  logger.info('Order cancelled', { orderId });
}

