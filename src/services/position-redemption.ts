import { ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import { OperationType, SafeTransaction } from '@polymarket/builder-relayer-client';
import { createRelayerClientForUser } from './relayer-client';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { checkMarketStatus } from './market-status';
import { logger } from '../utils/logger';

// CTF (Conditional Token Framework) Interface for redeemPositions
const CTF_INTERFACE = new Interface([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)"
]);

/**
 * Get parent collection ID for a condition
 * In Polymarket CTF, the parent collection is typically the zero address for the root collection
 * or can be derived from the condition structure
 */
function getParentCollectionId(conditionId: string): string {
  // For Polymarket, the parent collection is typically the zero address (root collection)
  // This represents the root collection for all conditions
  return ethers.constants.HashZero;
}

/**
 * Get index sets for redemption
 * For binary markets, we need to redeem all outcomes [0, 1]
 * For multi-outcome markets, we need to redeem all possible outcomes
 * @param numOutcomes Number of outcomes in the market (default: 2 for binary)
 */
function getIndexSets(numOutcomes: number = 2): string[] {
  // Create index sets array [0, 1, 2, ...] for all outcomes
  return Array.from({ length: numOutcomes }, (_, i) => i.toString());
}

/**
 * Check if a market is resolved/closed and can be redeemed
 */
