import { prisma } from '../config/database';
import { isProduction } from '../config/env';
import { logger } from '../utils/logger';

const BRIDGE_API_URL = 'https://bridge.polymarket.com';

export interface SupportedAsset {
  chainId: string;
  chainName: string;
  token: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
  };
  minCheckoutUsd: number;
}

export interface SupportedAssetsResponse {
  supportedAssets: SupportedAsset[];
  note?: string;
}

// In-memory storage for development
let inMemorySupportedAssets: SupportedAsset[] = [];

/**
 * Fetch supported assets from Polymarket Bridge API
 */
export async function fetchSupportedAssets(): Promise<SupportedAsset[]> {
  try {
    const response = await fetch(`${BRIDGE_API_URL}/supported-assets`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch supported assets: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json() as SupportedAssetsResponse;
    return data.supportedAssets || [];
  } catch (error) {
    logger.error('Error fetching supported assets from Polymarket Bridge API', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Sync supported assets to database (production) or in-memory storage (development)
 */
export async function syncSupportedAssets(): Promise<{ synced: number; errors: number }> {
  try {
    logger.info('🔄 Syncing supported assets from Polymarket Bridge API...');
    
    const assets = await fetchSupportedAssets();
    logger.info(`📦 Fetched ${assets.length} supported assets from Polymarket`);
    
    let synced = 0;
    let errors = 0;
    
    if (isProduction) {
      // Production: Store in database
      for (const asset of assets) {
        try {
          await prisma.supportedAsset.upsert({
            where: {
              chainId_tokenAddress: {
                chainId: asset.chainId,
                tokenAddress: asset.token.address.toLowerCase(),
              },
            },
            update: {
              chainName: asset.chainName,
              tokenName: asset.token.name,
              tokenSymbol: asset.token.symbol,
              tokenDecimals: asset.token.decimals,
              minCheckoutUsd: asset.minCheckoutUsd,
              lastSyncedAt: new Date(),
            },
            create: {
              chainId: asset.chainId,
              chainName: asset.chainName,
              tokenName: asset.token.name,
              tokenSymbol: asset.token.symbol,
              tokenAddress: asset.token.address.toLowerCase(),
              tokenDecimals: asset.token.decimals,
              minCheckoutUsd: asset.minCheckoutUsd,
            },
          });
          synced++;
        } catch (error) {
          logger.error('Error syncing asset to database', {
            chainId: asset.chainId,
            tokenAddress: asset.token.address,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          errors++;
        }
      }
      
      logger.info(`✅ Synced ${synced} supported assets to database (${errors} errors)`);
    } else {
      // Development: Store in memory
      inMemorySupportedAssets = assets;
      synced = assets.length;
      logger.info(`✅ Synced ${synced} supported assets to in-memory storage`);
    }
    
    return { synced, errors };
  } catch (error) {
    logger.error('Error syncing supported assets', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get all supported assets from database (production) or in-memory storage (development)
 */
export async function getSupportedAssets(): Promise<SupportedAsset[]> {
  if (isProduction) {
    const assets = await prisma.supportedAsset.findMany({
      orderBy: [
        { chainId: 'asc' },
        { tokenSymbol: 'asc' },
      ],
    });
    
    // Convert database format to API format
    return assets.map(asset => ({
      chainId: asset.chainId,
      chainName: asset.chainName,
      token: {
        name: asset.tokenName,
        symbol: asset.tokenSymbol,
        address: asset.tokenAddress,
        decimals: asset.tokenDecimals,
      },
      minCheckoutUsd: asset.minCheckoutUsd,
    }));
  } else {
    // Development: Return from memory
    return inMemorySupportedAssets;
  }
}

/**
 * Get supported assets grouped by chain
 */
export async function getSupportedAssetsByChain(): Promise<Record<string, SupportedAsset[]>> {
  const assets = await getSupportedAssets();
  
  const grouped: Record<string, SupportedAsset[]> = {};
  
  for (const asset of assets) {
    if (!grouped[asset.chainId]) {
      grouped[asset.chainId] = [];
    }
    grouped[asset.chainId].push(asset);
  }
  
  return grouped;
}

/**
 * Get minimum deposit amount for a specific chain and token
 */
export async function getMinDepositAmount(chainId: string, tokenAddress: string): Promise<number | null> {
  const normalizedTokenAddress = tokenAddress.toLowerCase();
  
  if (isProduction) {
    const asset = await prisma.supportedAsset.findUnique({
      where: {
        chainId_tokenAddress: {
          chainId,
          tokenAddress: normalizedTokenAddress,
        },
      },
    });
    
    return asset?.minCheckoutUsd || null;
  } else {
    const asset = inMemorySupportedAssets.find(
      a => a.chainId === chainId && a.token.address.toLowerCase() === normalizedTokenAddress
    );
    
    return asset?.minCheckoutUsd || null;
  }
}

