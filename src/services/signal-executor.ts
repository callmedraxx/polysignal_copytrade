import { prisma } from '../config/database';
import { calculatePositionSize, validateTradeAmount, validateMarketCategory } from './position-sizer';
import { ethers } from 'ethers';
import { executeBuyTrade, executeSellTrade } from './polymarket-executor';
import { monitorOrderSettlement } from './order-monitor';

export interface SignalExecutionJob {
  signalId: string;
  configId: string;
  originalSignal: any;
}

/**
 * Execute a copied signal automatically
 * Reuses the same execution logic as trade executor
 */
export async function executeSignal(jobData: SignalExecutionJob): Promise<void> {
  const { signalId, configId, originalSignal } = jobData;

  try {
    // Get the copied signal record
    const copiedSignal = await prisma.copiedSignal.findUnique({
      where: { id: signalId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!copiedSignal) {
      const errorMsg = `Copied signal ${signalId} not found. Signal may have been deleted or never created.`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    if (!copiedSignal.config) {
      const errorMsg = `Copy signal config not found for signal ${signalId}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const signalConfig = copiedSignal.config;

    // Verify config is still enabled and authorized
    if (!signalConfig.enabled || !signalConfig.authorized) {
      try {
        await prisma.copiedSignal.update({
          where: { id: signalId },
          data: {
            status: 'skipped',
            errorMessage: 'Copy signals is disabled or not authorized',
          },
        });
        console.log(`⏭️ Signal ${signalId} skipped: Copy signals disabled or not authorized`);
      } catch (updateError) {
        console.error(`❌ Failed to update signal ${signalId} status to 'skipped':`, updateError);
      }
      return;
    }

    // Calculate position size
    const positionSize = await calculatePositionSize(
      configId,
      originalSignal.amount,
      copiedSignal.tradeType as 'buy' | 'sell'
    );

    // Check if user has sufficient balance
    if (!positionSize.isSufficient) {
      const errorMsg = `Insufficient balance. Required: ${positionSize.amount} USDC, Available: ${positionSize.balance} USDC`;
      try {
        const { failureReason, failureCategory } = categorizeFailure(errorMsg);
        await prisma.copiedSignal.update({
          where: { id: signalId },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
            failureReason: failureReason,
            failureCategory: failureCategory,
          },
        });
        console.log(`💰 Signal ${signalId} failed: ${errorMsg}`);
      } catch (updateError) {
        console.error(`❌ Failed to update signal ${signalId} status:`, updateError);
      }
      return;
    }

    // Get slippage tolerance from config
    const slippageTolerance = parseFloat(signalConfig.slippageTolerance || '0.05');
    const maxRetries = 1; // signalConfig.maxRetries || 3;

    // Calculate copied shares based on copied amount and price
    let copiedShares: string | null = null;
    if (originalSignal.price && parseFloat(originalSignal.price.toString()) > 0) {
      const price = parseFloat(originalSignal.price.toString());
      const amount = parseFloat(positionSize.amount);
      if (copiedSignal.tradeType === 'buy') {
        copiedShares = (amount / price).toFixed(6);
      } else {
        copiedShares = (amount / price).toFixed(6);
      }
    }

    // Update copied signal with calculated amount and shares
    try {
      const costBasis = copiedSignal.tradeType === 'buy' ? positionSize.amount : null;
      
      await prisma.copiedSignal.update({
        where: { id: signalId },
        data: {
          copiedAmount: positionSize.amount,
          copiedPrice: originalSignal.price.toString(),
          copiedShares: copiedShares,
          costBasis: costBasis,
        },
      });
    } catch (updateError) {
      console.error(`❌ Failed to update signal ${signalId} with calculated amounts:`, updateError);
      throw new Error(`Failed to update signal record: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`);
    }

    // Execute trade via CLOB with Builder Program attribution
    let executionResult: { orderId: string; status: string; txHash?: string } | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const originalPrice = parseFloat(originalSignal.price.toString());
        
        if (copiedSignal.tradeType === 'buy') {
          executionResult = await executeBuyTrade(
            signalConfig.user.address,
            copiedSignal.marketId,
            copiedSignal.outcomeIndex,
            positionSize.amountWei,
            originalPrice,
            slippageTolerance
          );
        } else {
          const sharesWei = copiedShares 
            ? ethers.utils.parseUnits(copiedShares, 18).toString()
            : positionSize.amountWei;
          
          executionResult = await executeSellTrade(
            signalConfig.user.address,
            copiedSignal.marketId,
            copiedSignal.outcomeIndex,
            sharesWei,
            originalPrice,
            slippageTolerance
          );
        }
        
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️ Signal execution attempt ${attempt}/${maxRetries} failed for ${signalId}:`, lastError.message);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!executionResult) {
      throw new Error(`Signal execution failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
    }

    // Update signal record with order submission result
    try {
      await prisma.copiedSignal.update({
        where: { id: signalId },
        data: {
          orderId: executionResult.orderId,
          orderStatus: executionResult.status,
          status: 'pending', // Order is pending settlement
          submittedAt: new Date(),
        },
      });
      console.log(`✅ Signal ${signalId} order submitted to CLOB: ${executionResult.orderId}`);
      
      // Start monitoring order settlement in background
      monitorOrderSettlement(executionResult.orderId, signalId, true).catch((error) => {
        console.error(`⚠️ Error monitoring order settlement for ${executionResult.orderId}:`, error);
      });
    } catch (updateError) {
      console.error(`⚠️ Signal ${signalId} order submitted but failed to update record:`, updateError);
      console.log(`✅ Signal ${signalId} order submitted successfully (orderId: ${executionResult.orderId}), but status update failed`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error executing signal ${signalId}:`, errorMessage);

    try {
      const existingSignal = await prisma.copiedSignal.findUnique({
        where: { id: signalId },
      });

      if (existingSignal) {
        const { failureReason, failureCategory } = categorizeFailure(errorMessage);
        
        await prisma.copiedSignal.update({
          where: { id: signalId },
          data: {
            status: 'failed',
            errorMessage: errorMessage,
            failureReason: failureReason,
            failureCategory: failureCategory,
          },
        });
        console.log(`📝 Updated signal ${signalId} status to 'failed' (${failureCategory}: ${failureReason})`);
      } else {
        console.warn(`⚠️ Signal ${signalId} not found - cannot update status. Signal may have been deleted.`);
      }
    } catch (updateError) {
      console.error(`❌ Failed to update signal ${signalId} status:`, updateError instanceof Error ? updateError.message : 'Unknown error');
    }

    throw error;
  }
}

/**
 * Categorize failure reason from error message
 */
function categorizeFailure(errorMessage: string): { failureReason: string; failureCategory: string } {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes('not enough balance') || lowerMessage.includes('insufficient balance')) {
    return {
      failureReason: 'insufficient_balance',
      failureCategory: 'balance',
    };
  }
  
  if (lowerMessage.includes('not enough allowance') || lowerMessage.includes('allowance')) {
    return {
      failureReason: 'insufficient_allowance',
      failureCategory: 'balance',
    };
  }
  
  if (lowerMessage.includes('min size') || lowerMessage.includes('minimum')) {
    return {
      failureReason: 'below_minimum_size',
      failureCategory: 'validation',
    };
  }
  
  if (lowerMessage.includes('orderbook does not exist') || lowerMessage.includes('orderbook')) {
    return {
      failureReason: 'orderbook_unavailable',
      failureCategory: 'market',
    };
  }
  
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
  
  return {
    failureReason: 'unknown_error',
    failureCategory: 'other',
  };
}

