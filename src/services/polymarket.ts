import { ethers } from 'ethers';
import { config } from '../config/env';

export interface TraderInfo {
  address: string;
  isValid: boolean;
  totalTrades?: number;
  totalVolume?: string; // Total volume in USDC
  activePositions?: number;
  winRate?: number; // Percentage (0-100)
  lastTradeTimestamp?: number;
  marketsTraded?: string[]; // Market IDs
  buyTrades?: number;
  sellTrades?: number;
  userInfo?: {
    name?: string;
    pseudonym?: string;
    bio?: string;
    profileImage?: string;
  };
}

/**
 * Verify if an address is a valid Polymarket trader
 * Uses Polymarket Data API to check trading history
 */
export async function verifyTrader(address: string): Promise<TraderInfo> {
  try {
    // Validate address format first
    if (!isValidAddress(address)) {
      return {
        address: address.toLowerCase(),
        isValid: false,
      };
    }

    // Normalize address
    const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());

    // Use Polymarket Data API - fetch both activity and positions
    const apiUrl = config.polymarket.dataApiUrl;
    
    // Fetch activity (trades)
    const activityUrl = `${apiUrl}/activity?user=${normalizedAddress}&limit=1000`;
    const activityResponse = await fetch(activityUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!activityResponse.ok) {
      throw new Error(`Activity API request failed: ${activityResponse.status} ${activityResponse.statusText}`);
    }

    const activities = await activityResponse.json();

    // Fetch positions (current holdings)
    const positionsUrl = `${apiUrl}/positions?user=${normalizedAddress}&limit=1000`;
    let positions: any[] = [];
    try {
      const positionsResponse = await fetch(positionsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (positionsResponse.ok) {
        positions = await positionsResponse.json();
      }
    } catch (error) {
      // Positions endpoint might fail, but that's okay - we can still use activity data
      console.warn('Could not fetch positions:', error);
    }

    // If no activities found, trader might not exist or have no activity
    if (!Array.isArray(activities) || activities.length === 0) {
      return {
        address: normalizedAddress,
        isValid: false,
        totalTrades: 0,
        totalVolume: '0',
        activePositions: 0,
      };
    }

    // Filter for trade activities
    const trades = activities.filter((activity: any) => activity.type === 'TRADE');
    
    // Calculate trader statistics
    let totalVolume = ethers.BigNumber.from(0);
    const marketIds = new Set<string>();
    const marketCategories = new Set<string>();
    let buyTrades = 0;
    let sellTrades = 0;

    trades.forEach((trade: any) => {
      if (trade.usdcSize) {
        // usdcSize is already in USDC (not wei), so we multiply by 1e6 to convert to wei for BigNumber
        const usdcAmount = ethers.utils.parseUnits(trade.usdcSize.toString(), 6);
        totalVolume = totalVolume.add(usdcAmount);
      }
      
      if (trade.conditionId) {
        marketIds.add(trade.conditionId);
      }
      
      if (trade.side === 'BUY') {
        buyTrades++;
      } else if (trade.side === 'SELL') {
        sellTrades++;
      }
    });

    // Get unique markets from all activities
    activities.forEach((activity: any) => {
      if (activity.conditionId) {
        marketIds.add(activity.conditionId);
      }
    });

    // Get last trade timestamp
    const lastTrade = trades.length > 0 ? trades[0] : null;
    const lastTradeTimestamp = lastTrade?.timestamp 
      ? Math.floor(new Date(lastTrade.timestamp).getTime() / 1000)
      : undefined;

    // Count active positions from positions endpoint, or fallback to activities
    const activePositions = positions.length > 0 
      ? positions.filter((p: any) => p.size && parseFloat(p.size) > 0).length
      : activities.filter((a: any) => a.size && parseFloat(a.size) > 0).length;

    // Get user profile info if available
    const firstActivity = activities[0];
    const userInfo = firstActivity ? {
      name: firstActivity.name,
      pseudonym: firstActivity.pseudonym,
      bio: firstActivity.bio,
      profileImage: firstActivity.profileImage,
    } : undefined;

    return {
      address: normalizedAddress,
      isValid: true,
      totalTrades: trades.length,
      totalVolume: ethers.utils.formatUnits(totalVolume, 6), // Convert back to USDC
      activePositions,
      winRate: undefined, // Would need resolved markets to calculate
      lastTradeTimestamp,
      marketsTraded: Array.from(marketIds),
      // Additional info from API
      buyTrades,
      sellTrades,
      userInfo,
    };
  } catch (error) {
    console.error('Error verifying trader:', error);
    // Return minimal info on error
    try {
      return {
        address: ethers.utils.getAddress(address.toLowerCase()),
        isValid: false,
      };
    } catch {
      return {
        address: address.toLowerCase(),
        isValid: false,
      };
    }
  }
}

/**
 * Get detailed trader statistics
 * Uses Polymarket Data API
 */
export async function getTraderStats(address: string): Promise<{
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  totalVolume: string;
  averageTradeSize: string;
  mostTradedCategories: string[];
  recentTrades: any[];
}> {
  try {
    const normalizedAddress = ethers.utils.getAddress(address.toLowerCase());
    const apiUrl = `${config.polymarket.dataApiUrl}/activity`;
    const url = `${apiUrl}?user=${normalizedAddress}&limit=1000`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const activities = await response.json();

    if (!Array.isArray(activities)) {
      return {
        totalTrades: 0,
        buyTrades: 0,
        sellTrades: 0,
        totalVolume: '0',
        averageTradeSize: '0',
        mostTradedCategories: [],
        recentTrades: [],
      };
    }

    const trades = activities.filter((a: any) => a.type === 'TRADE');
    const buyTrades = trades.filter((t: any) => t.side === 'BUY').length;
    const sellTrades = trades.filter((t: any) => t.side === 'SELL').length;

    let totalVolume = ethers.BigNumber.from(0);
    const categoryCounts: Record<string, number> = {};

    trades.forEach((trade: any) => {
      if (trade.usdcSize) {
        const usdcAmount = ethers.utils.parseUnits(trade.usdcSize.toString(), 6);
        totalVolume = totalVolume.add(usdcAmount);
      }
      // Note: API doesn't provide category directly, would need to fetch from market data
    });

    const averageTradeSize = trades.length > 0
      ? ethers.utils.formatUnits(totalVolume.div(trades.length), 6)
      : '0';

    const mostTradedCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category]) => category);

    return {
      totalTrades: trades.length,
      buyTrades,
      sellTrades,
      totalVolume: ethers.utils.formatUnits(totalVolume, 6),
      averageTradeSize,
      mostTradedCategories,
      recentTrades: trades.slice(0, 10).map((t: any) => ({
        id: t.transactionHash || t.conditionId,
        type: t.side,
        amount: t.usdcSize?.toString() || '0',
        market: t.title || 'Unknown',
        category: t.eventSlug || 'Unknown',
        timestamp: t.timestamp ? Math.floor(new Date(t.timestamp).getTime() / 1000) : 0,
        transactionHash: t.transactionHash,
      })),
    };
  } catch (error) {
    console.error('Error getting trader stats:', error);
    throw error;
  }
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  try {
    ethers.utils.getAddress(address);
    return true;
  } catch {
    return false;
  }
}

