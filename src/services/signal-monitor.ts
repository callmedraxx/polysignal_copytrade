import { prisma } from '../config/database';
import { config, isProduction } from '../config/env';
import { tradeExecutionQueue } from './queue';
import { validateTradeAmount } from './position-sizer';
import { isMarketOpen } from './market-status';

export interface ExternalSignal {
  id: string;
  category: string;
  marketId: string;
  marketQuestion?: string;
  outcomeIndex: number;
  tradeType: 'buy' | 'sell';
  amount: string; // USDC amount
  price: number;
  shares?: string; // Number of shares
  transactionHash?: string;
  timestamp: string;
  slug?: string;
  eventSlug?: string;
}

/**
 * Monitor external API for new signals
 */
export async function monitorSignals(): Promise<number> {
  try {
    // Get all enabled copy signal configurations
    const enabledConfigs = await prisma.copySignalConfig.findMany({
      where: {
        enabled: true,
        authorized: true, // Only monitor authorized configs
      },
    });

    if (enabledConfigs.length === 0) {
      console.log('No enabled copy signal configurations found');
      return 0;
    }

    console.log(`Monitoring ${enabledConfigs.length} enabled signal configurations`);

    // Fetch signals from external API
    const signals = await fetchSignalsFromAPI();

    if (signals.length === 0) {
      return 0;
    }

    let totalSignalsQueued = 0;

    // Process each configuration
    for (const signalConfig of enabledConfigs) {
      try {
        const signalsQueued = await processConfigSignals(signalConfig, signals);
        totalSignalsQueued += signalsQueued;
      } catch (error: any) {
        // Handle Redis connection errors gracefully
        if (error?.message?.includes('MaxRetriesPerRequestError') || 
            error?.message?.includes('Redis') ||
            error?.code === 'ECONNREFUSED') {
          console.warn(`⚠️ Redis connection issue for config ${signalConfig.id}. Skipping this cycle.`);
          continue;
        }
        console.error(`Error processing config ${signalConfig.id}:`, error);
      }
    }

    console.log(`Queued ${totalSignalsQueued} signals for execution`);
    return totalSignalsQueued;
  } catch (error) {
    console.error('Error monitoring signals:', error);
    throw error;
  }
}

/**
 * Fetch signals from external API
 */
