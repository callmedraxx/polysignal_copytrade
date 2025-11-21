import cron from 'node-cron';
import { syncSupportedAssets } from '../services/bridge-assets';
import { logger } from '../utils/logger';

/**
 * Start the bridge assets sync worker
 * Syncs supported assets from Polymarket Bridge API periodically
 * Default: Every 6 hours (to catch any changes in supported assets)
 */
export function startBridgeAssetsWorker(): void {
  logger.info('🔄 Starting bridge assets sync worker...');

  // Sync immediately on startup
  syncSupportedAssets().catch(error => {
    logger.error('Error syncing supported assets on startup', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Schedule sync every 6 hours
  // Format: "0 */6 * * *" means at minute 0 of every 6th hour
  cron.schedule('0 */6 * * *', async () => {
    try {
      logger.info('🔄 Running scheduled bridge assets sync...');
      const result = await syncSupportedAssets();
      logger.info('✅ Bridge assets sync completed', {
        synced: result.synced,
        errors: result.errors,
      });
    } catch (error) {
      logger.error('❌ Error in bridge assets sync worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info('✅ Bridge assets sync worker started (syncing every 6 hours)');
}

/**
 * Stop the bridge assets sync worker
 * Note: Cron jobs don't need explicit cleanup, but this function is provided for consistency
 */
export function stopBridgeAssetsWorker(): void {
  logger.info('🛑 Bridge assets sync worker stopped');
}

