import { ClobClient, Side } from '@polymarket/clob-client';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { getClobProxyAgent, isClobProxyEnabled } from '../utils/proxy-agent';

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
 * Submit order to CLOB (automatically adds builder headers)
 * Respects rate limits: 2400 req/10s burst, 24000 req/10min sustained (40/s)
 */
export async function submitOrder(
  clobClient: ClobClient,
  order: any
): Promise<{ orderId: string; status: string }> {
  try {
    // Rate limit order submission
    // Check both burst and sustained limits
    const { waitForRateLimit } = await import('./rate-limiter');
    
    // Wait for burst limit (2400/10s)
    await waitForRateLimit('clob-post-order');
    
    // Also check sustained limit (2400/60s = 40/s)
    await waitForRateLimit('clob-post-order-sustained');
    
    let response;
    try {
      // Use proxy only for order submission if enabled
      // Prefer CLOB-specific proxy (for local machine routing) over general proxy (Oxylabs)
      // The @polymarket/clob-client uses axios internally, which uses Node.js http/https modules
      // We need to patch https.request to inject the proxy agent
      let axiosPatched = false;
      let originalHttpsRequest: any;
      let originalHttpRequest: any;
      
      if (isClobProxyEnabled()) {
        const agent = getClobProxyAgent();
        if (agent) {
          try {
            // Patch Node.js https.request to use proxy agent for CLOB API requests
            // This works because axios uses Node.js http/https modules internally
            const https = require('https');
            const http = require('http');
            
            // Store original functions
            originalHttpsRequest = https.request;
            originalHttpRequest = http.request;
            
            // Patch https.request to use proxy agent for CLOB API requests
            https.request = function(options: any, callback?: any) {
              // Only use proxy for CLOB API requests
              if (options.hostname === 'clob.polymarket.com' || 
                  (options.host && options.host.includes('clob.polymarket.com'))) {
                options.agent = agent;
                logger.debug('Using proxy agent for CLOB request', {
                  hostname: options.hostname,
                  host: options.host,
                });
              }
              return originalHttpsRequest.call(this, options, callback);
            };
            
            // Also patch http.request (though CLOB uses HTTPS)
            http.request = function(options: any, callback?: any) {
              if (options.hostname === 'clob.polymarket.com' || 
                  (options.host && options.host.includes('clob.polymarket.com'))) {
                options.agent = agent;
              }
              return originalHttpRequest.call(this, options, callback);
            };
            
            axiosPatched = true;
            const proxyType = config.proxy?.clobProxyUrl ? 'CLOB-specific (local machine)' : 'general (Oxylabs)';
            logger.info('Using proxy for order submission', {
              proxyEnabled: true,
              proxyType,
              method: 'https.request patch',
            });
          } catch (patchError) {
            logger.warn('Failed to patch https.request for proxy', {
              error: patchError instanceof Error ? patchError.message : 'Unknown error',
            });
          }
        }
      }
      
      try {
        response = await clobClient.postOrder(order);
      } finally {
        // Restore original http/https.request if we patched them
        if (axiosPatched && originalHttpsRequest && originalHttpRequest) {
          try {
            const https = require('https');
            const http = require('http');
            https.request = originalHttpsRequest;
            http.request = originalHttpRequest;
            logger.debug('Restored original http/https.request functions');
          } catch (restoreError) {
            logger.warn('Error during proxy patch cleanup', {
              error: restoreError instanceof Error ? restoreError.message : 'Unknown error',
            });
          }
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
    
    logger.info('Order submitted to CLOB', {
      orderId: response.orderId,
      status: response.status,
      side: order.side,
      price: order.price,
      size: order.size,
    });
    
    return {
      orderId: response.orderId,
      status: response.status || 'submitted',
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

