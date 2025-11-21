import cron from 'node-cron';
import { monitorSignals } from '../services/signal-monitor';
import { config } from '../config/env';

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Start the signal monitoring worker
 * Runs periodically to check for new signals from external API
 */
export function startSignalMonitorWorker(): void {
  console.log('🔄 Starting signal monitoring worker...');

  // Use same interval as trade monitor
  const intervalSeconds = Math.floor(config.workers.tradeMonitorInterval / 1000);
  
  // Run every N seconds (configurable)
  const cronPattern = `*/${intervalSeconds} * * * * *`;

  // Start cron job
  cron.schedule(cronPattern, async () => {
    try {
      console.log('🔍 Running signal monitor...');
      const signalsQueued = await monitorSignals();
      if (signalsQueued > 0) {
        console.log(`✅ Queued ${signalsQueued} signals for execution`);
      }
    } catch (error) {
      console.error('❌ Error in signal monitor:', error);
    }
  });

  console.log(`✅ Signal monitor worker started (checking every ${intervalSeconds} seconds)`);
}

/**
 * Stop the signal monitoring worker
 */
export function stopSignalMonitorWorker(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('🛑 Signal monitor worker stopped');
  }
}