export async function isMarketResolved(marketSlug: string): Promise<boolean> {
  try {
    const marketStatus = await checkMarketStatus(marketSlug);
    // Market is resolved if it's closed
    return marketStatus.isClosed;
  } catch (error) {
    logger.error('Error checking market status for resolution', {
      marketSlug,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Check if a copied trade has positions that need redemption
 * A trade needs redemption if:
 * - Market is closed/resolved
 * - Trade status is "settled" (order was executed)
 * - Redemption status is null or "pending"
 * - User still has conditional token balance for this position
 */
export async function needsRedemption(copiedTradeId: string): Promise<boolean> {
  try {
    const trade = await prisma.copiedTrade.findUnique({
      where: { id: copiedTradeId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!trade || !trade.config?.user) {
      return false;
    }

    // Trade must be settled (order executed)
    if (trade.status !== 'settled' && trade.orderStatus !== 'SETTLED') {
      return false;
    }

    // Already redeemed or redemption in progress
    if (trade.redemptionStatus === 'redeemed') {
      return false;
    }

    // Need to check if market is closed
    // Try to get market slug from trade metadata or fetch from API
    // For now, we'll check by conditionId
    const marketId = trade.marketId;
    
    // Try to get market slug from Polymarket API using conditionId
    let marketSlug: string | null = null;
    try {
      const response = await fetch(
        `${config.polymarket.dataApiUrl}/markets?condition_id=${marketId}`
      );
      if (response.ok) {
        const markets = await response.json() as any[];
        if (markets && markets.length > 0) {
          marketSlug = markets[0].slug;
        }
      }
    } catch (error) {
      logger.warn('Could not fetch market slug for redemption check', {
        marketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // If we have a slug, check market status
    if (marketSlug) {
      const isResolved = await isMarketResolved(marketSlug);
      return isResolved;
    }

    // Fallback: assume market needs redemption if trade is settled
    // (We'll verify market status during actual redemption)
    return true;
  } catch (error) {
    logger.error('Error checking if trade needs redemption', {
      copiedTradeId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Redeem positions for a copied trade
 * This redeems conditional tokens back to collateral (USDC) after market resolution
 */
export async function redeemPositions(
  copiedTradeId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get trade with user info
    const trade = await prisma.copiedTrade.findUnique({
      where: { id: copiedTradeId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!trade || !trade.config?.user) {
      throw new Error(`Trade ${copiedTradeId} not found or missing user`);
    }

    const user = trade.config.user;
    if (!user.proxyWallet) {
      throw new Error(`User ${user.address} does not have a proxy wallet`);
    }

    // Update redemption status to pending
    await prisma.copiedTrade.update({
      where: { id: copiedTradeId },
      data: {
        redemptionStatus: 'pending',
      },
    });

    // Get market information to determine number of outcomes
    // For now, assume binary market (2 outcomes) - can be enhanced later
    const conditionId = trade.marketId;
    const numOutcomes = 2; // Binary markets have 2 outcomes (NO, YES)

    // Prepare redemption parameters
    const collateralToken = config.blockchain.usdcAddress;
    const parentCollectionId = getParentCollectionId(conditionId);
    const indexSets = getIndexSets(numOutcomes);

    // Create redemption transaction
    const ctfAddress = config.blockchain.ctfAddress;
    const redeemTx: SafeTransaction = {
      to: ctfAddress,
      operation: OperationType.Call,
      data: CTF_INTERFACE.encodeFunctionData('redeemPositions', [
        collateralToken,
        parentCollectionId,
        conditionId,
        indexSets,
      ]),
      value: '0',
    };

    logger.info('Redeeming positions', {
      copiedTradeId,
      userAddress: user.address,
      proxyWallet: user.proxyWallet,
      conditionId,
      indexSets,
    });

    // Execute redemption via relayer
    const relayerClient = createRelayerClientForUser(user.address);
    const response = await relayerClient.execute([redeemTx], 'Redeem position');
    const result = await response.wait();

    if (result && result.transactionHash) {
      // Update trade with redemption info
      await prisma.copiedTrade.update({
        where: { id: copiedTradeId },
        data: {
          redemptionStatus: 'redeemed',
          redemptionTxHash: result.transactionHash,
          redeemedAt: new Date(),
        },
      });

      logger.info('Positions redeemed successfully', {
        copiedTradeId,
        txHash: result.transactionHash,
      });

      return {
        success: true,
        txHash: result.transactionHash,
      };
    } else {
      throw new Error('Redemption transaction completed but no transaction hash returned');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error redeeming positions', {
      copiedTradeId,
      error: errorMessage,
    });

    // Update trade with redemption error
    try {
      await prisma.copiedTrade.update({
        where: { id: copiedTradeId },
        data: {
          redemptionStatus: 'failed',
          redemptionError: errorMessage,
        },
      });
    } catch (updateError) {
      logger.error('Failed to update redemption error status', {
        copiedTradeId,
        error: updateError instanceof Error ? updateError.message : 'Unknown error',
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a copied signal has positions that need redemption
 * A signal needs redemption if:
 * - Market is closed/resolved
 * - Signal status is "settled" (order was executed)
 * - Redemption status is null or "pending"
 * - User still has conditional token balance for this position
 */
export async function needsSignalRedemption(copiedSignalId: string): Promise<boolean> {
  try {
    const signal = await prisma.copiedSignal.findUnique({
      where: { id: copiedSignalId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!signal || !signal.config?.user) {
      return false;
    }

    // Signal must be settled (order executed)
    if (signal.status !== 'settled' && signal.orderStatus !== 'SETTLED') {
      return false;
    }

    // Already redeemed or redemption in progress
    if (signal.redemptionStatus === 'redeemed') {
      return false;
    }

    // Need to check if market is closed
    const marketId = signal.marketId;
    
    // Try to get market slug from Polymarket API using conditionId
    let marketSlug: string | null = null;
    try {
      const response = await fetch(
        `${config.polymarket.dataApiUrl}/markets?condition_id=${marketId}`
      );
      if (response.ok) {
        const markets = await response.json() as any[];
        if (markets && markets.length > 0) {
          marketSlug = markets[0].slug;
        }
      }
    } catch (error) {
      logger.warn('Could not fetch market slug for signal redemption check', {
        marketId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // If we have a slug, check market status
    if (marketSlug) {
      const isResolved = await isMarketResolved(marketSlug);
      return isResolved;
    }

    // Fallback: assume market needs redemption if signal is settled
    return true;
  } catch (error) {
    logger.error('Error checking if signal needs redemption', {
      copiedSignalId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Redeem positions for a copied signal
 * This redeems conditional tokens back to collateral (USDC) after market resolution
 */
export async function redeemSignalPositions(
  copiedSignalId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get signal with user info
    const signal = await prisma.copiedSignal.findUnique({
      where: { id: copiedSignalId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!signal || !signal.config?.user) {
      throw new Error(`Signal ${copiedSignalId} not found or missing user`);
    }

    const user = signal.config.user;
    if (!user.proxyWallet) {
      throw new Error(`User ${user.address} does not have a proxy wallet`);
    }

    // Update redemption status to pending
    await prisma.copiedSignal.update({
      where: { id: copiedSignalId },
      data: {
        redemptionStatus: 'pending',
      },
    });

    // Get market information to determine number of outcomes
    // For now, assume binary market (2 outcomes) - can be enhanced later
    const conditionId = signal.marketId;
    const numOutcomes = 2; // Binary markets have 2 outcomes (NO, YES)

    // Prepare redemption parameters
    const collateralToken = config.blockchain.usdcAddress;
    const parentCollectionId = getParentCollectionId(conditionId);
    const indexSets = getIndexSets(numOutcomes);

    // Create redemption transaction
    const ctfAddress = config.blockchain.ctfAddress;
    const redeemTx: SafeTransaction = {
      to: ctfAddress,
      operation: OperationType.Call,
      data: CTF_INTERFACE.encodeFunctionData('redeemPositions', [
        collateralToken,
        parentCollectionId,
        conditionId,
        indexSets,
      ]),
      value: '0',
    };

    logger.info('Redeeming signal positions', {
      copiedSignalId,
      userAddress: user.address,
      proxyWallet: user.proxyWallet,
      conditionId,
      indexSets,
    });

    // Execute redemption via relayer
    const relayerClient = createRelayerClientForUser(user.address);
    const response = await relayerClient.execute([redeemTx], 'Redeem signal position');
    const result = await response.wait();

    if (result && result.transactionHash) {
      // Update signal with redemption info
      await prisma.copiedSignal.update({
        where: { id: copiedSignalId },
        data: {
          redemptionStatus: 'redeemed',
          redemptionTxHash: result.transactionHash,
          redeemedAt: new Date(),
        },
      });

      logger.info('Signal positions redeemed successfully', {
        copiedSignalId,
        txHash: result.transactionHash,
      });

      return {
        success: true,
        txHash: result.transactionHash,
      };
    } else {
      throw new Error('Redemption transaction completed but no transaction hash returned');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error redeeming signal positions', {
      copiedSignalId,
      error: errorMessage,
    });

    // Update signal with redemption error
    try {
      await prisma.copiedSignal.update({
        where: { id: copiedSignalId },
        data: {
          redemptionStatus: 'failed',
          redemptionError: errorMessage,
        },
      });
    } catch (updateError) {
      logger.error('Failed to update signal redemption error status', {
        copiedSignalId,
        error: updateError instanceof Error ? updateError.message : 'Unknown error',
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Find all copied trades that need redemption
 */
export async function findTradesNeedingRedemption(): Promise<string[]> {
  try {
    // Find all settled trades that haven't been redeemed
    const trades = await prisma.copiedTrade.findMany({
      where: {
        status: 'settled',
        orderStatus: 'SETTLED',
        OR: [
          { redemptionStatus: null },
          { redemptionStatus: 'pending' },
        ],
      },
      select: {
        id: true,
      },
      take: 100, // Limit to avoid overloading
    });

    const tradeIds = trades.map((t) => t.id);

    // Filter to only those that actually need redemption
    const needsRedemptionList: string[] = [];
    for (const tradeId of tradeIds) {
      if (await needsRedemption(tradeId)) {
        needsRedemptionList.push(tradeId);
      }
    }

    return needsRedemptionList;
  } catch (error) {
    logger.error('Error finding trades needing redemption', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Find all copied signals that need redemption
 */
export async function findSignalsNeedingRedemption(): Promise<string[]> {
  try {
    // Find all settled signals that haven't been redeemed
    const signals = await prisma.copiedSignal.findMany({
      where: {
        status: 'settled',
        orderStatus: 'SETTLED',
        OR: [
          { redemptionStatus: null },
          { redemptionStatus: 'pending' },
        ],
      },
      select: {
        id: true,
      },
      take: 100, // Limit to avoid overloading
    });

    const signalIds = signals.map((s) => s.id);

    // Filter to only those that actually need redemption
    const needsRedemptionList: string[] = [];
    for (const signalId of signalIds) {
      if (await needsSignalRedemption(signalId)) {
        needsRedemptionList.push(signalId);
      }
    }

    return needsRedemptionList;
  } catch (error) {
    logger.error('Error finding signals needing redemption', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return [];
  }
}

/**
 * Auto-redeem all positions that need redemption
 * Handles both copied trades and copied signals
 */
export async function autoRedeemPositions(): Promise<number> {
  try {
    const tradesNeedingRedemption = await findTradesNeedingRedemption();
    const signalsNeedingRedemption = await findSignalsNeedingRedemption();

    const totalNeedingRedemption = tradesNeedingRedemption.length + signalsNeedingRedemption.length;

    if (totalNeedingRedemption === 0) {
      logger.info('No trades or signals need redemption');
      return 0;
    }

    logger.info(`Found ${tradesNeedingRedemption.length} trades and ${signalsNeedingRedemption.length} signals needing redemption`);

    let redeemedCount = 0;
    let failedCount = 0;

    // Process trade redemptions (with rate limiting to avoid overwhelming the relayer)
    for (const tradeId of tradesNeedingRedemption) {
      try {
        const result = await redeemPositions(tradeId);
        if (result.success) {
          redeemedCount++;
          logger.info(`Successfully redeemed trade ${tradeId}`, {
            txHash: result.txHash,
          });
        } else {
          failedCount++;
          logger.warn(`Failed to redeem trade ${tradeId}`, {
            error: result.error,
          });
        }

        // Small delay between redemptions to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failedCount++;
        logger.error(`Error redeeming trade ${tradeId}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Process signal redemptions (with rate limiting to avoid overwhelming the relayer)
    for (const signalId of signalsNeedingRedemption) {
      try {
        const result = await redeemSignalPositions(signalId);
        if (result.success) {
          redeemedCount++;
          logger.info(`Successfully redeemed signal ${signalId}`, {
            txHash: result.txHash,
          });
        } else {
          failedCount++;
          logger.warn(`Failed to redeem signal ${signalId}`, {
            error: result.error,
          });
        }

        // Small delay between redemptions to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failedCount++;
        logger.error(`Error redeeming signal ${signalId}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info(`Auto-redemption complete: ${redeemedCount} succeeded (${tradesNeedingRedemption.length} trades + ${signalsNeedingRedemption.length} signals), ${failedCount} failed`);

    return redeemedCount;
  } catch (error) {
    logger.error('Error in auto-redeem positions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 0;
  }
}

