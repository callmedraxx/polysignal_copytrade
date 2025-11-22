import { prisma } from '../config/database';
import { calculatePositionSize } from './position-sizer';
import { executeBuyTrade, executeSellTrade } from './polymarket-executor';
import { ethers } from 'ethers';
import { monitorOrderSettlement } from './order-monitor';
import { getUserLogger } from '../utils/user-logger';

export interface TradeExecutionJob {
  tradeId: string;
  configId: string;
  originalTrade: any;
}

/**
 * Execute a copied trade automatically
 */
export async function executeTrade(jobData: TradeExecutionJob): Promise<void> {
  const { tradeId, configId, originalTrade } = jobData;

  try {
    // Get the copied trade record
    const copiedTrade = await prisma.copiedTrade.findUnique({
      where: { id: tradeId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!copiedTrade) {
      const errorMsg = `Copied trade ${tradeId} not found. Trade may have been deleted or never created.`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (!copiedTrade.config) {
      const errorMsg = `Copy trading config not found for trade ${tradeId}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const copyConfig = copiedTrade.config;
    const userAddress = copyConfig.user.address;
    const userLogger = getUserLogger(userAddress);

    // Verify config is still enabled and authorized
    if (!copyConfig.enabled || !copyConfig.authorized) {
      try {
        await prisma.copiedTrade.update({
          where: { id: tradeId },
          data: {
            status: 'skipped',
            errorMessage: 'Copy trading is disabled or not authorized',
          },
        });
        console.log(`⏭️ Trade ${tradeId} skipped: Copy trading disabled or not authorized`);
      } catch (updateError) {
        console.error(`❌ Failed to update trade ${tradeId} status to 'skipped':`, updateError);
        // Continue anyway - don't block execution
      }
      return;
    }

    // Check status (should be 'active', not 'paused' or 'disabled')
    if (copyConfig.status !== 'active') {
      try {
        await prisma.copiedTrade.update({
          where: { id: tradeId },
          data: {
            status: 'skipped',
            errorMessage: `Copy trading is ${copyConfig.status}`,
          },
        });
        console.log(`⏭️ Trade ${tradeId} skipped: Copy trading status is ${copyConfig.status}`);
      } catch (updateError) {
        console.error(`❌ Failed to update trade ${tradeId} status to 'skipped':`, updateError);
      }
      return;
    }

    // Check duration hasn't expired
    if (copyConfig.durationDays && copyConfig.startDate) {
      const now = new Date();
      const startDate = new Date(copyConfig.startDate);
      const daysElapsed = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysElapsed >= copyConfig.durationDays) {
        // Auto-pause config
        try {
          await prisma.copyTradingConfig.update({
            where: { id: configId },
            data: { 
              status: 'paused',
              enabled: false,
            },
          });
        } catch (updateError) {
          console.error(`⚠️ Failed to auto-pause config ${configId}:`, updateError);
        }
        
        try {
          await prisma.copiedTrade.update({
            where: { id: tradeId },
            data: {
              status: 'skipped',
              errorMessage: 'Copy trading duration has expired',
            },
          });
          console.log(`⏭️ Trade ${tradeId} skipped: Duration expired`);
        } catch (updateError) {
          console.error(`❌ Failed to update trade ${tradeId} status:`, updateError);
        }
        return;
      }
    }

    // Check max buy trades per day for buy trades
    if (copiedTrade.tradeType === 'buy' && copyConfig.maxBuyTradesPerDay) {
      // Refresh config to get latest trade count
      const refreshedConfig = await prisma.copyTradingConfig.findUnique({
        where: { id: configId },
      });
      
      if (refreshedConfig) {
        // Check and reset if needed
        if (refreshedConfig.lastResetDate) {
          const now = new Date();
          const lastReset = new Date(refreshedConfig.lastResetDate);
          const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceReset >= 24) {
            // Reset count
            await prisma.copyTradingConfig.update({
              where: { id: configId },
              data: {
                tradesCountToday: 0,
                lastResetDate: new Date(),
              },
            });
            refreshedConfig.tradesCountToday = 0;
            refreshedConfig.lastResetDate = new Date();
          }
        } else {
          // Set initial reset date if not set
          await prisma.copyTradingConfig.update({
            where: { id: configId },
            data: {
              lastResetDate: new Date(),
            },
          });
          refreshedConfig.lastResetDate = new Date();
        }
        
        // Check if max reached
        if (refreshedConfig.maxBuyTradesPerDay && refreshedConfig.tradesCountToday >= refreshedConfig.maxBuyTradesPerDay) {
          try {
            await prisma.copiedTrade.update({
              where: { id: tradeId },
              data: {
                status: 'skipped',
                errorMessage: `Maximum buy trades per day reached (${refreshedConfig.tradesCountToday}/${refreshedConfig.maxBuyTradesPerDay})`,
              },
            });
            console.log(`⏭️ Trade ${tradeId} skipped: Max buy trades per day reached`);
          } catch (updateError) {
            console.error(`❌ Failed to update trade ${tradeId} status:`, updateError);
          }
          return;
        }
      }
    }

    // TEMPORARILY DISABLED FOR TESTING: Check if market is still open before executing
    // const marketOpen = await isMarketOpen(copiedTrade.marketId);
    // if (!marketOpen) {
    //   const errorMsg = 'Market is closed - cannot execute trade';
    //   try {
    //     await prisma.copiedTrade.update({
    //       where: { id: tradeId },
    //       data: {
    //         status: 'skipped',
    //         errorMessage: errorMsg,
    //       },
    //     });
    //     console.log(`⏭️ Trade ${tradeId} skipped: ${errorMsg}`);
    //   } catch (updateError) {
    //     console.error(`❌ Failed to update trade ${tradeId} status:`, updateError);
    //   }
    //   return;
    // }

    // Log trade execution start
    userLogger.tradeExecutionStart(tradeId, copiedTrade.marketId, copiedTrade.tradeType, {
      configId,
      originalTxHash: copiedTrade.originalTxHash,
      originalAmount: originalTrade.usdcSize,
    });

    // Calculate position size
    const positionSize = await calculatePositionSize(
      configId,
      originalTrade.usdcSize,
      copiedTrade.tradeType as 'buy' | 'sell'
    );

    // Check if user has sufficient balance
    if (!positionSize.isSufficient) {
      const errorMsg = `Insufficient balance. Required: ${positionSize.amount} USDC, Available: ${positionSize.balance} USDC`;
      try {
        const { failureReason, failureCategory } = categorizeFailure(errorMsg);
        await prisma.copiedTrade.update({
          where: { id: tradeId },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
            failureReason: failureReason,
            failureCategory: failureCategory,
          },
        });
        console.log(`💰 Trade ${tradeId} failed: ${errorMsg}`);
      } catch (updateError) {
        console.error(`❌ Failed to update trade ${tradeId} status:`, updateError);
        // Continue anyway - don't block execution
      }
      return;
    }

    // Get slippage tolerance from config
    const slippageTolerance = parseFloat(copyConfig.slippageTolerance || '0.05');
    // TEMPORARILY DISABLED: Set to 1 to disable retries
    const maxRetries = 1; // copyConfig.maxRetries || 3;

    // Calculate copied shares based on copied amount and price
    // Shares = Amount / Price (for buy trades)
    // For sell trades, shares are the amount being sold
    let copiedShares: string | null = null;
    if (originalTrade.price && parseFloat(originalTrade.price.toString()) > 0) {
      const price = parseFloat(originalTrade.price.toString());
      const amount = parseFloat(positionSize.amount);
      if (copiedTrade.tradeType === 'buy') {
        // For buy: shares = amount / price
        copiedShares = (amount / price).toFixed(6);
      } else {
        // For sell: shares = amount / price (amount is the value being sold)
        copiedShares = (amount / price).toFixed(6);
      }
    }

    // Update copied trade with calculated amount and shares
    try {
      // Calculate cost basis (for buy trades, this is the amount spent)
      const costBasis = copiedTrade.tradeType === 'buy' ? positionSize.amount : null;
      
      await prisma.copiedTrade.update({
        where: { id: tradeId },
        data: {
          copiedAmount: positionSize.amount,
          copiedPrice: originalTrade.price.toString(),
          copiedShares: copiedShares,
          costBasis: costBasis,
        },
      });
    } catch (updateError) {
      console.error(`❌ Failed to update trade ${tradeId} with calculated amounts:`, updateError);
      throw new Error(`Failed to update trade record: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
    }

    // Execute trade via CLOB with Builder Program attribution
    let executionResult: { orderId: string; status: string; txHash?: string } | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const originalPrice = parseFloat(originalTrade.price.toString());
        
        if (copiedTrade.tradeType === 'buy') {
          executionResult = await executeBuyTrade(
            copyConfig.user.address,
            copiedTrade.marketId,
            copiedTrade.outcomeIndex,
            positionSize.amountWei,
            originalPrice,
            slippageTolerance
          );
        } else {
          // For sell trades, we need shares, not amount
          // Calculate shares from amount and price
          const sharesWei = copiedShares 
            ? ethers.utils.parseUnits(copiedShares, 18).toString()
            : positionSize.amountWei; // Fallback if shares not calculated
          
          executionResult = await executeSellTrade(
            copyConfig.user.address,
            copiedTrade.marketId,
            copiedTrade.outcomeIndex,
            sharesWei,
            originalPrice,
            slippageTolerance
          );
        }
        
        // Success - break out of retry loop
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️ Trade execution attempt ${attempt}/${maxRetries} failed for ${tradeId}:`, lastError.message);
        
        userLogger.warn('TRADE_EXECUTION', `Trade execution attempt ${attempt}/${maxRetries} failed`, {
          tradeId,
          attempt,
          maxRetries,
          error: lastError.message,
        });
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!executionResult) {
      const error = new Error(`Trade execution failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
      userLogger.tradeExecutionError(tradeId, error, {
        maxRetries,
        attempts: maxRetries,
      });
      throw error;
    }

    // Log trade execution success (before database update)
    userLogger.tradeExecutionSuccess(
      tradeId,
      executionResult.orderId || 'pending',
      executionResult.txHash || 'pending',
      {
        marketId: copiedTrade.marketId,
        tradeType: copiedTrade.tradeType,
        copiedAmount: positionSize.amountWei,
      }
    );

    // Update trade record with order submission result
    // Note: txHash will be updated later when order settles
    try {
      await prisma.copiedTrade.update({
        where: { id: tradeId },
        data: {
          orderId: executionResult.orderId,
          orderStatus: executionResult.status,
          status: 'pending', // Changed from 'executed' - order is pending settlement
          submittedAt: new Date(),
          // copiedTxHash will be set when order settles
          // executedAt will be set when order settles
        },
      });
      console.log(`✅ Trade ${tradeId} order submitted to CLOB: ${executionResult.orderId}`);
      
      // Increment buy trade count for buy trades
      if (copiedTrade.tradeType === 'buy' && copyConfig.maxBuyTradesPerDay) {
        try {
          await prisma.copyTradingConfig.update({
            where: { id: configId },
            data: {
              tradesCountToday: {
                increment: 1,
              },
              lastResetDate: copyConfig.lastResetDate || new Date(),
            },
          });
        } catch (incrementError) {
          // Log but don't fail - trade was already executed
          console.error(`⚠️ Failed to increment trade count for config ${configId}:`, incrementError);
        }
      }
      
      // Start monitoring order settlement in background
      // Don't await - let it run asynchronously
      monitorOrderSettlement(executionResult.orderId, tradeId).catch((error) => {
        console.error(`⚠️ Error monitoring order settlement for ${executionResult.orderId}:`, error);
        // Order monitoring errors don't fail the trade - order was submitted successfully
      });
    } catch (updateError) {
      // Log error but don't fail the entire execution - order was submitted successfully
      console.error(`⚠️ Trade ${tradeId} order submitted but failed to update record:`, updateError);
      console.log(`✅ Trade ${tradeId} order submitted successfully (orderId: ${executionResult.orderId}), but status update failed`);
      // Don't throw - the order was submitted, just the status update failed
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error executing trade ${tradeId}:`, errorMessage);

    // Log trade execution error
    try {
      const trade = await prisma.copiedTrade.findUnique({
        where: { id: tradeId },
        include: {
          config: {
            include: {
              user: true,
            },
          },
        },
      });
      if (trade?.config?.user) {
        const userLogger = getUserLogger(trade.config.user.address);
        userLogger.tradeExecutionError(tradeId, error, {
          marketId: trade.marketId,
          tradeType: trade.tradeType,
        });
      }
    } catch (logError) {
      // Ignore logging errors
    }

    // Try to update trade record with error, but handle case where trade might not exist
    try {
      // First check if trade exists
      const existingTrade = await prisma.copiedTrade.findUnique({
        where: { id: tradeId },
      });

      if (existingTrade) {
        // Categorize failure reason
        const { failureReason, failureCategory } = categorizeFailure(errorMessage);
        
        await prisma.copiedTrade.update({
          where: { id: tradeId },
          data: {
            status: 'failed',
            errorMessage: errorMessage,
            failureReason: failureReason,
            failureCategory: failureCategory,
          },
        });
        console.log(`📝 Updated trade ${tradeId} status to 'failed' (${failureCategory}: ${failureReason})`);
      } else {
        console.warn(`⚠️ Trade ${tradeId} not found - cannot update status. Trade may have been deleted.`);
      }
    } catch (updateError) {
      // If update fails, log but don't throw - we don't want to mask the original error
      console.error(`❌ Failed to update trade ${tradeId} status:`, updateError instanceof Error ? updateError.message : 'Unknown error');
    }

    // Re-throw original error to trigger retry (if applicable)
    throw error;
  }
}

/**
 * Categorize failure reason from error message
 */
function categorizeFailure(errorMessage: string): { failureReason: string; failureCategory: string } {
  const lowerMessage = errorMessage.toLowerCase();
  
  // Balance-related failures
  if (lowerMessage.includes('not enough balance') || lowerMessage.includes('insufficient balance')) {
    return {
      failureReason: 'insufficient_balance',
      failureCategory: 'balance',
    };
  }
  
  // Allowance-related failures
  if (lowerMessage.includes('not enough allowance') || lowerMessage.includes('allowance')) {
    return {
      failureReason: 'insufficient_allowance',
      failureCategory: 'balance',
    };
  }
  
  // Validation failures
  if (lowerMessage.includes('min size') || lowerMessage.includes('minimum')) {
    return {
      failureReason: 'below_minimum_size',
      failureCategory: 'validation',
    };
  }
  
  // Price validation failures
  if (lowerMessage.includes('invalid price') || (lowerMessage.includes('price') && (lowerMessage.includes('min:') || lowerMessage.includes('max:')))) {
    return {
      failureReason: 'invalid_price',
      failureCategory: 'validation',
    };
  }
  
  if (lowerMessage.includes('orderbook does not exist') || lowerMessage.includes('orderbook')) {
    return {
      failureReason: 'orderbook_unavailable',
      failureCategory: 'market',
    };
  }
  
  // Market status failures
  if (lowerMessage.includes('market is closed') || lowerMessage.includes('market closed')) {
    return {
      failureReason: 'market_closed',
      failureCategory: 'market',
    };
  }
  
  if (lowerMessage.includes('market is not open') || lowerMessage.includes('not accepting orders')) {
    return {
      failureReason: 'market_not_accepting_orders',
      failureCategory: 'market',
    };
  }
  
  // Execution failures
  if (lowerMessage.includes('invalid signature')) {
    return {
      failureReason: 'invalid_signature',
      failureCategory: 'execution',
    };
  }
  
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return {
      failureReason: 'rate_limited',
      failureCategory: 'execution',
    };
  }
  
  // Default
  return {
    failureReason: 'unknown_error',
    failureCategory: 'other',
  };
}


