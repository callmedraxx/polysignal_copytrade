import { prisma } from '../config/database';
import { getMarketInfo } from './polymarket-clob';
import { logger } from '../utils/logger';

/**
 * Calculate current value and unrealized PnL for a trade
 */
export async function updateTradeCurrentValue(tradeId: string): Promise<void> {
  try {
    const trade = await prisma.copiedTrade.findUnique({
      where: { id: tradeId },
    });

    if (!trade || !trade.copiedShares || !trade.marketId || trade.status !== 'settled') {
      return; // Only update settled trades with shares
    }

    // Get current market price
    const marketInfo = await getMarketInfo(trade.marketId);
    const tokenId = marketInfo.tokens?.[trade.outcomeIndex];
    
    if (!tokenId) {
      logger.warn('Could not find token ID for trade', { tradeId, marketId: trade.marketId, outcomeIndex: trade.outcomeIndex });
      return;
    }

    // Get current price from orderbook or market info
    let currentPrice: number | null = null;
    
    if (marketInfo.tokens && Array.isArray(marketInfo.tokens)) {
      const token = marketInfo.tokens[trade.outcomeIndex];
      if (token && typeof token === 'object' && 'price' in token) {
        currentPrice = parseFloat(token.price as string);
      } else if (marketInfo.outcomePrices && Array.isArray(marketInfo.outcomePrices)) {
        currentPrice = parseFloat(marketInfo.outcomePrices[trade.outcomeIndex] || '0');
      }
    }

    if (!currentPrice || currentPrice <= 0) {
      logger.warn('Could not determine current price for trade', { tradeId, marketId: trade.marketId });
      return;
    }

    const shares = parseFloat(trade.copiedShares);
    const currentValue = (shares * currentPrice).toFixed(6);
    const costBasis = trade.costBasis ? parseFloat(trade.costBasis) : parseFloat(trade.copiedAmount);
    const unrealizedPnl = (parseFloat(currentValue) - costBasis).toFixed(6);

    await prisma.copiedTrade.update({
      where: { id: tradeId },
      data: {
        currentPrice: currentPrice.toFixed(6),
        currentValue: currentValue,
        unrealizedPnl: unrealizedPnl,
        lastPriceUpdate: new Date(),
      },
    });
  } catch (error) {
    logger.error('Error updating trade current value', {
      tradeId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get trade history for a specific config
 */
export async function getTradeHistoryForConfig(
  configId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    tradeType?: string;
  }
) {
  const { limit = 50, offset = 0, status, tradeType } = options || {};

  const where: any = { configId };
  if (status) where.status = status;
  if (tradeType) where.tradeType = tradeType;

  const [trades, total] = await Promise.all([
    prisma.copiedTrade.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        config: {
          select: {
            targetTraderAddress: true,
            traderInfo: true,
          },
        },
      },
    }),
    prisma.copiedTrade.count({ where }),
  ]);

  return {
    trades,
    total,
    limit,
    offset,
  };
}

/**
 * Get trade history for a user (all configs)
 */
export async function getTradeHistoryForUser(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    tradeType?: string;
    configId?: string;
  }
) {
  const { limit = 50, offset = 0, status, tradeType, configId } = options || {};

  const where: any = {
    config: {
      userId,
    },
  };
  
  if (status) where.status = status;
  if (tradeType) where.tradeType = tradeType;
  if (configId) where.configId = configId;

  const [trades, total] = await Promise.all([
    prisma.copiedTrade.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        config: {
          select: {
            id: true,
            targetTraderAddress: true,
            traderInfo: true,
          },
        },
      },
    }),
    prisma.copiedTrade.count({ where }),
  ]);

  return {
    trades,
    total,
    limit,
    offset,
  };
}

/**
 * Calculate trade statistics for a config
 */
