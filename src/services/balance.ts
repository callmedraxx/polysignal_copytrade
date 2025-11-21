import { ethers } from 'ethers';
import { config } from '../config/env';
import { prisma } from '../config/database';

// USDC contract addresses on Polygon
// Polygon has TWO USDC tokens:
// 1. Native USDC (newer, official) - 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
// 2. Bridged USDC.e (older, bridged from Ethereum) - 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
const USDC_NATIVE_ADDRESS = config.blockchain.usdcAddress || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_BRIDGED_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC.e (bridged)
const USDC_DECIMALS = 6; // Both USDC tokens have 6 decimals

// ERC20 ABI (minimal - just balanceOf)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

/**
 * Get USDC balance for a user's proxy wallet
 * 
 * IMPORTANT: This function fetches balance directly from the Polygon blockchain.
 * No caching is performed - each call queries the blockchain in real-time.
 * This ensures you always get the most up-to-date balance.
 * 
 * @param userAddress User's Ethereum address
 * @returns USDC balance in human-readable format (e.g., "100.50")
 */
export async function getUserBalance(userAddress: string): Promise<{
  balance: string;
  balanceRaw: string; // Raw balance in smallest unit (wei-like)
  proxyWallet: string | null;
  error?: string; // Optional error message if balance couldn't be fetched
}> {
  try {
    // Normalize address (ensure lowercase)
    const normalizedAddress = userAddress.toLowerCase();
    
    // Get user from database (only to get proxy wallet address)
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user) {
      console.error(`User not found for address: ${normalizedAddress}`);
      // Return zero balance if user doesn't exist (they may not have signed up yet)
      return {
        balance: '0',
        balanceRaw: '0',
        proxyWallet: null,
      };
    }

    if (!user.proxyWallet) {
      return {
        balance: '0',
        balanceRaw: '0',
        proxyWallet: null,
      };
    }

    // Fetch balance directly from Polygon blockchain (no caching)
    // Checks BOTH Native USDC and Bridged USDC.e and returns combined balance
    // This ensures real-time, up-to-date balance information
    try {
      const balance = await getUSDCBalance(user.proxyWallet);
      const balanceRaw = await getUSDCBalanceRaw(user.proxyWallet);

      return {
        balance,
        balanceRaw,
        proxyWallet: user.proxyWallet,
      };
    } catch (networkError: any) {
      // Network error - return zero balance with error message
      const errorMessage = networkError?.message || 'Network unavailable';
      console.warn(`⚠️ Could not fetch balance for ${user.proxyWallet}: ${errorMessage}`);
      
      return {
        balance: '0',
        balanceRaw: '0',
        proxyWallet: user.proxyWallet,
        error: 'Unable to fetch balance. Network may be unavailable.',
      };
    }
  } catch (error) {
    console.error('Error getting user balance:', error);
    // Return zero balance instead of throwing
    return {
      balance: '0',
      balanceRaw: '0',
      proxyWallet: null,
      error: 'Failed to get balance. Please try again later.',
    };
  }
}

/**
 * Get USDC balance for a specific address (proxy wallet)
 * 
 * IMPORTANT: Checks BOTH Native USDC and Bridged USDC.e contracts
 * and returns the COMBINED balance. This ensures we catch USDC sent
 * from exchanges like Bybit which may send USDC.e instead of Native USDC.
 * 
 * Fetches balance directly from Polygon blockchain via RPC call.
 * No caching - always returns fresh data from the blockchain.
 * 
 * @param address Proxy wallet address
 * @returns Combined balance in human-readable format (e.g., "100.50")
 * @throws Only throws if RPC URL is not configured, otherwise returns "0" on network errors
 */
export async function getUSDCBalance(address: string): Promise<string> {
  const rpcUrl = config.blockchain.polygonRpcUrl;
  if (!rpcUrl) {
    console.warn('⚠️ Polygon RPC URL not configured');
    return '0';
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Add timeout and better error handling
    const networkPromise = provider.getNetwork().catch(() => null);
    const networkTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network detection timeout')), 5000)
    );
    
    try {
      await Promise.race([networkPromise, networkTimeout]);
    } catch (networkError) {
      console.warn(`⚠️ Could not detect network: ${networkError instanceof Error ? networkError.message : 'Unknown error'}`);
      return '0';
    }

    // Check BOTH Native USDC and Bridged USDC.e contracts
    const nativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
    const bridgedContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);

    // Fetch both balances in parallel
    const [nativeBalancePromise, bridgedBalancePromise] = [
      nativeContract.balanceOf(address),
      bridgedContract.balanceOf(address),
    ];

    const balanceTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
    );

    const [nativeBalance, bridgedBalance] = await Promise.race([
      Promise.all([nativeBalancePromise, bridgedBalancePromise]),
      balanceTimeout,
    ]) as [ethers.BigNumber, ethers.BigNumber];

    // Combine both balances
    const totalBalance = nativeBalance.add(bridgedBalance);
    const formattedBalance = ethers.utils.formatUnits(totalBalance, USDC_DECIMALS);

    // Log breakdown for debugging (only if there's a balance)
    if (!totalBalance.isZero()) {
      const nativeFormatted = ethers.utils.formatUnits(nativeBalance, USDC_DECIMALS);
      const bridgedFormatted = ethers.utils.formatUnits(bridgedBalance, USDC_DECIMALS);
      console.log(`💰 Balance breakdown for ${address}:`);
      console.log(`   Native USDC: ${nativeFormatted}`);
      console.log(`   Bridged USDC.e: ${bridgedFormatted}`);
      console.log(`   Total: ${formattedBalance}`);
    }

    return formattedBalance;
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.code || 'UNKNOWN';
    
    // Check if it's a network-related error
    if (errorCode === 'NETWORK_ERROR' || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('could not detect')) {
      console.warn(`⚠️ Network error getting USDC balance for ${address}: ${errorMessage}`);
      return '0';
    }
    
    console.error(`❌ Error getting USDC balance for ${address}:`, errorMessage);
    return '0'; // Return zero instead of throwing
  }
}