async function fetchSignalsFromAPI(): Promise<ExternalSignal[]> {
  const { signals } = config;
  
  if (!signals.apiUrl) {
    console.warn('⚠️ Signals API URL not configured. Skipping signal fetch.');
    return [];
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (signals.apiKey) {
      headers['Authorization'] = `Bearer ${signals.apiKey}`;
    }

    const response = await fetch(signals.apiUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch signals: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Handle different response formats
    // Expected format: { signals: [...] } or [...]
    const responseData = data as { signals?: any[] } | any[];
    const signalsArray = Array.isArray(responseData) ? responseData : (responseData.signals || []);
    
    return signalsArray.map((signal: any) => ({
      id: signal.id || signal.signalId,
      category: signal.category,
      marketId: signal.marketId || signal.conditionId,
      marketQuestion: signal.marketQuestion || signal.title,
      outcomeIndex: signal.outcomeIndex || (signal.side === 'YES' ? 1 : 0),
      tradeType: (signal.tradeType || signal.side || 'buy').toLowerCase() as 'buy' | 'sell',
      amount: signal.amount || signal.usdcSize || '0',
      price: signal.price || 0.5,
      shares: signal.shares || signal.size,
      transactionHash: signal.transactionHash,
      timestamp: signal.timestamp || new Date().toISOString(),
      slug: signal.slug,
      eventSlug: signal.eventSlug,
    }));
  } catch (error) {
    console.error('Error fetching signals from API:', error);
    return [];
  }
}

/**
 * Process signals for a specific configuration
 */
async function processConfigSignals(
  signalConfig: any,
  signals: ExternalSignal[]
): Promise<number> {
  const configCategories = JSON.parse(signalConfig.signalCategories) as string[];
  
  // Filter signals by category
  const relevantSignals = signals.filter((signal) =>
    configCategories.includes(signal.category)
  );

  if (relevantSignals.length === 0) {
    return 0;
  }

  console.log(`📊 Config ${signalConfig.id}: Found ${relevantSignals.length} signals matching categories`);

  // Get all previously processed signals for this config
  let processedSignalIds = new Set<string>();
  
  if (isProduction) {
    const processedSignals = await prisma.copiedSignal.findMany({
      where: {
        configId: signalConfig.id,
      },
      select: {
        signalId: true,
      },
    });
    
    processedSignalIds = new Set(
      processedSignals.map((s: { signalId: string }) => s.signalId)
    );
  } else {
    // In development, check recent signals
    const recentSignals = await prisma.copiedSignal.findMany({
      where: {
        configId: signalConfig.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    processedSignalIds = new Set(
      recentSignals.map((s: any) => s.signalId)
    );
  }

  let queuedCount = 0;
  let skippedClosed = 0;
  let skippedProcessed = 0;

  // Process each signal
  for (const signal of relevantSignals) {
    // Skip if already processed
    if (processedSignalIds.has(signal.id)) {
      skippedProcessed++;
      continue;
    }

    // Filter by trade type
    const tradeType = signal.tradeType.toLowerCase() as 'buy' | 'sell';
    if (tradeType === 'buy' && !signalConfig.copyBuyTrades) {
      continue;
    }
    if (tradeType === 'sell' && !signalConfig.copySellTrades) {
      continue;
    }

    // Validate trade amount
    const amountValidation = validateTradeAmount(
      signal.amount,
      tradeType,
      signalConfig
    );

    if (!amountValidation.isValid) {
      console.log(`Skipping signal ${signal.id}: ${amountValidation.reason}`);
      continue;
    }

    // Check if market is still open
    const marketSlug = signal.slug || signal.eventSlug;
    if (!marketSlug) {
      console.warn(`⚠️ Signal ${signal.id} missing slug, skipping`);
      continue;
    }
    
    const marketOpen = await isMarketOpen(marketSlug);
    if (!marketOpen) {
      const skipReason = `market ${marketSlug} is closed or not accepting orders`;
      skippedClosed++;
      console.log(`⏭️ Skipping signal ${signal.id}: ${skipReason}`);
      continue;
    }

    // For SELL signals, check if user has sufficient token balance
    if (tradeType === 'sell') {
      try {
        const user = await prisma.user.findUnique({
          where: { id: signalConfig.userId },
        });

        if (!user || !user.proxyWallet) {
          console.log(`⏭️ Skipping sell signal ${signal.id}: user not found or no proxy wallet`);
          continue;
        }

        // Calculate required shares (for future use)
        // const originalShares = signal.shares ? parseFloat(signal.shares) : 0;
        // Note: Shares calculation removed as it's not currently used

        // Get token address from market (would need to fetch from Polymarket API)
        // For now, skip balance check if we can't determine token address
        // The executor will catch insufficient balance errors
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`⚠️ Could not check token balance for sell signal ${signal.id}: ${errorMessage}`);
      }
    }

    // Create copied signal record
    const copiedSignal = await prisma.copiedSignal.create({
      data: {
        configId: signalConfig.id,
        signalId: signal.id,
        category: signal.category,
        originalTxHash: signal.transactionHash || null,
        marketId: signal.marketId,
        marketQuestion: signal.marketQuestion || null,
        outcomeIndex: signal.outcomeIndex,
        tradeType: tradeType,
        originalAmount: signal.amount,
        originalPrice: signal.price.toString(),
        originalShares: signal.shares || null,
        copiedAmount: '0', // Will be calculated during execution
        status: 'pending',
      },
    });

    // Queue signal for execution
    try {
      await tradeExecutionQueue.add(
        'execute-signal',
        {
          signalId: copiedSignal.id,
          configId: signalConfig.id,
          originalSignal: signal,
        },
        {
          jobId: `signal-${signal.id}-${signalConfig.id}`, // Unique job ID
          removeOnComplete: true,
        }
      );
      queuedCount++;
    } catch (queueError: any) {
      if (queueError?.message?.includes('MaxRetriesPerRequestError') || 
          queueError?.message?.includes('Redis') ||
          queueError?.code === 'ECONNREFUSED' ||
          queueError?.code === 'ENOTFOUND') {
        console.warn(`⚠️ Could not queue signal ${signal.id} for config ${signalConfig.id}: Redis unavailable. Signal record created but not queued.`);
        continue;
      }
      throw queueError;
    }
  }

  // Log summary
  if (queuedCount > 0 || skippedClosed > 0 || skippedProcessed > 0) {
    console.log(`📊 Config ${signalConfig.id}: Queued ${queuedCount}, Skipped: ${skippedClosed} closed, ${skippedProcessed} processed`);
  }

  return queuedCount;
}

