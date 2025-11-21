import { logger } from "../utils/logger";
import { prisma } from "../config/database";
import { trackDeposit, updateDepositStatus } from "../services/deposit-tracker";
import { config } from "../config/env";
import { broadcastDepositUpdate } from "../routes/deposit-sse";

const TRACKING_INTERVAL = parseInt(process.env.DEPOSIT_TRACKING_INTERVAL || "60000", 10); // Default: 60 seconds
const MAX_TRACKING_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Background worker to track pending deposits
 */
export async function startDepositTrackerWorker() {
  logger.info("🔄 Starting deposit tracker worker", {
    interval: TRACKING_INTERVAL,
  });
  
  async function trackPendingDeposits() {
    try {
      // Find all pending/processing/bridging deposits
      const pendingDeposits = await prisma.deposit.findMany({
        where: {
          status: {
            in: ["pending", "processing", "bridging"],
          },
          createdAt: {
            gte: new Date(Date.now() - MAX_TRACKING_AGE), // Only track deposits from last 24 hours
          },
        },
        include: {
          user: true,
        },
      });
      
      if (pendingDeposits.length === 0) {
        return;
      }
      
      logger.info(`Tracking ${pendingDeposits.length} pending deposits`);
      
      // Track each deposit
      for (const deposit of pendingDeposits) {
        try {
          const trackingInfo = await trackDeposit(deposit.id);
          
          // Broadcast update via SSE if status changed
          const previousStatus = deposit.status;
          if (trackingInfo.status !== previousStatus) {
            broadcastDepositUpdate(deposit.id, trackingInfo);
            logger.info("Deposit status changed, broadcasting via SSE", {
              depositId: deposit.id,
              previousStatus,
              newStatus: trackingInfo.status,
            });
          }
        } catch (error) {
          logger.error("Error tracking deposit", {
            depositId: deposit.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    } catch (error) {
      logger.error("Error in deposit tracker worker", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  // Run immediately on start
  await trackPendingDeposits();
  
  // Then run on interval
  setInterval(async () => {
    await trackPendingDeposits();
  }, TRACKING_INTERVAL);
}

/**
 * Track deposits manually (for testing or on-demand tracking)
 */
export async function trackDepositsManually(userAddress?: string) {
  try {
    let deposits;
    
    if (userAddress) {
      // Track deposits for specific user
      const user = await prisma.user.findUnique({
        where: { address: userAddress.toLowerCase() },
      });
      
      if (!user) {
        throw new Error(`User not found: ${userAddress}`);
      }
      
      deposits = await prisma.deposit.findMany({
        where: {
          userId: user.id,
          status: {
            in: ["pending", "processing", "bridging"],
          },
        },
      });
    } else {
      // Track all pending deposits
      deposits = await prisma.deposit.findMany({
        where: {
          status: {
            in: ["pending", "processing", "bridging"],
          },
          createdAt: {
            gte: new Date(Date.now() - MAX_TRACKING_AGE),
          },
        },
      });
    }
    
    logger.info(`Manually tracking ${deposits.length} deposits`);
    
    const results = await Promise.allSettled(
      deposits.map(deposit => trackDeposit(deposit.id))
    );
    
    const successful = results.filter(r => r.status === "fulfilled").length;
    const failed = results.filter(r => r.status === "rejected").length;
    
    logger.info("Manual deposit tracking completed", {
      total: deposits.length,
      successful,
      failed,
    });
    
    return {
      total: deposits.length,
      successful,
      failed,
    };
  } catch (error) {
    logger.error("Error in manual deposit tracking", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

