import { prisma } from '../config/database';
import { ethers } from 'ethers';

/**
 * Complete lifecycle view of a trade from start to finish
 */
export interface TradeLifecycle {
  // Trade identification
  id: string;
  configId: string;
  traderAddress: string;
  marketId: string;
  marketQuestion: string | null;
  
  // Stage 1: Trade Detection
  stage1_detected: {
    timestamp: Date;
    originalTrader: string;
    originalTxHash: string;
    originalAmount: string;
    originalPrice: string | null;
    originalShares: string | null;
    tradeType: string;
    outcomeIndex: number;
  };
  
  // Stage 2: Order Submission
  stage2_submitted: {
    timestamp: Date | null;
    orderId: string | null;
    copiedAmount: string;
    copiedPrice: string | null;
    copiedShares: string | null;
    orderStatus: string | null;
  };
  
  // Stage 3: Order Execution/Settlement
  stage3_settled: {
    timestamp: Date | null;
    txHash: string | null;
    finalPrice: string | null;
    finalShares: string | null;
    slippage: string | null; // Calculated slippage percentage
  };
  
  // Stage 4: Market Resolution (if applicable)
  stage4_resolved: {
    timestamp: Date | null;
    outcome: string | null; // "win", "loss", "pending", "cancelled"
    resolutionPrice: string | null;
    realizedPnl: string | null;
  };
  
  // Stage 5: Redemption (if applicable)
  stage5_redeemed: {
    timestamp: Date | null;
    txHash: string | null;
    status: string | null;
    error: string | null;
  };
  
  // Current state
  currentStatus: string;
  currentPrice: string | null;
  currentValue: string | null;
  unrealizedPnl: string | null;
  lastPriceUpdate: Date | null;
  
