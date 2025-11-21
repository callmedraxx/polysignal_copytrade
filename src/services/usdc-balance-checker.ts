import { ethers } from 'ethers';
import { config } from '../config/env';
import { prisma } from '../config/database';

// USDC contract addresses on Polygon
const USDC_NATIVE_ADDRESS = config.blockchain.usdcAddress || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_BRIDGED_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC.e (bridged)

// ERC20 ABI (minimal - just balanceOf)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const USDC_DECIMALS = 6;

export interface USDCBalanceBreakdown {
  safeAddress: string;
  nativeUSDC: {
    address: string;
    balance: string; // Human-readable format
    balanceRaw: string; // Raw format (wei-like)
    isRequired: boolean; // Required for Polymarket trading
  };
  bridgedUSDCE: {
    address: string;
    balance: string; // Human-readable format
    balanceRaw: string; // Raw format (wei-like)
    needsSwap: boolean; // Needs to be swapped to Native USDC
  };
  totalBalance: string; // Combined balance
  recommendation: {
    tokenToTopUp: 'native' | 'bridged' | 'either';
    reason: string;
    needsSwap: boolean;
  };
}

/**
 * Get detailed USDC balance breakdown for a Safe wallet
 * Shows separate balances for Native USDC and USDC.e
 * Provides recommendation on which token to top up
 * 
 * @param safeAddress Safe wallet address (proxy wallet)
 * @returns Detailed balance breakdown with recommendations
 */
export async function getUSDCBalanceBreakdown(
  safeAddress: string
): Promise<USDCBalanceBreakdown> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(config.blockchain.polygonRpcUrl);
    
    // Check both Native USDC and Bridged USDC.e contracts
    const nativeContract = new ethers.Contract(USDC_NATIVE_ADDRESS, ERC20_ABI, provider);
    const bridgedContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);

    // Fetch both balances in parallel
    const [nativeBalance, bridgedBalance] = await Promise.all([
      nativeContract.balanceOf(safeAddress),
      bridgedContract.balanceOf(safeAddress),
    ]);

    const nativeBalanceFormatted = ethers.utils.formatUnits(nativeBalance, USDC_DECIMALS);
    const bridgedBalanceFormatted = ethers.utils.formatUnits(bridgedBalance, USDC_DECIMALS);
    const totalBalance = nativeBalance.add(bridgedBalance);
    const totalBalanceFormatted = ethers.utils.formatUnits(totalBalance, USDC_DECIMALS);

    // Determine recommendation
    const hasNativeUSDC = !nativeBalance.isZero();
    const hasBridgedUSDC = !bridgedBalance.isZero();
    
    let tokenToTopUp: 'native' | 'bridged' | 'either';
    let reason: string;
    const needsSwap = hasBridgedUSDC;

    if (hasNativeUSDC && !hasBridgedUSDC) {
      // Has Native USDC, no USDC.e - perfect for Polymarket
      tokenToTopUp = 'native';
      reason = 'You have Native USDC which is required for Polymarket trading. Top up Native USDC to continue trading.';
    } else if (!hasNativeUSDC && hasBridgedUSDC) {
      // Has USDC.e but no Native USDC - needs swap or top up Native
      tokenToTopUp = 'native';
      reason = 'You have USDC.e but Polymarket requires Native USDC. Either swap your USDC.e to Native USDC, or top up Native USDC directly.';
    } else if (hasNativeUSDC && hasBridgedUSDC) {
      // Has both - Native is fine, but USDC.e should be swapped
      tokenToTopUp = 'native';
      reason = 'You have both tokens. Native USDC is ready for Polymarket trading. Consider swapping your USDC.e to Native USDC for better liquidity.';
    } else {
      // No balance at all
      tokenToTopUp = 'native';
      reason = 'No USDC balance found. Top up Native USDC (required for Polymarket trading). Do NOT top up USDC.e as it cannot be used directly.';
    }

    return {
      safeAddress,
      nativeUSDC: {
        address: USDC_NATIVE_ADDRESS,
        balance: nativeBalanceFormatted,
        balanceRaw: nativeBalance.toString(),
        isRequired: true, // Always required for Polymarket
      },
      bridgedUSDCE: {
        address: USDC_BRIDGED_ADDRESS,
        balance: bridgedBalanceFormatted,
        balanceRaw: bridgedBalance.toString(),
        needsSwap: hasBridgedUSDC, // Needs swap if balance > 0
      },
      totalBalance: totalBalanceFormatted,
      recommendation: {
        tokenToTopUp,
        reason,
        needsSwap,
      },
    };
  } catch (error: any) {
    console.error('Error getting USDC balance breakdown:', error);
    throw new Error(
      `Failed to get USDC balance breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get USDC balance breakdown for a user by their Ethereum address
 * Looks up their Safe wallet (proxy wallet) and returns balance breakdown
 * 
 * @param userAddress User's Ethereum address
 * @returns Detailed balance breakdown with recommendations
 */
export async function getUserUSDCBalanceBreakdown(
  userAddress: string
): Promise<USDCBalanceBreakdown | null> {
  try {
    const normalizedAddress = userAddress.toLowerCase();
    
    // Get user from database to find their proxy wallet
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user || !user.proxyWallet) {
      return null;
    }

    return await getUSDCBalanceBreakdown(user.proxyWallet);
  } catch (error: any) {
    console.error('Error getting user USDC balance breakdown:', error);
    throw new Error(
      `Failed to get user USDC balance breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Print formatted balance breakdown to console
 * Useful for debugging and manual checks
 */
export function printBalanceBreakdown(breakdown: USDCBalanceBreakdown): void {
  console.log('\n💰 USDC Balance Breakdown');
  console.log('═'.repeat(60));
  console.log(`Safe Address: ${breakdown.safeAddress}`);
  console.log('');
  console.log('📊 Balances:');
  console.log(`  Native USDC:     ${breakdown.nativeUSDC.balance.padEnd(20)} (Required for Polymarket)`);
  console.log(`  USDC.e (Bridged): ${breakdown.bridgedUSDCE.balance.padEnd(20)} ${breakdown.bridgedUSDCE.needsSwap ? '⚠️  Needs Swap' : ''}`);
  console.log(`  Total Balance:    ${breakdown.totalBalance}`);
  console.log('');
  console.log('💡 Recommendation:');
  console.log(`  Token to Top Up: ${breakdown.recommendation.tokenToTopUp.toUpperCase()}`);
  console.log(`  Reason: ${breakdown.recommendation.reason}`);
  if (breakdown.recommendation.needsSwap) {
    console.log(`  ⚠️  Action Required: Swap USDC.e to Native USDC`);
  }
  console.log('');
  console.log('📍 Contract Addresses:');
  console.log(`  Native USDC:     ${breakdown.nativeUSDC.address}`);
  console.log(`  USDC.e (Bridged): ${breakdown.bridgedUSDCE.address}`);
  console.log('═'.repeat(60));
  console.log('');
}