export async function getTradeStatsForConfig(configId: string) {
  const trades = await prisma.copiedTrade.findMany({
    where: { configId },
  });

  const successful = trades.filter(t => t.status === 'settled' || t.status === 'executed');
  const failed = trades.filter(t => t.status === 'failed');
  const pending = trades.filter(t => t.status === 'pending' || t.status === 'executed');

  // Calculate realized PnL (from resolved trades)
  const resolvedTrades = trades.filter(t => t.outcome && t.pnl);
  const realizedPnl = resolvedTrades.reduce((sum, t) => {
    return sum + parseFloat(t.pnl || '0');
  }, 0);

  // Calculate unrealized PnL (from open positions)
  const openTrades = trades.filter(t => 
    t.status === 'settled' && 
    t.tradeType === 'buy' && 
    !t.outcome && 
    t.unrealizedPnl
  );
  const unrealizedPnl = openTrades.reduce((sum, t) => {
    return sum + parseFloat(t.unrealizedPnl || '0');
  }, 0);

  // Calculate total invested (cost basis of all buy trades)
  const buyTrades = trades.filter(t => t.tradeType === 'buy' && t.costBasis);
  const totalInvested = buyTrades.reduce((sum, t) => {
    return sum + parseFloat(t.costBasis || t.copiedAmount || '0');
  }, 0);

  // Calculate total returned (from sell trades)
  const sellTrades = trades.filter(t => t.tradeType === 'sell' && t.copiedAmount);
  const totalReturned = sellTrades.reduce((sum, t) => {
    return sum + parseFloat(t.copiedAmount || '0');
  }, 0);

  return {
    totalTrades: trades.length,
    successful: successful.length,
    failed: failed.length,
    pending: pending.length,
    realizedPnl: realizedPnl.toFixed(6),
    unrealizedPnl: unrealizedPnl.toFixed(6),
    totalPnl: (realizedPnl + unrealizedPnl).toFixed(6),
    totalInvested: totalInvested.toFixed(6),
    totalReturned: totalReturned.toFixed(6),
    winRate: resolvedTrades.length > 0 
      ? (resolvedTrades.filter(t => parseFloat(t.pnl || '0') > 0).length / resolvedTrades.length * 100).toFixed(2)
      : '0.00',
  };
}

/**
 * Calculate overall trade statistics for a user
 */
export async function getTradeStatsForUser(userId: string) {
  const configs = await prisma.copyTradingConfig.findMany({
    where: { userId },
    include: {
      copiedTrades: true,
    },
  });

  let totalTrades = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalPending = 0;
  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;
  let totalInvested = 0;
  let totalReturned = 0;
  let totalResolvedTrades = 0;
  let totalWinningTrades = 0;

  for (const config of configs) {
    const trades = config.copiedTrades;
    totalTrades += trades.length;
    
    totalSuccessful += trades.filter(t => t.status === 'settled' || t.status === 'executed').length;
    totalFailed += trades.filter(t => t.status === 'failed').length;
    totalPending += trades.filter(t => t.status === 'pending' || t.status === 'executed').length;

    const resolvedTrades = trades.filter(t => t.outcome && t.pnl);
    totalResolvedTrades += resolvedTrades.length;
    totalWinningTrades += resolvedTrades.filter(t => parseFloat(t.pnl || '0') > 0).length;
    
    totalRealizedPnl += resolvedTrades.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);

    const openTrades = trades.filter(t => 
      t.status === 'settled' && 
      t.tradeType === 'buy' && 
      !t.outcome && 
      t.unrealizedPnl
    );
    totalUnrealizedPnl += openTrades.reduce((sum, t) => sum + parseFloat(t.unrealizedPnl || '0'), 0);

    const buyTrades = trades.filter(t => t.tradeType === 'buy' && t.costBasis);
    totalInvested += buyTrades.reduce((sum, t) => sum + parseFloat(t.costBasis || t.copiedAmount || '0'), 0);

    const sellTrades = trades.filter(t => t.tradeType === 'sell' && t.copiedAmount);
    totalReturned += sellTrades.reduce((sum, t) => sum + parseFloat(t.copiedAmount || '0'), 0);
  }

  return {
    totalTrades,
    successful: totalSuccessful,
    failed: totalFailed,
    pending: totalPending,
    realizedPnl: totalRealizedPnl.toFixed(6),
    unrealizedPnl: totalUnrealizedPnl.toFixed(6),
    totalPnl: (totalRealizedPnl + totalUnrealizedPnl).toFixed(6),
    totalInvested: totalInvested.toFixed(6),
    totalReturned: totalReturned.toFixed(6),
    winRate: totalResolvedTrades > 0 
      ? ((totalWinningTrades / totalResolvedTrades) * 100).toFixed(2)
      : '0.00',
    totalConfigs: configs.length,
  };
}

/**
 * Get failure statistics grouped by category
 */
export async function getFailureStats(configId?: string, userId?: string) {
  const where: any = {
    status: 'failed',
  };

  if (configId) {
    where.configId = configId;
  } else if (userId) {
    where.config = { userId };
  }

  const failedTrades = await prisma.copiedTrade.findMany({
    where,
    select: {
      failureCategory: true,
      failureReason: true,
    },
  });

  const byCategory: Record<string, number> = {};
  const byReason: Record<string, number> = {};

  for (const trade of failedTrades) {
    const category = trade.failureCategory || 'other';
    const reason = trade.failureReason || 'unknown_error';
    
    byCategory[category] = (byCategory[category] || 0) + 1;
    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  return {
    byCategory,
    byReason,
    total: failedTrades.length,
  };
}

