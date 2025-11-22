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
  // Concurrency set to 1 to ensure rate limits are respected across all workers
  // Queue-level rate limiter (in queue.ts) ensures max 1 job per 50ms globally
  // This prevents multiple workers from submitting orders simultaneously
  // Rate limits:
  // - Order submission: 40/s sustained (we process at 20/s max to leave headroom)
  // - API key creation: 50 req/10s (with caching, this should be fine)
  tradeExecutionQueue.process('execute-trade', 1, async (job) => {
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
  // Concurrency set to 1 to ensure rate limits are respected across all workers
  tradeExecutionQueue.process('execute-signal', 1, async (job) => {
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

