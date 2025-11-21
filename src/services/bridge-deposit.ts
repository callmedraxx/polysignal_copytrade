import { config } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { getUserByAddress } from './auth';
import { getMinDepositAmount } from './bridge-assets';

const BRIDGE_API_URL = 'https://bridge.polymarket.com';

export interface DepositAddress {
  chainId: string;
  chainName: string;
  tokenAddress: string;
  tokenSymbol: string;
  depositAddress: string;
}

export interface CreateDepositResponse {
  address: string | {
    evm?: string; // EVM chain addresses (Ethereum, Polygon, etc.)
    svm?: string; // Solana address
    btc?: string; // Bitcoin address
  };
  depositAddresses?: DepositAddress[]; // May not always be present
  note?: string; // Optional note from API
}

/**
 * Create deposit addresses for a user's proxy wallet
 * Uses the user's proxy wallet address (Safe wallet) to generate deposit addresses
 * 
 * @param userAddress The user's Ethereum address (to look up their proxy wallet)
 * @returns Deposit addresses for all supported chains/tokens
 */
export async function createDepositAddresses(userAddress: string): Promise<CreateDepositResponse> {
  try {
    // Get user to retrieve their proxy wallet address
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
    if (!user.proxyWallet) {
      throw new Error(`User ${userAddress} does not have a proxy wallet. Please complete signup first.`);
    }
    
    const proxyWalletAddress = user.proxyWallet;
    
    logger.info('Creating deposit addresses for user', {
      userAddress,
      proxyWalletAddress,
    });
    
    // Call Polymarket Bridge API to create deposit addresses
    // According to Polymarket docs: https://docs.polymarket.com/developers/misc-endpoints/bridge-deposit
    // Expected response: 201 with { address, depositAddresses[] }
    const response = await fetch(`${BRIDGE_API_URL}/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: proxyWalletAddress, // Use proxy wallet address, not user's original address
      }),
    });
    
    // Read response text first to handle both JSON and text errors
    const responseText = await response.text();
    
    if (!response.ok) {
      logger.error('Polymarket Bridge API error', {
        status: response.status,
        statusText: response.statusText,
        responseText,
        proxyWalletAddress,
        requestBody: { address: proxyWalletAddress },
      });
      throw new Error(`Failed to create deposit addresses: ${response.status} ${response.statusText}. ${responseText}`);
    }
    
    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('Failed to parse Polymarket Bridge API response', {
        responseText,
        proxyWalletAddress,
        parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
      });
      throw new Error(`Invalid JSON response from Polymarket Bridge API: ${responseText}`);
    }
    
    // Validate response structure
    if (!data) {
      throw new Error('Empty response from Polymarket Bridge API');
    }
    
    // Handle different response structures from Polymarket Bridge API
    // The API may return either:
    // 1. { address: string, depositAddresses: DepositAddress[] } - documented format
    // 2. { address: { evm, svm, btc }, note: string } - actual format we're receiving
    
    let depositAddresses: DepositAddress[] = [];
    let normalizedAddress: string = proxyWalletAddress;
    
    if (data.depositAddresses && Array.isArray(data.depositAddresses)) {
      // Standard format with depositAddresses array
      depositAddresses = data.depositAddresses;
      normalizedAddress = typeof data.address === 'string' 
        ? data.address 
        : (data.address?.evm || proxyWalletAddress);
    } else if (data.address && typeof data.address === 'object') {
      // Actual API format: address is an object with evm, svm, btc
      // According to actual API response, it returns a single address per chain type
      // We'll construct depositAddresses from supported assets using the appropriate address
      const evmAddress = data.address.evm;
      const svmAddress = data.address.svm;
      const btcAddress = data.address.btc;
      
      // Use EVM address as the primary address (for proxy wallet)
      normalizedAddress = evmAddress || proxyWalletAddress;
      
      // Get supported assets to construct depositAddresses
      const { getSupportedAssets } = await import('./bridge-assets');
      const supportedAssets = await getSupportedAssets();
      
      // Create deposit addresses for each supported asset
      // Map each asset to the appropriate address based on chain type
      depositAddresses = supportedAssets
        .map(asset => {
          let depositAddress: string | null = null;
          
          // Determine which address to use based on chain type
          const chainIdNum = parseInt(asset.chainId);
          
          if (!isNaN(chainIdNum) && chainIdNum > 0 && chainIdNum < 1000000) {
            // EVM chains (Ethereum, Polygon, Arbitrum, Base, etc.)
            depositAddress = evmAddress || null;
          } else if (asset.chainId === '1151111081099710') {
            // Solana (chainId is a large number)
            depositAddress = svmAddress || null;
          } else if (asset.chainId === '8253038') {
            // Bitcoin
            depositAddress = btcAddress || null;
          }
          
          // Only include if we have a deposit address for this chain type
          if (!depositAddress) {
            return null;
          }
          
          return {
            chainId: asset.chainId,
            chainName: asset.chainName,
            tokenAddress: asset.token.address,
            tokenSymbol: asset.token.symbol,
            depositAddress: depositAddress,
          };
        })
        .filter((addr): addr is DepositAddress => addr !== null);
      
      logger.info('Constructed deposit addresses from API response', {
        evmAddress,
        svmAddress,
        btcAddress,
        depositAddressCount: depositAddresses.length,
        note: 'Using addresses from API response object format',
      });
    } else if (typeof data.address === 'string') {
      // Simple string address format
      normalizedAddress = data.address;
      logger.warn('API returned string address but no depositAddresses array', {
        address: data.address,
        response: data,
      });
    } else {
      // Unknown format
      logger.error('Unexpected response structure from Polymarket Bridge API', {
        response: data,
        proxyWalletAddress,
      });
      throw new Error(
        `Unexpected response structure from Polymarket Bridge API. ` +
        `Expected depositAddresses array or address object, got: ${JSON.stringify(data)}`
      );
    }
    
    // Validate that we have at least one deposit address
    if (depositAddresses.length === 0) {
      logger.warn('No deposit addresses available', {
        response: data,
        proxyWalletAddress,
        note: data.note || 'No note provided',
      });
      // Don't throw error - return empty array so frontend can handle it
    }
    
    logger.info('Deposit addresses processed successfully', {
      userAddress,
      proxyWalletAddress,
      normalizedAddress,
      depositAddressCount: depositAddresses.length,
      responseFormat: data.depositAddresses ? 'standard' : 'address-object',
    });
    
    // Return normalized response
    return {
      address: normalizedAddress,
      depositAddresses,
      note: data.note,
    } as CreateDepositResponse;
  } catch (error) {
    logger.error('Error creating deposit addresses', {
      userAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get deposit address for a specific chain and token
 * 
 * @param userAddress The user's Ethereum address
 * @param chainId The chain ID (e.g., "1" for Ethereum, "137" for Polygon)
 * @param tokenAddress The token contract address
 * @returns The deposit address for the specified chain/token, or null if not found
 */
export async function getDepositAddressForToken(
  userAddress: string,
  chainId: string,
  tokenAddress: string
): Promise<string | null> {
  try {
    const depositData = await createDepositAddresses(userAddress);
    
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    
    const depositAddress = depositData.depositAddresses.find(
      addr => 
        addr.chainId === chainId && 
        addr.tokenAddress.toLowerCase() === normalizedTokenAddress
    );
    
    return depositAddress?.depositAddress || null;
  } catch (error) {
    logger.error('Error getting deposit address for token', {
      userAddress,
      chainId,
      tokenAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Validate deposit amount meets minimum requirements
 * 
 * @param chainId The chain ID
 * @param tokenAddress The token contract address
 * @param amountUsd The deposit amount in USD
 * @returns True if amount meets minimum, false otherwise
 */
export async function validateDepositAmount(
  chainId: string,
  tokenAddress: string,
  amountUsd: number
): Promise<{ valid: boolean; minAmount: number | null; error?: string }> {
  try {
    const minAmount = await getMinDepositAmount(chainId, tokenAddress);
    
    if (minAmount === null) {
      return {
        valid: false,
        minAmount: null,
        error: `Token ${tokenAddress} on chain ${chainId} is not supported`,
      };
    }
    
    if (amountUsd < minAmount) {
      return {
        valid: false,
        minAmount,
        error: `Deposit amount ${amountUsd} USD is below minimum ${minAmount} USD`,
      };
    }
    
    return {
      valid: true,
      minAmount,
    };
  } catch (error) {
    logger.error('Error validating deposit amount', {
      chainId,
      tokenAddress,
      amountUsd,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {
      valid: false,
      minAmount: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

