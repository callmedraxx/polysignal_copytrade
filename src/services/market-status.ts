import { config } from '../config/env';

export interface MarketStatus {
  isOpen: boolean;
  isClosed: boolean;
  acceptingOrders: boolean;
  endDate?: Date;
  resolutionDate?: Date;
}

/**
 * Check if a Polymarket market is open (not closed) and accepting orders
 * Uses Gamma API to check market status by slug
 */
export async function checkMarketStatus(slug: string): Promise<MarketStatus> {
  try {
    // Fetch market information from Gamma API using slug
    const gammaApiUrl = config.polymarket.gammaApiUrl || 'https://gamma-api.polymarket.com';
    const apiUrl = `${gammaApiUrl}/markets/slug/${slug}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If market not found or API error, assume closed for safety
      console.warn(`⚠️ Could not fetch market status for slug ${slug}: ${response.status}`);
      return {
        isOpen: false,
        isClosed: true,
        acceptingOrders: false,
      };
    }

    const market = await response.json() as any;

    // Check market status from Gamma API response
    // Market is open for trading if:
    // - active: true (market is active)
    // - closed: false (market is not closed)
    // - acceptingOrders: true (market is accepting new orders)
    const active = market.active === true;
    const closed = market.closed === true;
    const acceptingOrders = market.acceptingOrders === true;
    
    const isOpen = active && !closed && acceptingOrders;
    const isClosed = closed || !active;

    // Parse dates if available
    let endDate: Date | undefined;
    let resolutionDate: Date | undefined;

    if (market.endDate) {
      endDate = new Date(market.endDate);
    }
    if (market.umaEndDate) {
      resolutionDate = new Date(market.umaEndDate);
    }

    return {
      isOpen,
      isClosed,
      acceptingOrders,
      endDate,
      resolutionDate,
    };
  } catch (error) {
    console.error(`❌ Error checking market status for slug ${slug}:`, error);
    // On error, assume closed for safety (don't trade on unknown markets)
    return {
      isOpen: false,
      isClosed: true,
      acceptingOrders: false,
    };
  }
}

/**
 * Check if a market is open (quick check)
 * @param slug Market slug (e.g., "nhl-nsh-pit-2025-11-16")
 */
export async function isMarketOpen(slug: string): Promise<boolean> {
  const status = await checkMarketStatus(slug);
  return status.isOpen;
}

