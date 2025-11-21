import { tradeExecutionQueue } from '../services/queue';
import { executeTrade } from '../services/trade-executor';
import { executeSignal } from '../services/signal-executor';

/**
 * Start the trade execution worker
 * Processes queued trades and executes them automatically
 */
export function startTradeExecutorWorker(): void {
  console.log('⚡ Starting trade execution worker...');

  // Process trade execution jobs with concurrency limit
  // Limit to 5 concurrent trades to prevent rate limit issues
  // This ensures we don't exceed:
  // - API key creation: 50 req/10s (with caching, this should be fine)
  // - Order submission: 40/s sustained (5 concurrent = ~0.5/s per trade, well under limit)
  tradeExecutionQueue.process('execute-trade', 5, async (job) => {
    const { tradeId, configId, originalTrade } = job.data;
    
    console.log(`📊 Processing trade execution: ${tradeId}`);
    
    try {
      await executeTrade({
        tradeId,
        configId,
        originalTrade,
      });
      
      return { success: true, tradeId };
    } catch (error) {
      console.error(`❌ Trade execution failed for ${tradeId}:`, error);
      throw error; // Retries are temporarily disabled (attempts: 1)
    }
  });

  // Process signal execution jobs with same concurrency limit
  tradeExecutionQueue.process('execute-signal', 5, async (job) => {
    const { signalId, configId, originalSignal } = job.data;
    
    console.log(`📊 Processing signal execution: ${signalId}`);
    
    try {
      await executeSignal({
        signalId,
        configId,
        originalSignal,
      });
      
      return { success: true, signalId };
    } catch (error) {
      console.error(`❌ Signal execution failed for ${signalId}:`, error);
      throw error; // Retries are temporarily disabled (attempts: 1)
    }
  });

  console.log('✅ Trade execution worker started (trades and signals)');
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    tradeExecutionQueue.getWaitingCount(),
    tradeExecutionQueue.getActiveCount(),
    tradeExecutionQueue.getCompletedCount(),
    tradeExecutionQueue.getFailedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
  };
}

