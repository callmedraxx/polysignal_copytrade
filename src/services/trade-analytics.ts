import { prisma } from '../config/database';
import { ethers } from 'ethers';

export interface TradeStatistics {
  totalTrades: number;
  executedTrades: number;
  pendingTrades: number;
  failedTrades: number;
  wins: number;
  losses: number;
  pendingOutcomes: number;
  totalPnL: string; // Total PnL in USDC
  winRate: number; // Percentage (0-100)
  totalVolume: string; // Total volume traded in USDC
  averageTradeSize: string; // Average trade size in USDC
  bestTrade: {
    pnl: string;
    marketQuestion: string;
    tradeType: string;
  } | null;
  worstTrade: {
    pnl: string;
    marketQuestion: string;
    tradeType: string;
  } | null;
}

export interface TraderStatistics {
  traderAddress: string;
  traderInfo: any;
  totalTrades: number;
  executedTrades: number;
  wins: number;
  losses: number;
  totalPnL: string;
  winRate: number;
  totalVolume: string;
  averageTradeSize: string;
}

/**
 * Get trade statistics for a user's copy trading configuration
 */
export async function getConfigStatistics(
  configId: string,
  userId: string
): Promise<TradeStatistics> {
  // Verify config belongs to user
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  // Get all trades for this config
  const trades = await prisma.copiedTrade.findMany({
    where: {
      configId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return calculateStatistics(trades);
}

/**
 * Get trade statistics for all user's copy trading (including deleted configs)
 */
export async function getUserStatistics(userId: string): Promise<TradeStatistics> {
  // Get all trades for user through config relationship
  const trades = await prisma.copiedTrade.findMany({
    where: {
      config: {
        userId,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return calculateStatistics(trades);
}

/**
 * Get statistics per trader (grouped by trader address)
 * Includes trades from both active and deleted configs
 */
export async function getTraderStatistics(userId: string): Promise<TraderStatistics[]> {
  // Get all trades for user through config relationship
  const allTrades = await prisma.copiedTrade.findMany({
    where: {
      config: {
        userId,
      },
    },
  });

  // Get active configs for trader info
  const configs = await prisma.copyTradingConfig.findMany({
    where: {
      userId,
    },
  });

  // Group trades by trader address (originalTrader)
  const traderMap = new Map<string, any[]>();

  allTrades.forEach((trade) => {
    const traderAddress = trade.originalTrader.toLowerCase();
    if (!traderMap.has(traderAddress)) {
      traderMap.set(traderAddress, []);
    }
    traderMap.get(traderAddress)!.push(trade);
  });

  // Calculate statistics for each trader
  const traderStats: TraderStatistics[] = [];

  for (const [traderAddress, trades] of traderMap.entries()) {
    // Find config for trader info (use first active config if available)
    const config = configs.find(
      (c) => c.targetTraderAddress.toLowerCase() === traderAddress
    );
    
    const stats = calculateStatistics(trades);
    
    traderStats.push({
      traderAddress,
      traderInfo: config?.traderInfo ? JSON.parse(config.traderInfo) : null,
      totalTrades: stats.totalTrades,
      executedTrades: stats.executedTrades,
      wins: stats.wins,
      losses: stats.losses,
      totalPnL: stats.totalPnL,
      winRate: stats.winRate,
      totalVolume: stats.totalVolume,
      averageTradeSize: stats.averageTradeSize,
    });
  }

  return traderStats.sort((a, b) => {
    // Sort by total PnL (descending)
    const pnlA = parseFloat(a.totalPnL);
    const pnlB = parseFloat(b.totalPnL);
    return pnlB - pnlA;
  });
}

/**
 * Calculate statistics from trades
 */
function calculateStatistics(trades: any[]): TradeStatistics {
  const executedTrades = trades.filter((t) => t.status === 'executed');
  const pendingTrades = trades.filter((t) => t.status === 'pending');
  const failedTrades = trades.filter((t) => t.status === 'failed');
  
  const resolvedTrades = executedTrades.filter(
    (t) => t.outcome === 'win' || t.outcome === 'loss'
  );
  const wins = resolvedTrades.filter((t) => t.outcome === 'win').length;
  const losses = resolvedTrades.filter((t) => t.outcome === 'loss').length;
  const pendingOutcomes = executedTrades.filter(
    (t) => !t.outcome || t.outcome === 'pending'
  ).length;

  // Calculate total PnL
  let totalPnL = ethers.BigNumber.from(0);
  resolvedTrades.forEach((trade) => {
    if (trade.pnl) {
      const pnlWei = ethers.utils.parseUnits(trade.pnl, 6); // USDC has 6 decimals
      totalPnL = totalPnL.add(pnlWei);
    }
  });

  // Calculate total volume
  let totalVolume = ethers.BigNumber.from(0);
  executedTrades.forEach((trade) => {
    if (trade.copiedAmount) {
      const amountWei = ethers.utils.parseUnits(trade.copiedAmount, 6);
      totalVolume = totalVolume.add(amountWei);
    }
  });

  // Calculate win rate
  const totalResolved = wins + losses;
  const winRate = totalResolved > 0 ? (wins / totalResolved) * 100 : 0;

  // Calculate average trade size
  const averageTradeSize =
    executedTrades.length > 0
      ? ethers.utils.formatUnits(totalVolume.div(executedTrades.length), 6)
      : '0';

  // Find best and worst trades
  let bestTrade: any = null;
  let worstTrade: any = null;
  let bestPnL = ethers.BigNumber.from(0);
  let worstPnL = ethers.BigNumber.from(0);

  resolvedTrades.forEach((trade) => {
    if (trade.pnl) {
      const pnlWei = ethers.utils.parseUnits(trade.pnl, 6);
      if (pnlWei.gt(bestPnL)) {
        bestPnL = pnlWei;
        bestTrade = {
          pnl: trade.pnl,
          marketQuestion: trade.marketQuestion || 'Unknown',
          tradeType: trade.tradeType,
        };
      }
      if (pnlWei.lt(worstPnL)) {
        worstPnL = pnlWei;
        worstTrade = {
          pnl: trade.pnl,
          marketQuestion: trade.marketQuestion || 'Unknown',
          tradeType: trade.tradeType,
        };
      }
    }
  });

  return {
    totalTrades: trades.length,
    executedTrades: executedTrades.length,
    pendingTrades: pendingTrades.length,
    failedTrades: failedTrades.length,
    wins,
    losses,
    pendingOutcomes,
    totalPnL: ethers.utils.formatUnits(totalPnL, 6),
    winRate: Math.round(winRate * 100) / 100, // Round to 2 decimal places
    totalVolume: ethers.utils.formatUnits(totalVolume, 6),
    averageTradeSize,
    bestTrade: bestTrade
      ? {
          pnl: bestTrade.pnl,
          marketQuestion: bestTrade.marketQuestion,
          tradeType: bestTrade.tradeType,
        }
      : null,
    worstTrade: worstTrade
      ? {
          pnl: worstTrade.pnl,
          marketQuestion: worstTrade.marketQuestion,
          tradeType: worstTrade.tradeType,
        }
      : null,
  };
}

/**
 * Get detailed trade history for a configuration
 */
export async function getConfigTradeHistory(
  configId: string,
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    outcome?: string;
  }
): Promise<{
  trades: any[];
  total: number;
  page: number;
  pageSize: number;
}> {
  // Verify config belongs to user
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const where: any = {
    configId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.outcome) {
    where.outcome = options.outcome;
  }

  const [trades, total] = await Promise.all([
    prisma.copiedTrade.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.copiedTrade.count({ where }),
  ]);

  return {
    trades: trades.map((trade) => ({
      id: trade.id,
      originalTrader: trade.originalTrader,
      originalTxHash: trade.originalTxHash,
      marketId: trade.marketId,
      marketQuestion: trade.marketQuestion,
      outcomeIndex: trade.outcomeIndex,
      tradeType: trade.tradeType,
      originalAmount: trade.originalAmount,
      originalPrice: trade.originalPrice,
      originalShares: trade.originalShares,
      copiedTxHash: trade.copiedTxHash,
      copiedAmount: trade.copiedAmount,
      copiedPrice: trade.copiedPrice,
      copiedShares: trade.copiedShares,
      status: trade.status,
      outcome: trade.outcome,
      pnl: trade.pnl,
      resolvedAt: trade.resolvedAt,
      resolutionPrice: trade.resolutionPrice,
      executedAt: trade.executedAt,
      createdAt: trade.createdAt,
    })),
    total,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  };
}

/**
 * Get detailed trade history for all user's copy trading
 */
export async function getUserTradeHistory(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    status?: string;
    outcome?: string;
    traderAddress?: string;
  }
): Promise<{
  trades: any[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  // Query trades directly by userId (includes trades from deleted configs)
  const where: any = {
    userId,
  };

  if (options?.status) {
    where.status = options.status;
  }

  if (options?.outcome) {
    where.outcome = options.outcome;
  }

  // If filtering by trader address, we need to check both active and deleted configs
  if (options?.traderAddress) {
    const configs = await prisma.copyTradingConfig.findMany({
      where: {
        userId,
        targetTraderAddress: {
          equals: options.traderAddress,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
      },
    });
    const configIds = configs.map((c) => c.id);
    
    // Include trades from active configs OR trades with matching originalTrader (for deleted configs)
    where.OR = [
      { configId: { in: configIds } },
      { 
        configId: null,
        originalTrader: {
          equals: options.traderAddress,
          mode: 'insensitive',
        },
      },
    ];
  }

  const [trades, total] = await Promise.all([
    prisma.copiedTrade.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
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
    trades: trades.map((trade) => ({
      id: trade.id,
      configId: trade.configId,
      traderAddress: trade.config?.targetTraderAddress || trade.originalTrader,
      traderInfo: trade.config?.traderInfo ? JSON.parse(trade.config.traderInfo) : null,
      originalTrader: trade.originalTrader,
      originalTxHash: trade.originalTxHash,
      marketId: trade.marketId,
      marketQuestion: trade.marketQuestion,
      outcomeIndex: trade.outcomeIndex,
      tradeType: trade.tradeType,
      originalAmount: trade.originalAmount,
      originalPrice: trade.originalPrice,
      originalShares: trade.originalShares,
      copiedTxHash: trade.copiedTxHash,
      copiedAmount: trade.copiedAmount,
      copiedPrice: trade.copiedPrice,
      copiedShares: trade.copiedShares,
      status: trade.status,
      outcome: trade.outcome,
      pnl: trade.pnl,
      resolvedAt: trade.resolvedAt,
      resolutionPrice: trade.resolutionPrice,
      executedAt: trade.executedAt,
      createdAt: trade.createdAt,
    })),
    total,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  };
}

