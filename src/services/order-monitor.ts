import { getOrderStatus } from './polymarket-clob';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

/**
 * Monitor order status and update database when settled
 * Supports both CopiedTrade and CopiedSignal
 */
export async function monitorOrderSettlement(orderId: string, tradeId: string, isSignal: boolean = false): Promise<void> {
  try {
    const orderStatus = await getOrderStatus(orderId);
    
    logger.info('Order status check', {
      orderId,
      tradeId,
      isSignal,
      status: orderStatus.status,
      filledSize: orderStatus.filled_size,
      txHash: orderStatus.tx_hash,
    });

    // Update database with current order status
    const updateData: any = {
      orderStatus: orderStatus.status,
    };

    // If order is settled, update with transaction hash
    if (orderStatus.status === 'SETTLED' && orderStatus.tx_hash) {
      updateData.copiedTxHash = orderStatus.tx_hash;
      updateData.status = 'settled';
      updateData.settledAt = new Date();
      
      logger.info('Order settled', {
        orderId,
        tradeId,
        isSignal,
        txHash: orderStatus.tx_hash,
      });
    } else if (orderStatus.status === 'CANCELLED' || orderStatus.status === 'REJECTED') {
      updateData.status = 'failed';
      updateData.errorMessage = `Order ${orderStatus.status.toLowerCase()}`;
      
      logger.warn('Order cancelled or rejected', {
        orderId,
        tradeId,
        isSignal,
        status: orderStatus.status,
      });
    }

    // Update the appropriate model
    if (isSignal) {
      await prisma.copiedSignal.updateMany({
        where: { orderId },
        data: updateData,
      });
    } else {
      await prisma.copiedTrade.updateMany({
        where: { orderId },
        data: updateData,
      });
    }
  } catch (error) {
    logger.error('Error monitoring order settlement', {
      orderId,
      tradeId,
      isSignal,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Wait for order settlement with timeout
 */
export async function waitForOrderSettlement(
  orderId: string,
  maxWaitTime: number = 300000 // 5 minutes default
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await getOrderStatus(orderId);
      
      if (status.status === 'SETTLED' && status.tx_hash) {
        return status.tx_hash;
      }
      
      if (status.status === 'CANCELLED' || status.status === 'REJECTED') {
        throw new Error(`Order ${orderId} was ${status.status}`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      if (error instanceof Error && error.message.includes('was CANCELLED')) {
        throw error;
      }
      // Continue polling on other errors
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
  
  throw new Error(`Order ${orderId} did not settle within ${maxWaitTime}ms`);
}