  // Failure information (if failed)
  failure: {
    category: string | null;
    reason: string | null;
    message: string | null;
  } | null;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Calculate slippage between original and executed price
 */
function calculateSlippage(originalPrice: string | null, executedPrice: string | null): string | null {
  if (!originalPrice || !executedPrice) return null;
  
  const original = parseFloat(originalPrice);
  const executed = parseFloat(executedPrice);
  
  if (original === 0) return null;
  
  const slippage = ((executed - original) / original) * 100;
  return slippage.toFixed(4);
}

/**
 * Get complete lifecycle view for a single trade
 */
export async function getTradeLifecycle(
  tradeId: string,
  userId: string
): Promise<TradeLifecycle | null> {
  const trade = await prisma.copiedTrade.findFirst({
    where: {
      id: tradeId,
      config: {
        userId,
      },
    },
    include: {
      config: {
        select: {
          targetTraderAddress: true,
        },
      },
    },
  });

  if (!trade) {
    return null;
  }

  // Calculate slippage
  const slippage = calculateSlippage(trade.originalPrice, trade.copiedPrice);

  return {
    id: trade.id,
    configId: trade.configId,
    traderAddress: trade.config.targetTraderAddress,
    marketId: trade.marketId,
    marketQuestion: trade.marketQuestion,
    
    stage1_detected: {
      timestamp: trade.createdAt,
      originalTrader: trade.originalTrader,
      originalTxHash: trade.originalTxHash,
      originalAmount: trade.originalAmount,
      originalPrice: trade.originalPrice || null,
      originalShares: trade.originalShares || null,
      tradeType: trade.tradeType,
      outcomeIndex: trade.outcomeIndex,
    },
    
    stage2_submitted: {
      timestamp: trade.submittedAt,
      orderId: trade.orderId,
      copiedAmount: trade.copiedAmount,
      copiedPrice: trade.copiedPrice || null,
      copiedShares: trade.copiedShares || null,
      orderStatus: trade.orderStatus || null,
    },
    
    stage3_settled: {
      timestamp: trade.settledAt,
      txHash: trade.copiedTxHash,
      finalPrice: trade.copiedPrice || null,
      finalShares: trade.copiedShares || null,
      slippage: slippage,
    },
    
    stage4_resolved: {
      timestamp: trade.resolvedAt,
      outcome: trade.outcome || null,
      resolutionPrice: trade.resolutionPrice || null,
      realizedPnl: trade.pnl || null,
    },
    
    stage5_redeemed: {
      timestamp: trade.redeemedAt,
      txHash: trade.redemptionTxHash,
      status: trade.redemptionStatus || null,
      error: trade.redemptionError || null,
    },
    
    currentStatus: trade.status,
    currentPrice: trade.currentPrice || null,
    currentValue: trade.currentValue || null,
    unrealizedPnl: trade.unrealizedPnl || null,
    lastPriceUpdate: trade.lastPriceUpdate,
    
    failure: trade.status === 'failed' ? {
      category: trade.failureCategory || null,
      reason: trade.failureReason || null,
      message: trade.errorMessage || null,
    } : null,
    
    createdAt: trade.createdAt,
    updatedAt: trade.updatedAt,
  };
}

/**
 * Get lifecycle view for multiple trades (paginated)
 */
export async function getTradesLifecycle(
  userId: string,
  options?: {
    configId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{
  trades: TradeLifecycle[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const { configId, status, limit = 50, offset = 0 } = options || {};

  const where: any = {
    config: {
      userId,
    },
  };

  if (configId) {
    where.configId = configId;
  }

  if (status) {
    where.status = status;
  }

  const [trades, total] = await Promise.all([
    prisma.copiedTrade.findMany({
      where,
      include: {
        config: {
          select: {
            targetTraderAddress: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.copiedTrade.count({ where }),
  ]);

  const lifecycleTrades: TradeLifecycle[] = trades.map((trade) => {
    const slippage = calculateSlippage(trade.originalPrice, trade.copiedPrice);

    return {
      id: trade.id,
      configId: trade.configId,
      traderAddress: trade.config.targetTraderAddress,
      marketId: trade.marketId,
      marketQuestion: trade.marketQuestion,
      
      stage1_detected: {
        timestamp: trade.createdAt,
        originalTrader: trade.originalTrader,
        originalTxHash: trade.originalTxHash,
        originalAmount: trade.originalAmount,
        originalPrice: trade.originalPrice || null,
        originalShares: trade.originalShares || null,
        tradeType: trade.tradeType,
        outcomeIndex: trade.outcomeIndex,
      },
      
      stage2_submitted: {
        timestamp: trade.submittedAt,
        orderId: trade.orderId,
        copiedAmount: trade.copiedAmount,
        copiedPrice: trade.copiedPrice || null,
        copiedShares: trade.copiedShares || null,
        orderStatus: trade.orderStatus || null,
      },
      
      stage3_settled: {
        timestamp: trade.settledAt,
        txHash: trade.copiedTxHash,
        finalPrice: trade.copiedPrice || null,
        finalShares: trade.copiedShares || null,
        slippage: slippage,
      },
      
      stage4_resolved: {
        timestamp: trade.resolvedAt,
        outcome: trade.outcome || null,
        resolutionPrice: trade.resolutionPrice || null,
        realizedPnl: trade.pnl || null,
      },
      
      stage5_redeemed: {
        timestamp: trade.redeemedAt,
        txHash: trade.redemptionTxHash,
        status: trade.redemptionStatus || null,
        error: trade.redemptionError || null,
      },
      
      currentStatus: trade.status,
      currentPrice: trade.currentPrice || null,
      currentValue: trade.currentValue || null,
      unrealizedPnl: trade.unrealizedPnl || null,
      lastPriceUpdate: trade.lastPriceUpdate,
      
      failure: trade.status === 'failed' ? {
        category: trade.failureCategory || null,
        reason: trade.failureReason || null,
        message: trade.errorMessage || null,
      } : null,
      
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    };
  });

  return {
    trades: lifecycleTrades,
    total,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  };
}

/**
 * Enhanced statistics including redemption and slippage metrics
 */
export interface EnhancedTradeStatistics {
  // Basic stats
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  pendingTrades: number;
  settledTrades: number;
  
  // Outcome stats
  resolvedTrades: number;
  wins: number;
  losses: number;
  cancelledTrades: number;
  pendingOutcomes: number;
  
  // PnL stats
  realizedPnl: string;
  unrealizedPnl: string;
  totalPnl: string;
  
  // Redemption stats
  redeemableTrades: number; // Settled trades in closed markets
  redeemedTrades: number;
  redemptionPendingTrades: number;
  redemptionFailedTrades: number;
  
  // Slippage stats
  averageSlippage: string | null;
  maxSlippage: string | null;
  minSlippage: string | null;
  slippageCount: number; // Number of trades with slippage data
  
  // Volume stats
  totalVolume: string;
  averageTradeSize: string;
  totalInvested: string;
  totalReturned: string;
  
  // Performance stats
  winRate: string;
  roi: string; // Return on investment (totalPnl / totalInvested * 100)
  
  // Time stats
  averageHoldTime: string | null; // Average time from settlement to resolution (in hours)
}

/**
 * Get enhanced statistics including redemption and slippage
 */
export async function getEnhancedStatistics(
  userId: string,
  configId?: string
): Promise<EnhancedTradeStatistics> {
  const where: any = configId 
    ? { configId }
    : {
        config: {
          userId,
        },
      };

  if (configId) {
    // Verify ownership
    const config = await prisma.copyTradingConfig.findFirst({
      where: { id: configId, userId },
    });
    if (!config) {
      throw new Error('Config not found');
    }
  }

  const trades = await prisma.copiedTrade.findMany({
    where,
  });

  // Basic counts
  const successfulTrades = trades.filter(t => t.status === 'settled' || t.status === 'executed');
  const failedTrades = trades.filter(t => t.status === 'failed');
  const pendingTrades = trades.filter(t => t.status === 'pending');
  const settledTrades = trades.filter(t => t.status === 'settled' && t.orderStatus === 'SETTLED');

  // Outcome stats
  const resolvedTrades = trades.filter(t => t.outcome && t.pnl);
  const wins = resolvedTrades.filter(t => t.outcome === 'win');
  const losses = resolvedTrades.filter(t => t.outcome === 'loss');
  const cancelledTrades = resolvedTrades.filter(t => t.outcome === 'cancelled');
  const pendingOutcomes = settledTrades.filter(t => !t.outcome || t.outcome === 'pending');

  // PnL stats
  const realizedPnl = resolvedTrades.reduce((sum, t) => sum + parseFloat(t.pnl || '0'), 0);
  const openTrades = trades.filter(t => 
    t.status === 'settled' && 
    t.tradeType === 'buy' && 
    !t.outcome && 
    t.unrealizedPnl
  );
  const unrealizedPnl = openTrades.reduce((sum, t) => sum + parseFloat(t.unrealizedPnl || '0'), 0);
  const totalPnl = realizedPnl + unrealizedPnl;

  // Redemption stats (for now, we'll count settled trades - can be enhanced with market status check)
  const redeemedTrades = trades.filter(t => t.redemptionStatus === 'redeemed');
  const redemptionPendingTrades = trades.filter(t => t.redemptionStatus === 'pending');
  const redemptionFailedTrades = trades.filter(t => t.redemptionStatus === 'failed');
  // Redeemable = settled trades that haven't been redeemed yet (simplified - should check market status)
  const redeemableTrades = settledTrades.filter(t => 
    !t.redemptionStatus && 
    t.outcome && 
    (t.outcome === 'win' || t.outcome === 'loss')
  ).length;

  // Slippage stats
  const slippages: number[] = [];
  trades.forEach(trade => {
    if (trade.originalPrice && trade.copiedPrice) {
      const slippage = calculateSlippage(trade.originalPrice, trade.copiedPrice);
      if (slippage) {
        slippages.push(parseFloat(slippage));
      }
    }
  });

  const averageSlippage = slippages.length > 0 
    ? (slippages.reduce((sum, s) => sum + s, 0) / slippages.length).toFixed(4)
    : null;
  const maxSlippage = slippages.length > 0 ? Math.max(...slippages).toFixed(4) : null;
  const minSlippage = slippages.length > 0 ? Math.min(...slippages).toFixed(4) : null;

  // Volume stats
  const totalVolume = successfulTrades.reduce((sum, t) => sum + parseFloat(t.copiedAmount || '0'), 0);
  const averageTradeSize = successfulTrades.length > 0 
    ? (totalVolume / successfulTrades.length).toFixed(6)
    : '0';
  
  const buyTrades = trades.filter(t => t.tradeType === 'buy' && t.costBasis);
  const totalInvested = buyTrades.reduce((sum, t) => sum + parseFloat(t.costBasis || t.copiedAmount || '0'), 0);
  
  const sellTrades = trades.filter(t => t.tradeType === 'sell' && t.copiedAmount);
  const totalReturned = sellTrades.reduce((sum, t) => sum + parseFloat(t.copiedAmount || '0'), 0);

  // Performance stats
  const winRate = resolvedTrades.length > 0 
    ? ((wins.length / resolvedTrades.length) * 100).toFixed(2)
    : '0.00';
  
  const roi = totalInvested > 0 
    ? ((totalPnl / totalInvested) * 100).toFixed(2)
    : '0.00';

  // Time stats - average time from settlement to resolution
  const resolvedWithTimestamps = resolvedTrades.filter(t => t.settledAt && t.resolvedAt);
  let averageHoldTime: string | null = null;
  if (resolvedWithTimestamps.length > 0) {
    const totalHoldTimeMs = resolvedWithTimestamps.reduce((sum, t) => {
      return sum + (t.resolvedAt!.getTime() - t.settledAt!.getTime());
    }, 0);
    const avgHours = (totalHoldTimeMs / resolvedWithTimestamps.length) / (1000 * 60 * 60);
    averageHoldTime = avgHours.toFixed(2);
  }

  return {
    totalTrades: trades.length,
    successfulTrades: successfulTrades.length,
    failedTrades: failedTrades.length,
    pendingTrades: pendingTrades.length,
    settledTrades: settledTrades.length,
    
    resolvedTrades: resolvedTrades.length,
    wins: wins.length,
    losses: losses.length,
    cancelledTrades: cancelledTrades.length,
    pendingOutcomes: pendingOutcomes.length,
    
    realizedPnl: realizedPnl.toFixed(6),
    unrealizedPnl: unrealizedPnl.toFixed(6),
    totalPnl: totalPnl.toFixed(6),
    
    redeemableTrades,
    redeemedTrades: redeemedTrades.length,
    redemptionPendingTrades: redemptionPendingTrades.length,
    redemptionFailedTrades: redemptionFailedTrades.length,
    
    averageSlippage,
    maxSlippage,
    minSlippage,
    slippageCount: slippages.length,
    
    totalVolume: totalVolume.toFixed(6),
    averageTradeSize,
    totalInvested: totalInvested.toFixed(6),
    totalReturned: totalReturned.toFixed(6),
    
    winRate,
    roi,
    
    averageHoldTime,
  };
}

