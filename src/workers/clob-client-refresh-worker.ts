import cron from 'node-cron';
import { logger } from '../utils/logger';
import { 
  getCachedUserAddresses, 
  refreshClobClient, 
  getCacheStats,
  CACHE_TTL_MS
} from '../services/clob-client-cache';
import { prisma } from '../config/database';

// Refresh clients 15 minutes before they expire (45 minutes after creation)
// This ensures clients are always fresh and never expire during use
const REFRESH_BEFORE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_THRESHOLD_MS = CACHE_TTL_MS - REFRESH_BEFORE_EXPIRY_MS; // 45 minutes

/**
 * Refresh CLOB clients that are close to expiring
 * This ensures clients are always available and never expire during use
 */
async function refreshExpiringClients(): Promise<void> {
  try {
    const cachedAddresses = getCachedUserAddresses();
    
    if (cachedAddresses.length === 0) {
      logger.debug('No cached CLOB clients to refresh');
      return;
    }

    logger.info(`🔄 Checking ${cachedAddresses.length} cached CLOB clients for refresh...`);
    
    const stats = getCacheStats();
    let refreshed = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of stats.entries) {
      const age = entry.age;
      
      // Refresh if client is older than the refresh threshold (45 minutes)
      if (age >= REFRESH_THRESHOLD_MS) {
        try {
          // Verify user still exists and has proxy wallet before refreshing
          const user = await prisma.user.findUnique({
            where: { address: entry.userAddress },
            select: { proxyWallet: true },
          });

          if (!user || !user.proxyWallet) {
            logger.warn(`Skipping refresh for ${entry.userAddress} - user not found or no proxy wallet`);
            skipped++;
            continue;
          }

          logger.info(`🔄 Refreshing CLOB client for user ${entry.userAddress} (age: ${Math.floor(age / 60000)}m)`);
          await refreshClobClient(entry.userAddress);
          refreshed++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`❌ Failed to refresh CLOB client for ${entry.userAddress}`, {
            error: errorMessage,
          });
          errors++;
        }
      } else {
        skipped++;
      }
    }

    logger.info(`✅ CLOB client refresh completed`, {
      total: cachedAddresses.length,
      refreshed,
      skipped,
      errors,
    });
  } catch (error) {
    logger.error('❌ Error in CLOB client refresh worker', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Pre-warm CLOB clients for all users with proxy wallets
 * This is called on startup to ensure all existing users have cached clients
 */
async function preWarmAllClients(): Promise<void> {
  try {
    logger.info('🔑 Pre-warming CLOB clients for all users with proxy wallets...');
    
    const users = await prisma.user.findMany({
      where: {
        proxyWallet: { not: null },
      },
      select: {
        address: true,
        proxyWallet: true,
      },
    });

    logger.info(`Found ${users.length} users with proxy wallets`);

    let success = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const { preWarmClobClient } = await import('../services/clob-client-cache');
        await preWarmClobClient(user.address);
        success++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`⚠️ Failed to pre-warm CLOB client for ${user.address}:`, errorMessage);
        errors++;
      }
    }

    logger.info(`✅ Pre-warming completed`, {
      total: users.length,
      success,
      errors,
    });
  } catch (error) {
    logger.error('❌ Error pre-warming CLOB clients', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Start the CLOB client refresh worker
 * Refreshes clients every 30 minutes to ensure they're always fresh
 */
export function startClobClientRefreshWorker(): void {
  logger.info('🔄 Starting CLOB client refresh worker...');

  // Pre-warm all existing users on startup
  preWarmAllClients().catch(error => {
    logger.error('Error pre-warming CLOB clients on startup', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Refresh expiring clients every 30 minutes
  // This ensures clients are refreshed before they expire (45 min mark)
  cron.schedule('*/30 * * * *', async () => {
    try {
      logger.info('🔄 Running scheduled CLOB client refresh...');
      await refreshExpiringClients();
    } catch (error) {
      logger.error('❌ Error in scheduled CLOB client refresh', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  logger.info('✅ CLOB client refresh worker started (refreshing every 30 minutes)');
}

/**
 * Stop the CLOB client refresh worker
 */
export function stopClobClientRefreshWorker(): void {
  logger.info('🛑 CLOB client refresh worker stopped');
}

