import { prisma } from '../config/database';
import { config, isProduction } from '../config/env';
import { tradeExecutionQueue } from './queue';
import { validateTradeAmount, validateMarketCategory } from './position-sizer';
import { isMarketOpen } from './market-status';
import { ethers } from 'ethers';

export interface PolymarketTrade {
  proxyWallet: string;
  timestamp: string;
  conditionId: string;
  type: string;
  size: string;
  usdcSize: string;
  transactionHash: string;
  price: number;
  asset?: string; // Token ID for the outcome (used for orderbook validation)
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
}

/**
 * Monitor Polymarket for trades from tracked traders
 */
export async function monitorTrades(): Promise<number> {
  try {
    // Get all enabled copy trading configurations
    const enabledConfigs = await prisma.copyTradingConfig.findMany({
      where: {
        enabled: true,
        authorized: true, // Only monitor authorized configs
      },
    });

    if (enabledConfigs.length === 0) {
      console.log('No enabled copy trading configurations found');
      return 0;
    }

    console.log(`Monitoring ${enabledConfigs.length} enabled configurations`);

    let totalTradesQueued = 0;

    // Process each configuration
    for (const copyConfig of enabledConfigs) {
      try {
        const tradesQueued = await processConfigTrades(copyConfig);
        totalTradesQueued += tradesQueued;
      } catch (error: any) {
        // Handle Redis connection errors gracefully
        if (error?.message?.includes('MaxRetriesPerRequestError') || 
            error?.message?.includes('Redis') ||
            error?.code === 'ECONNREFUSED') {
          console.warn(`⚠️ Redis connection issue for config ${copyConfig.id}. Skipping this cycle.`);
          // Continue processing other configs
          continue;
        }
        console.error(`Error processing config ${copyConfig.id}:`, error);
        // Continue with other configs
      }
    }

    console.log(`Queued ${totalTradesQueued} trades for execution`);
    return totalTradesQueued;
  } catch (error) {
    console.error('Error monitoring trades:', error);
    throw error;
  }
}

/**
 * Process trades for a specific configuration
 */
