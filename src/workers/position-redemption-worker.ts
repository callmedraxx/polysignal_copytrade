import cron from 'node-cron';
import { autoRedeemPositions } from '../services/position-redemption';
import { logger } from '../utils/logger';
import { config } from '../config/env';

/**
 * Worker to periodically check for closed markets and auto-redeem positions
 * Runs every 5 minutes by default
 */
export function startPositionRedemptionWorker(): void {
  // Schedule to run every 5 minutes
  // Cron format: minute hour day month dayOfWeek
  const cronExpression = process.env.REDEMPTION_WORKER_CRON || '*/5 * * * *'; // Every 5 minutes
  const intervalMinutes = 5;

  logger.info(`Starting position redemption worker (runs every ${intervalMinutes} minutes)`);

  // Run immediately on start (optional - can be removed if you want to wait for first cron)
  autoRedeemPositions().catch((error) => {
    logger.error('Error in initial position redemption check', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Schedule periodic redemption checks
  cron.schedule(cronExpression, async () => {
    try {
      logger.info('Running position redemption worker');
      const redeemedCount = await autoRedeemPositions();
      logger.info(`Position redemption worker completed: ${redeemedCount} positions redeemed`);
    } catch (error) {
      logger.error('Error in position redemption worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info(`✅ Position redemption worker started (cron: ${cronExpression})`);
}

