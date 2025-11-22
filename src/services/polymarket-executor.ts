import { ethers } from 'ethers';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import {
  getMarketInfo,
  getOrderBook,
  createBuyOrder,
  createSellOrder,
  submitOrder,
} from './polymarket-clob';
import { getClobClientForUser } from './clob-client-cache';

// Removed USDC approval logic - CLOB handles approvals automatically via Safe wallets

/**
 * Execute a buy trade on Polymarket via CLOB with Builder Program attribution
 * Returns orderId immediately, txHash available after settlement
 * 
 * @param userAddress The Ethereum address of the user (used to get their proxy wallet and derived wallet)
 * @param marketId Market slug or condition ID
 * @param outcomeIndex The outcome index for the trade
 * @param amountWei The amount to trade in wei (USDC has 6 decimals)
 * @param maxPrice Maximum price willing to pay
 * @param slippageTolerance Slippage tolerance (e.g., 0.05 for 5%)
 */
export async function executeBuyTrade(
  userAddress: string,
  marketId: string, // Market slug or condition ID
  outcomeIndex: number,
  amountWei: string,
  maxPrice: number,
  slippageTolerance: number
): Promise<{ orderId: string; status: string; txHash?: string }> {
  try {
    // Initialize CLOB client for this user (gets proxy wallet from database)
    // Uses cache to avoid repeated API key creation
    logger.executor('Initializing CLOB client for buy trade', {
      userAddress,
      marketId,
      outcomeIndex,
    });

    const clobClient = await getClobClientForUser(userAddress);

    // Fetch market info to get token ID
    // Note: marketId might be a condition ID, need to handle both formats
    logger.executor('Fetching market info', { marketId });
    
    let marketInfo: any;
    let tokenId: string;
    
    try {
      // Try fetching by condition ID first (if it's a hex string)
      if (marketId.startsWith('0x')) {
        // Condition ID - need to find market by condition ID
        // Try fetching from data API or convert to market slug
        marketInfo = await getMarketInfo(marketId);
      } else {
        // Market slug
        marketInfo = await getMarketInfo(marketId);
      }
    } catch (error) {
      // If direct fetch fails, try to find market by condition ID via data API
      logger.warn('Direct market fetch failed, trying data API', { marketId });
      const dataApiResponse = await fetch(
        `${config.polymarket.dataApiUrl}/markets?condition_id=${marketId}`
      );
      if (dataApiResponse.ok) {
        const markets = await dataApiResponse.json() as any[];
        if (markets && Array.isArray(markets) && markets.length > 0) {
          const marketSlug = markets[0].slug;
          marketInfo = await getMarketInfo(marketSlug);
        } else {
          throw new Error(`Market not found for condition ID: ${marketId}`);
        }
      } else {
        throw error;
      }
    }
    
    // Get token ID for the outcome
    // Tokens might be an array of strings or array of objects
    const tokens = marketInfo.tokens || [];
    if (!tokens[outcomeIndex]) {
      throw new Error(`Outcome index ${outcomeIndex} not found in market ${marketId}. Available tokens: ${tokens.length}`);
    }
    
    // Extract token ID - handle both string and object formats
    const token = tokens[outcomeIndex];
    
    // Log token structure for debugging
    logger.debug('Token extraction', {
      outcomeIndex,
      tokenType: typeof token,
      token: token,
      tokenStringified: JSON.stringify(token),
    });
    
    if (typeof token === 'string') {
      tokenId = token;
    } else if (token && typeof token === 'object') {
      // Token is an object, extract token_id or tokenId field
      // Try common field names
      tokenId = token.token_id || token.tokenId || token.id || token.address || token.contract;
      
      // If still not found, try to stringify and check
      if (!tokenId || tokenId === '[object Object]') {
        // Try accessing nested properties
        if (token.token && typeof token.token === 'string') {
          tokenId = token.token;
        } else if (token.outcome && token.outcome.token_id) {
          tokenId = token.outcome.token_id;
        } else {
          // Last resort: log and throw detailed error
          logger.error('Failed to extract token ID', {
            token,
            tokenKeys: Object.keys(token),
            tokenStringified: JSON.stringify(token),
          });
          throw new Error(
            `Invalid token format at index ${outcomeIndex}. ` +
            `Token structure: ${JSON.stringify(token)}. ` +
            `Available keys: ${Object.keys(token).join(', ')}`
          );
        }
      }
    } else {
      tokenId = String(token);
    }
    
    // Validate tokenId is a valid string
    if (!tokenId || tokenId === '[object Object]' || tokenId.length < 10) {
      throw new Error(
        `Invalid token ID extracted: "${tokenId}". ` +
        `Original token: ${JSON.stringify(token)}`
      );
    }

    // Check if market is negrisk (from market info or Gamma API)
    // For negrisk markets, we need to set negrisk=false in order creation
    let isNegrisk = false;
    try {
      // Try to get negrisk status from market info
      if (marketInfo.negRisk !== undefined) {
        isNegrisk = marketInfo.negRisk === true;
      } else if (marketInfo.negrisk !== undefined) {
        isNegrisk = marketInfo.negrisk === true;
      } else {
        // Try Gamma API to get negrisk status
        // Get market slug if we have it
        const marketSlug = marketInfo.slug || (marketId.startsWith('0x') ? null : marketId);
        if (marketSlug) {
          // Gamma API response includes negRisk field
          const gammaApiUrl = config.polymarket.gammaApiUrl || 'https://gamma-api.polymarket.com';
          const gammaResponse = await fetch(`${gammaApiUrl}/markets/slug/${marketSlug}`);
          if (gammaResponse.ok) {
            const gammaMarket = await gammaResponse.json() as any;
            isNegrisk = gammaMarket.negRisk === true || gammaMarket.negrisk === true;
          }
        }
      }
    } catch (error) {
      // If we can't determine negrisk status, default to false (safer)
      logger.warn('Could not determine negrisk status, defaulting to false', {
        marketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      isNegrisk = false;
    }

    logger.executor('Market info retrieved', {
      marketId,
      tokenId,
      outcomeIndex,
      tokenFormat: typeof token,
      isNegrisk,
    });

    // Validate that the orderbook exists for this token before attempting to trade
    // This prevents "orderbook does not exist" errors
    try {
      logger.executor('Validating orderbook exists for token', { tokenId });
      await getOrderBook(tokenId);
      logger.executor('Orderbook validated - token is tradeable', { tokenId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Orderbook validation failed', {
        tokenId,
        marketId,
        outcomeIndex,
        error: errorMessage,
      });
      
      // Check if it's the "orderbook does not exist" error
      if (errorMessage.includes('orderbook') && errorMessage.includes('does not exist')) {
        throw new Error(
          `Cannot trade token ${tokenId}: Orderbook does not exist. ` +
          `This market may not be active on CLOB, may have been closed, or the token ID may be incorrect. ` +
          `Market: ${marketId}, Outcome: ${outcomeIndex}`
        );
      }
      
      // Re-throw other errors
      throw new Error(
        `Failed to validate orderbook for token ${tokenId}: ${errorMessage}`
      );
    }

    // Orderbook already validated above, so we can proceed with order creation

    // Calculate price with slippage
    let priceWithSlippage = maxPrice * (1 + slippageTolerance);
    
    // Cap price at maximum allowed (0.999 for binary markets)
    // Polymarket binary markets have a maximum price of 0.999 (or 1.0)
    // If slippage pushes price above max, cap it at the maximum
    const MAX_PRICE = 0.999; // Maximum price for binary markets on Polymarket
    if (priceWithSlippage > MAX_PRICE) {
      logger.warn('Price with slippage exceeds maximum, capping at maximum', {
        originalPrice: maxPrice,
        priceWithSlippage,
        maxPrice: MAX_PRICE,
        slippageTolerance,
        userAddress,
        marketId,
      });
      priceWithSlippage = MAX_PRICE;
    }
    
    // Convert amount from wei to decimal string
    const amountDecimal = ethers.utils.formatUnits(amountWei, 6); // USDC has 6 decimals
    
    // Validate minimum order size: $1 for marketable orders
    // According to Polymarket docs: marketable orders must be at least $1
    const orderValue = parseFloat(amountDecimal) * priceWithSlippage;
    const MIN_ORDER_VALUE = 1.0; // $1 minimum
    
    if (orderValue < MIN_ORDER_VALUE) {
      logger.warn('Order value below minimum', {
        orderValue,
        minOrderValue: MIN_ORDER_VALUE,
        amountDecimal,
        priceWithSlippage,
        userAddress,
        marketId,
      });
      throw new Error(
        `Order value ($${orderValue.toFixed(2)}) is below the minimum required value of $${MIN_ORDER_VALUE}. ` +
        `Please increase the order size or price. Current: ${amountDecimal} USDC at $${priceWithSlippage.toFixed(4)} per share.`
      );
    }

    // Create buy order
    // For negrisk markets, set negrisk=false (required by Polymarket)
    logger.executor('Creating buy order', {
      tokenId,
      price: priceWithSlippage,
      size: amountDecimal,
      negrisk: isNegrisk ? false : undefined, // Only set if negrisk market
    });

    const order = await createBuyOrder(
      clobClient,
      tokenId,
      priceWithSlippage,
      amountDecimal,
      isNegrisk ? false : false // Set to false for negrisk markets, false otherwise (explicit)
    );

    // Submit order to CLOB (automatically adds builder headers)
    logger.executor('Submitting order to CLOB', {
      orderId: order.orderId || 'pending',
    });

    const response = await submitOrder(clobClient, order);

    // Validate response
    if (!response || !response.orderId) {
      throw new Error(
        `Order submission failed: No orderId returned. Response: ${JSON.stringify(response)}`
      );
    }

    logger.executor('Buy order submitted to CLOB', {
      orderId: response.orderId,
      status: response.status,
      userAddress,
      marketId,
      tokenId,
    });

    return {
      orderId: response.orderId,
      status: response.status || 'submitted',
      // txHash will be available after settlement - monitor order status
    };
  } catch (error) {
    logger.error('Error executing buy trade', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
      userAddress,
      marketId,
      outcomeIndex,
      amountWei,
    });
    throw error;
  }
}

/**
 * Execute a sell trade on Polymarket via CLOB with Builder Program attribution
 * Returns orderId immediately, txHash available after settlement
 * 
 * @param userAddress The Ethereum address of the user (used to get their proxy wallet and derived wallet)
 * @param marketId Market slug or condition ID
 * @param outcomeIndex The outcome index for the trade
 * @param sharesWei The shares to sell in wei (shares typically have 18 decimals)
 * @param minPrice Minimum price willing to accept
 * @param slippageTolerance Slippage tolerance (e.g., 0.05 for 5%)
 */
export async function executeSellTrade(
  userAddress: string,
  marketId: string, // Market slug or condition ID
  outcomeIndex: number,
  sharesWei: string,
  minPrice: number,
  slippageTolerance: number
): Promise<{ orderId: string; status: string; txHash?: string }> {
  try {
    // Initialize CLOB client for this user (gets proxy wallet from database)
    // Uses cache to avoid repeated API key creation
    logger.executor('Initializing CLOB client for sell trade', {
      userAddress,
      marketId,
      outcomeIndex,
    });

    const clobClient = await getClobClientForUser(userAddress);

    // Fetch market info to get token ID
    // Note: marketId might be a condition ID, need to handle both formats
    logger.executor('Fetching market info', { marketId });
    
    let marketInfo: any;
    let tokenId: string;
    
    try {
      // Try fetching by condition ID first (if it's a hex string)
      if (marketId.startsWith('0x')) {
        // Condition ID - need to find market by condition ID
        // Try fetching from data API or convert to market slug
        marketInfo = await getMarketInfo(marketId);
      } else {
        // Market slug
        marketInfo = await getMarketInfo(marketId);
      }
    } catch (error) {
      // If direct fetch fails, try to find market by condition ID via data API
      logger.warn('Direct market fetch failed, trying data API', { marketId });
      const dataApiResponse = await fetch(
        `${config.polymarket.dataApiUrl}/markets?condition_id=${marketId}`
      );
      if (dataApiResponse.ok) {
        const markets = await dataApiResponse.json() as any[];
        if (markets && Array.isArray(markets) && markets.length > 0) {
          const marketSlug = markets[0].slug;
          marketInfo = await getMarketInfo(marketSlug);
        } else {
          throw new Error(`Market not found for condition ID: ${marketId}`);
        }
      } else {
        throw error;
      }
    }
    
    // Get token ID for the outcome
    // Tokens might be an array of strings or array of objects
    const tokens = marketInfo.tokens || [];
    if (!tokens[outcomeIndex]) {
      throw new Error(`Outcome index ${outcomeIndex} not found in market ${marketId}. Available tokens: ${tokens.length}`);
    }
    
    // Extract token ID - handle both string and object formats
    const token = tokens[outcomeIndex];
    
    // Log token structure for debugging
    logger.debug('Token extraction', {
      outcomeIndex,
      tokenType: typeof token,
      token: token,
      tokenStringified: JSON.stringify(token),
    });
    
    if (typeof token === 'string') {
      tokenId = token;
    } else if (token && typeof token === 'object') {
      // Token is an object, extract token_id or tokenId field
      // Try common field names
      tokenId = token.token_id || token.tokenId || token.id || token.address || token.contract;
      
      // If still not found, try to stringify and check
      if (!tokenId || tokenId === '[object Object]') {
        // Try accessing nested properties
        if (token.token && typeof token.token === 'string') {
          tokenId = token.token;
        } else if (token.outcome && token.outcome.token_id) {
          tokenId = token.outcome.token_id;
        } else {
          // Last resort: log and throw detailed error
          logger.error('Failed to extract token ID', {
            token,
            tokenKeys: Object.keys(token),
            tokenStringified: JSON.stringify(token),
          });
          throw new Error(
            `Invalid token format at index ${outcomeIndex}. ` +
            `Token structure: ${JSON.stringify(token)}. ` +
            `Available keys: ${Object.keys(token).join(', ')}`
          );
        }
      }
    } else {
      tokenId = String(token);
    }
    
    // Validate tokenId is a valid string
    if (!tokenId || tokenId === '[object Object]' || tokenId.length < 10) {
      throw new Error(
        `Invalid token ID extracted: "${tokenId}". ` +
        `Original token: ${JSON.stringify(token)}`
      );
    }

    logger.executor('Market info retrieved', {
      marketId,
      tokenId,
      outcomeIndex,
      tokenFormat: typeof token,
    });

    // Validate that the orderbook exists for this token before attempting to trade
    // This prevents "orderbook does not exist" errors
    try {
      logger.executor('Validating orderbook exists for token', { tokenId });
      const orderBook = await getOrderBook(tokenId);
      logger.executor('Orderbook validated - token is tradeable', { 
        tokenId,
        hasBids: !!orderBook.bids?.length,
        hasAsks: !!orderBook.asks?.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Orderbook validation failed', {
        tokenId,
        marketId,
        outcomeIndex,
        error: errorMessage,
      });
      
      // Check if it's the "orderbook does not exist" error
      if (errorMessage.includes('orderbook') && errorMessage.includes('does not exist')) {
        throw new Error(
          `Cannot trade token ${tokenId}: Orderbook does not exist. ` +
          `This market may not be active on CLOB, may have been closed/resolved, or the token ID may be incorrect. ` +
          `Market: ${marketId}, Outcome: ${outcomeIndex}`
        );
      }
      
      // Re-throw other errors
      throw new Error(
        `Failed to validate orderbook for token ${tokenId}: ${errorMessage}`
      );
    }

    // Validate that user has sufficient token balance before creating sell order
    logger.executor('Checking token balance for sell order', {
      tokenId,
      requiredShares: sharesWei,
    });
    
    const { hasSufficientTokenBalance } = await import('./token-balance');
    const balanceCheck = await hasSufficientTokenBalance(userAddress, tokenId, sharesWei);
    
    if (!balanceCheck.hasBalance) {
      const currentBalanceFormatted = ethers.utils.formatUnits(balanceCheck.currentBalance, 18);
      const requiredBalanceFormatted = ethers.utils.formatUnits(balanceCheck.requiredBalance, 18);
      const shortfallFormatted = ethers.utils.formatUnits(balanceCheck.shortfall, 18);
      
      throw new Error(
        `Insufficient token balance for sell order. ` +
        `Required: ${requiredBalanceFormatted} tokens, ` +
        `Available: ${currentBalanceFormatted} tokens, ` +
        `Shortfall: ${shortfallFormatted} tokens. ` +
        `Proxy wallet: ${balanceCheck.proxyWallet || 'unknown'}`
      );
    }
    
    logger.executor('Token balance validated', {
      tokenId,
      currentBalance: balanceCheck.currentBalance,
      requiredBalance: balanceCheck.requiredBalance,
      proxyWallet: balanceCheck.proxyWallet,
    });

    // Check if market is negrisk (from market info or Gamma API)
    // For negrisk markets, we need to set negrisk=false in order creation
    let isNegrisk = false;
    try {
      // Try to get negrisk status from market info
      if (marketInfo.negRisk !== undefined) {
        isNegrisk = marketInfo.negRisk === true;
      } else if (marketInfo.negrisk !== undefined) {
        isNegrisk = marketInfo.negrisk === true;
      } else {
        // Try Gamma API to get negrisk status
        // Get market slug if we have it
        const marketSlug = marketInfo.slug || (marketId.startsWith('0x') ? null : marketId);
        if (marketSlug) {
          // Gamma API response includes negRisk field
          const gammaApiUrl = config.polymarket.gammaApiUrl || 'https://gamma-api.polymarket.com';
          const gammaResponse = await fetch(`${gammaApiUrl}/markets/slug/${marketSlug}`);
          if (gammaResponse.ok) {
            const gammaMarket = await gammaResponse.json() as any;
            isNegrisk = gammaMarket.negRisk === true || gammaMarket.negrisk === true;
          }
        }
      }
    } catch (error) {
      // If we can't determine negrisk status, default to false (safer)
      logger.warn('Could not determine negrisk status, defaulting to false', {
        marketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      isNegrisk = false;
    }

    // Calculate min price with slippage
    let minPriceWithSlippage = minPrice * (1 - slippageTolerance);
    
    // Cap price at minimum allowed (0.001 for binary markets)
    // Polymarket binary markets have a minimum price of 0.001 (or 0.0)
    // If slippage pushes price below min, cap it at the minimum
    const MIN_PRICE = 0.001; // Minimum price for binary markets on Polymarket
    if (minPriceWithSlippage < MIN_PRICE) {
      logger.warn('Price with slippage below minimum, capping at minimum', {
        originalPrice: minPrice,
        minPriceWithSlippage,
        minPrice: MIN_PRICE,
        slippageTolerance,
        userAddress,
        marketId,
      });
      minPriceWithSlippage = MIN_PRICE;
    }
    
    // Convert shares from wei to decimal string (shares typically have 18 decimals)
    const sharesDecimal = ethers.utils.formatUnits(sharesWei, 18);

    // Create sell order
    // For negrisk markets, set negrisk=false (required by Polymarket)
    logger.executor('Creating sell order', {
      tokenId,
      price: minPriceWithSlippage,
      size: sharesDecimal,
      negrisk: isNegrisk ? false : undefined, // Only set if negrisk market
    });

    const order = await createSellOrder(
      clobClient,
      tokenId,
      minPriceWithSlippage,
      sharesDecimal,
      isNegrisk ? false : undefined // Set to false for negrisk markets, undefined otherwise (library will auto-detect)
    );

    // Submit order to CLOB (automatically adds builder headers)
    logger.executor('Submitting order to CLOB', {
      orderId: order.orderId || 'pending',
    });

    const response = await submitOrder(clobClient, order);

    // Validate response
    if (!response || !response.orderId) {
      throw new Error(
        `Order submission failed: No orderId returned. Response: ${JSON.stringify(response)}`
      );
    }

    logger.executor('Sell order submitted to CLOB', {
      orderId: response.orderId,
      status: response.status,
      userAddress,
      marketId,
      tokenId,
    });

    return {
      orderId: response.orderId,
      status: response.status || 'submitted',
      // txHash will be available after settlement - monitor order status
    };
  } catch (error) {
    logger.error('Error executing sell trade', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : error,
      userAddress,
      marketId,
      outcomeIndex,
      sharesWei,
    });
    throw error;
  }
}


