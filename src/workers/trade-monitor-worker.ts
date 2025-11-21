import cron from 'node-cron';
import { monitorTrades } from '../services/trade-monitor';
import { config } from '../config/env';

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Start the trade monitoring worker
 * Runs periodically to check for new trades
 */
export function startTradeMonitorWorker(): void {
  console.log('🔄 Starting trade monitoring worker...');

  // Convert interval from milliseconds to cron format
  const intervalSeconds = Math.floor(config.workers.tradeMonitorInterval / 1000);
  
  // Run every N seconds (configurable)
  // Format: "*/N * * * * *" means every N seconds
  const cronPattern = `*/${intervalSeconds} * * * * *`;

  // Start cron job
  cron.schedule(cronPattern, async () => {
    try {
      console.log('🔍 Running trade monitor...');
      const tradesQueued = await monitorTrades();
      if (tradesQueued > 0) {
        console.log(`✅ Queued ${tradesQueued} trades for execution`);
      }
    } catch (error) {
      console.error('❌ Error in trade monitor:', error);
    }
  });

  console.log(`✅ Trade monitor worker started (checking every ${intervalSeconds} seconds)`);
}

/**
 * Stop the trade monitoring worker
 */
export function stopTradeMonitorWorker(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('🛑 Trade monitor worker stopped');
  }
}