async function processConfigTrades(copyConfig: any): Promise<number> {
  const traderAddress = copyConfig.targetTraderAddress.toLowerCase();
  
  // Only fetch trades that occurred after the config was created
  // This ensures we don't copy trades from before the user started copying this trader
  const configCreatedAt = copyConfig.createdAt;
  const configCreatedTimestamp = Math.floor(new Date(configCreatedAt).getTime() / 1000);
  
  // Fetch recent trades from Polymarket Data API
  const apiUrl = `${config.polymarket.dataApiUrl}/activity`;
  // Add timestamp filter to only get trades after config creation
  const url = `${apiUrl}?user=${traderAddress}&limit=100&from=${configCreatedTimestamp}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trades: ${response.status} ${response.statusText}`);
  }

  const activities = await response.json() as PolymarketTrade[];

  // Filter for TRADE type activities
  let trades = activities.filter((activity) => activity.type === 'TRADE');

  if (trades.length === 0) {
    return 0;
  }

  // Filter trades to only include those that occurred after the config was created
  // This ensures we only copy trades from after the user started copying this trader
  trades = trades.filter((trade) => {
    const tradeTimestamp = parseInt(trade.timestamp);
    return tradeTimestamp >= configCreatedTimestamp;
  });

  if (trades.length === 0) {
    console.log(`📊 Config ${copyConfig.id}: No trades found after config creation (${new Date(configCreatedAt).toISOString()})`);
    return 0;
  }

  // Sort by timestamp (newest first)
  trades = trades
    .sort((a, b) => {
      const timeA = parseInt(a.timestamp);
      const timeB = parseInt(b.timestamp);
      return timeB - timeA; // Descending order (newest first)
    })
    .slice(0, 100); // Limit to latest 100 trades per cycle

  console.log(`📊 Config ${copyConfig.id}: Found ${trades.length} trades after config creation (${new Date(configCreatedAt).toISOString()})`);

  // Get all previously fetched trades for this config (only in production)
  // In development, we skip persistence to allow testing with same trades
  let fetchedTxHashes = new Set<string>();
  
  if (isProduction) {
    const fetchedTrades = await prisma.fetchedTrade.findMany({
      where: {
        configId: copyConfig.id,
      },
      select: {
        originalTxHash: true,
      },
    });
    
    fetchedTxHashes = new Set(
      fetchedTrades.map((t: { originalTxHash: string }) => t.originalTxHash.toLowerCase())
    );
    
    console.log(`📋 Config ${copyConfig.id}: Found ${fetchedTxHashes.size} previously fetched trades`);
  } else {
    // In development, still check CopiedTrade for basic deduplication
  const recentTrades = await prisma.copiedTrade.findMany({
    where: {
      configId: copyConfig.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

    fetchedTxHashes = new Set(
      recentTrades.map((t: any) => t.originalTxHash.toLowerCase())
  );
  }

  let queuedCount = 0;
  let skippedOld = 0;
  let skippedClosed = 0;
  let skippedProcessed = 0;

  // Process each trade
  for (const trade of trades) {
    const tradeTxHash = trade.transactionHash.toLowerCase();
    
    // Skip if already fetched
    if (fetchedTxHashes.has(tradeTxHash)) {
      skippedProcessed++;
      continue;
    }
    
    // Persist this trade as fetched BEFORE processing (only in production)
    // This ensures even if processing fails, we won't fetch it again
    if (isProduction) {
      try {
        await prisma.fetchedTrade.upsert({
          where: {
            configId_originalTxHash: {
              configId: copyConfig.id,
              originalTxHash: trade.transactionHash,
            },
          },
          create: {
            configId: copyConfig.id,
            originalTxHash: trade.transactionHash,
            traderAddress: traderAddress,
            marketId: trade.conditionId,
            timestamp: trade.timestamp?.toString(),
            side: trade.side,
            processed: false, // Will be updated when processed
          },
          update: {
            // If it already exists, just update timestamp
            timestamp: trade.timestamp?.toString(),
          },
        });
      } catch (error) {
        // Log but continue - don't block processing
        console.warn(`⚠️ Failed to persist fetched trade ${trade.transactionHash}:`, error);
      }
    }

    // TEMPORARILY DISABLED FOR TESTING: Filter out trades older than config creation timestamp
    // const tradeTimestamp = new Date(trade.timestamp).getTime();
    // if (tradeTimestamp < configCreatedAt) {
    //   skippedOld++;
    //   continue;
    // }

    // Filter by trade type
    const tradeType = trade.side.toLowerCase() as 'buy' | 'sell';
    if (tradeType === 'buy' && !copyConfig.copyBuyTrades) {
      continue;
    }
    if (tradeType === 'sell' && !copyConfig.copySellTrades) {
      continue;
    }

    // Validate trade amount
    const amountValidation = validateTradeAmount(
      trade.usdcSize,
      tradeType,
      copyConfig
    );

    if (!amountValidation.isValid) {
      console.log(`Skipping trade ${trade.transactionHash}: ${amountValidation.reason}`);
      continue;
    }

    // Check if market is still open (skip closed markets)
    // Use slug instead of conditionId for Gamma API
    const marketSlug = trade.slug || trade.eventSlug;
    if (!marketSlug) {
      console.warn(`⚠️ Trade ${trade.transactionHash} missing slug, skipping`);
      continue;
    }
    
    const marketOpen = await isMarketOpen(marketSlug);
    if (!marketOpen) {
      const skipReason = `market ${marketSlug} is closed or not accepting orders`;
      skippedClosed++;
      console.log(`⏭️ Skipping trade ${trade.transactionHash}: ${skipReason}`);
      
      // Mark as processed with skip reason (only in production)
      if (isProduction) {
        try {
          await prisma.fetchedTrade.updateMany({
            where: {
              configId: copyConfig.id,
              originalTxHash: trade.transactionHash,
            },
            data: {
              processed: true,
              skippedReason: skipReason,
            },
          });
        } catch (error) {
          console.warn(`⚠️ Failed to update skipped reason for trade ${trade.transactionHash}:`, error);
        }
      }
      
      continue;
    }

    // Validate that orderbook exists for this market before queuing
    // This prevents "orderbook does not exist" errors during execution
    // Use the asset field (tokenId) for orderbook validation, not conditionId
    if (trade.asset) {
      try {
        const { getOrderBook } = await import('./polymarket-clob');
        await getOrderBook(trade.asset); // This will throw if orderbook doesn't exist
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('orderbook') && errorMessage.includes('does not exist')) {
          skippedClosed++;
          console.log(`⏭️ Skipping trade ${trade.transactionHash}: orderbook does not exist for token ${trade.asset}`);
          continue;
        }
        // For other errors, log but continue (might be temporary API issue)
        console.warn(`⚠️ Could not validate orderbook for trade ${trade.transactionHash}: ${errorMessage}`);
      }
    } else {
      console.warn(`⚠️ Trade ${trade.transactionHash} missing asset (tokenId), skipping orderbook validation`);
    }

    // Validate market category
    if (!validateMarketCategory(trade.eventSlug, copyConfig)) {
      const { inferCategories } = await import('./category-inference');
      const inferred = inferCategories(trade.eventSlug);
      const inferredStr = inferred.length > 0 ? ` (inferred: ${inferred.join(', ')})` : '';
      console.log(`Skipping trade ${trade.transactionHash}: category "${trade.eventSlug}"${inferredStr} not in allowed categories`);
      continue;
    }

    // For SELL trades, check if user has sufficient token balance BEFORE queuing
    if (tradeType === 'sell' && trade.asset) {
      try {
        // Get user from config to check their token balance
        const user = await prisma.user.findUnique({
          where: { id: copyConfig.userId },
        });

        if (!user || !user.proxyWallet) {
          console.log(`⏭️ Skipping sell trade ${trade.transactionHash}: user not found or no proxy wallet`);
          continue;
        }

        // Calculate required shares based on config
        // The original trade.size is in shares (already in decimal format, e.g., "57291.108332")
        // We need to calculate the copied shares amount based on the config
        const originalShares = trade.size ? parseFloat(trade.size) : 0;
        let requiredSharesWei: string;

        if (copyConfig.amountType === 'percentageOfOriginal') {
          // Percentage of original shares
          const percentage = parseFloat(copyConfig.sellAmount) / 100;
          const copiedShares = originalShares * percentage;
          requiredSharesWei = ethers.utils.parseUnits(copiedShares.toFixed(18), 18).toString();
        } else if (copyConfig.amountType === 'fixed') {
          // Fixed amount in USDC - need to convert to shares using price
          // For sell, we're selling shares, so we need to calculate shares from USDC amount
          const fixedAmountUSDC = parseFloat(copyConfig.sellAmount);
          const price = trade.price || 0.5; // Use trade price or default
          const sharesFromUSDC = fixedAmountUSDC / price;
          requiredSharesWei = ethers.utils.parseUnits(sharesFromUSDC.toFixed(18), 18).toString();
        } else {
          // Percentage of balance - for sell orders, use percentage of original shares as approximation
          // (Full calculation would require knowing current holdings, which is complex)
          const percentage = parseFloat(copyConfig.sellAmount) / 100;
          const copiedShares = originalShares * percentage;
          requiredSharesWei = ethers.utils.parseUnits(copiedShares.toFixed(18), 18).toString();
        }

        // Check token balance
        const { hasSufficientTokenBalance } = await import('./token-balance');
        const balanceCheck = await hasSufficientTokenBalance(
          user.address,
          trade.asset,
          requiredSharesWei
        );

        if (!balanceCheck.hasBalance) {
          const currentBalanceFormatted = ethers.utils.formatUnits(balanceCheck.currentBalance, 18);
          const requiredBalanceFormatted = ethers.utils.formatUnits(balanceCheck.requiredBalance, 18);
          console.log(
            `⏭️ Skipping sell trade ${trade.transactionHash}: insufficient token balance. ` +
            `Required: ${requiredBalanceFormatted} tokens, Available: ${currentBalanceFormatted} tokens`
          );
          skippedClosed++; // Reuse skippedClosed counter for balance issues
          continue;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ Could not check token balance for sell trade ${trade.transactionHash}: ${errorMessage}`);
        // Continue anyway - the balance check in executor will catch it
      }
    }

    // Mark fetched trade as processed (only in production)
    if (isProduction) {
      try {
        await prisma.fetchedTrade.updateMany({
          where: {
            configId: copyConfig.id,
            originalTxHash: trade.transactionHash,
          },
          data: {
            processed: true,
          },
        });
      } catch (error) {
        // Log but continue - don't block processing
        console.warn(`⚠️ Failed to mark fetched trade as processed ${trade.transactionHash}:`, error);
      }
    }

    // Create copied trade record
    const copiedTrade = await prisma.copiedTrade.create({
      data: {
        configId: copyConfig.id,
        originalTrader: traderAddress,
        originalTxHash: trade.transactionHash,
        marketId: trade.conditionId,
        marketQuestion: trade.title,
        outcomeIndex: trade.outcomeIndex,
        tradeType: tradeType,
        originalAmount: trade.usdcSize,
        originalPrice: trade.price.toString(),
        originalShares: trade.size || null, // Number of shares in original trade
        copiedAmount: '0', // Will be calculated during execution
        status: 'pending',
      },
    });

    // Queue trade for execution
    try {
      await tradeExecutionQueue.add(
        'execute-trade',
        {
          tradeId: copiedTrade.id,
          configId: copyConfig.id,
          originalTrade: trade,
        },
        {
          jobId: `trade-${trade.transactionHash}-${copyConfig.id}`, // Unique job ID
          removeOnComplete: true,
        }
      );
      queuedCount++;
    } catch (queueError: any) {
      // Handle Redis/Bull queue errors gracefully
      if (queueError?.message?.includes('MaxRetriesPerRequestError') || 
          queueError?.message?.includes('Redis') ||
          queueError?.code === 'ECONNREFUSED' ||
          queueError?.code === 'ENOTFOUND') {
        console.warn(`⚠️ Could not queue trade ${trade.transactionHash} for config ${copyConfig.id}: Redis unavailable. Trade record created but not queued.`);
        // Trade record is already created, so we can retry queueing later
        // For now, we'll skip incrementing queuedCount but keep the trade record
        continue;
      }
      // Re-throw other errors
      throw queueError;
    }
  }

  // Log summary
  if (queuedCount > 0 || skippedOld > 0 || skippedClosed > 0 || skippedProcessed > 0) {
    console.log(`📊 Config ${copyConfig.id}: Queued ${queuedCount}, Skipped: ${skippedOld} old, ${skippedClosed} closed, ${skippedProcessed} processed`);
  }

  return queuedCount;
}

/**
 * Get last processed timestamp for a configuration
 * This helps avoid reprocessing old trades
 */
export async function getLastProcessedTimestamp(configId: string): Promise<number | null> {
  const lastTrade = await prisma.copiedTrade.findFirst({
    where: {
      configId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!lastTrade) {
    return null;
  }

  return Math.floor(lastTrade.createdAt.getTime() / 1000);
}

