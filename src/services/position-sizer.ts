import { ethers } from 'ethers';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { matchesCategory } from './category-inference';

export interface PositionSizeResult {
  amount: string; // Amount in USDC (as string to preserve precision)
  amountWei: string; // Amount in wei (USDC has 6 decimals)
  isSufficient: boolean; // Whether user has sufficient balance
  balance: string; // User's current balance in USDC
}

/**
 * Calculate position size for a copied trade
 */
export async function calculatePositionSize(
  configId: string,
  originalAmount: string,
  tradeType: 'buy' | 'sell'
): Promise<PositionSizeResult> {
  const copyConfig = await prisma.copyTradingConfig.findUnique({
    where: { id: configId },
    include: {
      user: true,
    },
  });

  if (!copyConfig) {
    throw new Error('Copy trading configuration not found');
  }

  if (!copyConfig.user) {
    throw new Error('User not found for copy trading configuration');
  }

  if (!copyConfig.user.proxyWallet) {
    throw new Error('User does not have a proxy wallet');
  }

  // Get user's USDC balance
  const balance = await getUserUSDCBalance(copyConfig.user.proxyWallet);
  const balanceWei = ethers.utils.parseUnits(balance, 6); // USDC has 6 decimals

  let amount: ethers.BigNumber;
  // Ensure originalAmount is a string (parseUnits requires string)
  const originalAmountStr = String(originalAmount);
  const originalAmountWei = ethers.utils.parseUnits(originalAmountStr, 6);

  if (copyConfig.amountType === 'fixed') {
    // Fixed amount: use the configured amount
    // Ensure it's a string (parseUnits requires string)
    const fixedAmount = String(tradeType === 'buy' ? copyConfig.buyAmount : copyConfig.sellAmount);
    amount = ethers.utils.parseUnits(fixedAmount, 6);
  } else if (copyConfig.amountType === 'percentage') {
    // Percentage: calculate percentage of user's balance
    // Ensure it's a string before parsing
    const percentage = String(tradeType === 'buy' ? copyConfig.buyAmount : copyConfig.sellAmount);
    const percentageDecimal = parseFloat(percentage) / 100;
    amount = balanceWei.mul(Math.floor(percentageDecimal * 10000)).div(10000); // Preserve precision
  } else if (copyConfig.amountType === 'percentageOfOriginal') {
    // Percentage of original: calculate percentage of the original trader's trade amount
    // Ensure it's a string before parsing
    const percentage = String(tradeType === 'buy' ? copyConfig.buyAmount : copyConfig.sellAmount);
    const percentageDecimal = parseFloat(percentage) / 100;
    // Calculate: originalAmount * (percentage / 100)
    amount = originalAmountWei.mul(Math.floor(percentageDecimal * 10000)).div(10000); // Preserve precision
  } else {
    throw new Error(`Invalid amount type: ${copyConfig.amountType}`);
  }

  // Check if user has sufficient balance
  const isSufficient = balanceWei.gte(amount);

  return {
    amount: ethers.utils.formatUnits(amount, 6),
    amountWei: amount.toString(),
    isSufficient,
    balance,
  };
}

/**
 * Get user's USDC balance from their Safe wallet
 * 
 * IMPORTANT: This checks Native USDC only, which is what Polymarket requires.
 * USDC.e (bridged) is NOT accepted by Polymarket directly - it must be swapped to Native USDC first.
 * 
 * For balance display purposes, use getUserBalance() from balance.ts which checks both.
 * For trading purposes (Polymarket), use this function which checks only Native USDC.
 */
async function getUserUSDCBalance(safeAddress: string): Promise<string> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // USDC contract ABI (minimal - just balanceOf)
    const usdcAbi = [
      'function balanceOf(address account) external view returns (uint256)',
    ];

    // Use Native USDC address (required by Polymarket)
    const nativeUSDCAddress = config.blockchain.usdcAddress || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    const usdcContract = new ethers.Contract(
      nativeUSDCAddress,
      usdcAbi,
      provider
    );

    const balance = await usdcContract.balanceOf(safeAddress);
    return ethers.utils.formatUnits(balance, 6); // USDC has 6 decimals
  } catch (error) {
    console.error('Error getting USDC balance:', error);
    return '0';
  }
}

/**
 * Validate trade amount against configuration limits
 */
export function validateTradeAmount(
  originalAmount: string,
  tradeType: 'buy' | 'sell',
  copyConfig: {
    minBuyAmount?: string | null;
    maxBuyAmount?: string | null;
    minSellAmount?: string | null;
    maxSellAmount?: string | null;
  }
): { isValid: boolean; reason?: string } {
  const amount = parseFloat(originalAmount);

  if (tradeType === 'buy') {
    if (copyConfig.minBuyAmount && amount < parseFloat(copyConfig.minBuyAmount)) {
      return {
        isValid: false,
        reason: `Trade amount ${amount} is below minimum buy amount ${copyConfig.minBuyAmount}`,
      };
    }
    if (copyConfig.maxBuyAmount && amount > parseFloat(copyConfig.maxBuyAmount)) {
      return {
        isValid: false,
        reason: `Trade amount ${amount} exceeds maximum buy amount ${copyConfig.maxBuyAmount}`,
      };
    }
  } else {
    if (copyConfig.minSellAmount && amount < parseFloat(copyConfig.minSellAmount)) {
      return {
        isValid: false,
        reason: `Trade amount ${amount} is below minimum sell amount ${copyConfig.minSellAmount}`,
      };
    }
    if (copyConfig.maxSellAmount && amount > parseFloat(copyConfig.maxSellAmount)) {
      return {
        isValid: false,
        reason: `Trade amount ${amount} exceeds maximum sell amount ${copyConfig.maxSellAmount}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validate market category against configuration
 * 
 * Uses flexible category matching:
 * - Exact matches (e.g., "nba-ind-det-2025-11-17" matches "nba-ind-det-2025-11-17")
 * - Inferred matches (e.g., "nba-ind-det-2025-11-17" matches "sports" because it contains "nba")
 * - Partial matches (e.g., "nba-ind-det-2025-11-17" matches "nba")
 */
export function validateMarketCategory(
  marketCategory: string | null,
  copyConfig: {
    marketCategories?: string | null;
  }
): boolean {
  // If no categories specified, allow all
  if (!copyConfig.marketCategories) {
    return true;
  }

  // Parse categories array
  try {
    const categories = JSON.parse(copyConfig.marketCategories);
    if (!Array.isArray(categories) || categories.length === 0) {
      return true; // Empty array = allow all
    }

    // Use flexible category matching
    return matchesCategory(marketCategory, categories);
  } catch {
    return true; // Invalid JSON = allow all
  }
}