/**
 * Get USDC balance in raw format (smallest unit)
 * 
 * IMPORTANT: Checks BOTH Native USDC and Bridged USDC.e contracts
 * and returns the COMBINED raw balance.
 * 
 * @param address Proxy wallet address
 * @returns Combined balance as string in smallest unit (6 decimals)
 */
export async function getUSDCBalanceRaw(address: string): Promise<string> {
  const rpcUrl = config.blockchain.polygonRpcUrl;
  if (!rpcUrl) {
    console.warn('⚠️ Polygon RPC URL not configured');
    return '0';
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check BOTH Native USDC and Bridged USDC.e contracts
    const nativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
    const bridgedContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);

    // Fetch both balances in parallel
    const [nativeBalancePromise, bridgedBalancePromise] = [
      nativeContract.balanceOf(address),
      bridgedContract.balanceOf(address),
    ];

    const balanceTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
    );

    const [nativeBalance, bridgedBalance] = await Promise.race([
      Promise.all([nativeBalancePromise, bridgedBalancePromise]),
      balanceTimeout,
    ]) as [ethers.BigNumber, ethers.BigNumber];

    // Combine both balances
    const totalBalance = nativeBalance.add(bridgedBalance);
    return totalBalance.toString();
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.code || 'UNKNOWN';
    
    // Check if it's a network-related error
    if (errorCode === 'NETWORK_ERROR' || 
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('could not detect')) {
      console.warn(`⚠️ Network error getting USDC balance raw for ${address}: ${errorMessage}`);
      return '0';
    }
    
    console.error(`❌ Error getting USDC balance raw for ${address}:`, errorMessage);
    return '0'; // Return zero instead of throwing
  }
}

/**
 * Get balances for multiple proxy wallets in batch
 * @param addresses Array of proxy wallet addresses
 * @returns Map of address to balance
 */
export async function getBatchUSDCBalances(
  addresses: string[]
): Promise<Map<string, string>> {
  const rpcUrl = config.blockchain.polygonRpcUrl;
  if (!rpcUrl) {
    console.warn('⚠️ Polygon RPC URL not configured');
    // Return zero balances for all addresses
    const balanceMap = new Map<string, string>();
    addresses.forEach((address) => balanceMap.set(address, '0'));
    return balanceMap;
  }

  try {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check BOTH Native USDC and Bridged USDC.e contracts
    const nativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
    const bridgedContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);

    const balanceMap = new Map<string, string>();

    // Fetch balances in parallel with individual error handling
    const balancePromises = addresses.map(async (address) => {
      try {
        // Fetch both Native and Bridged balances
        const [nativeBalancePromise, bridgedBalancePromise] = [
          nativeContract.balanceOf(address),
          bridgedContract.balanceOf(address),
        ];
        
        const balanceTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Balance fetch timeout')), 10000)
        );
        
        const [nativeBalance, bridgedBalance] = await Promise.race([
          Promise.all([nativeBalancePromise, bridgedBalancePromise]),
          balanceTimeout,
        ]) as [ethers.BigNumber, ethers.BigNumber];
        
        // Combine both balances
        const totalBalance = nativeBalance.add(bridgedBalance);
        const formattedBalance = ethers.utils.formatUnits(totalBalance, USDC_DECIMALS);
        return { address, balance: formattedBalance };
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        console.warn(`⚠️ Could not get balance for ${address}: ${errorMessage}`);
        return { address, balance: '0' };
      }
    });

    const results = await Promise.all(balancePromises);
    results.forEach(({ address, balance }) => {
      balanceMap.set(address, balance);
    });

    return balanceMap;
  } catch (error: any) {
    console.error('Error getting batch USDC balances:', error);
    // Return zero balances for all addresses instead of throwing
    const balanceMap = new Map<string, string>();
    addresses.forEach((address) => balanceMap.set(address, '0'));
    return balanceMap;
  }
}

