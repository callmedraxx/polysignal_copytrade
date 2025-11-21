import { ethers } from 'ethers';
import { config } from '../config/env';
import { prisma } from '../config/database';

// Conditional Token Framework (CTF) contract address on Polygon
const CTF_ADDRESS = config.blockchain.ctfAddress || '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';

// ERC1155 ABI (minimal - just balanceOf)
const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
];

/**
 * Get conditional token balance for a user's proxy wallet
 * 
 * @param userAddress User's Ethereum address
 * @param tokenId The conditional token ID (outcome token ID)
 * @returns Token balance in wei (18 decimals for conditional tokens)
 */
export async function getTokenBalance(
  userAddress: string,
  tokenId: string
): Promise<{
  balance: string; // Balance in wei (raw)
  balanceFormatted: string; // Balance in human-readable format
  proxyWallet: string | null;
  error?: string;
}> {
  try {
    // Normalize address
    const normalizedAddress = userAddress.toLowerCase();
    
    // Get user from database to get proxy wallet
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user) {
      return {
        balance: '0',
        balanceFormatted: '0',
        proxyWallet: null,
        error: 'User not found',
      };
    }

    if (!user.proxyWallet) {
      return {
        balance: '0',
        balanceFormatted: '0',
        proxyWallet: null,
        error: 'User does not have a proxy wallet',
      };
    }

    const proxyWallet = user.proxyWallet.toLowerCase();

    // Connect to Polygon RPC
    const provider = new ethers.providers.JsonRpcProvider(config.blockchain.polygonRpcUrl);
    
    // Create CTF contract instance
    const ctfContract = new ethers.Contract(CTF_ADDRESS, ERC1155_ABI, provider);
    
    // Check balance using ERC1155 balanceOf(address, id)
    const balance = await ctfContract.balanceOf(proxyWallet, tokenId);
    
    // Format balance (conditional tokens have 18 decimals)
    const balanceFormatted = ethers.utils.formatUnits(balance, 18);

    return {
      balance: balance.toString(),
      balanceFormatted,
      proxyWallet,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error checking token balance for ${userAddress}, token ${tokenId}:`, errorMessage);
    
    return {
      balance: '0',
      balanceFormatted: '0',
      proxyWallet: null,
      error: errorMessage,
    };
  }
}

/**
 * Check if user has sufficient token balance for a sell order
 * 
 * @param userAddress User's Ethereum address
 * @param tokenId The conditional token ID
 * @param requiredAmountWei Required amount in wei (18 decimals)
 * @returns true if balance is sufficient, false otherwise
 */
export async function hasSufficientTokenBalance(
  userAddress: string,
  tokenId: string,
  requiredAmountWei: string
): Promise<{
  hasBalance: boolean;
  currentBalance: string;
  requiredBalance: string;
  shortfall: string;
  proxyWallet: string | null;
  error?: string;
}> {
  const balanceInfo = await getTokenBalance(userAddress, tokenId);
  
  if (balanceInfo.error) {
    return {
      hasBalance: false,
      currentBalance: '0',
      requiredBalance: requiredAmountWei,
      shortfall: requiredAmountWei,
      proxyWallet: balanceInfo.proxyWallet,
      error: balanceInfo.error,
    };
  }

  const currentBalance = ethers.BigNumber.from(balanceInfo.balance);
  const requiredBalance = ethers.BigNumber.from(requiredAmountWei);
  const hasBalance = currentBalance.gte(requiredBalance);
  const shortfall = hasBalance 
    ? '0' 
    : requiredBalance.sub(currentBalance).toString();

  return {
    hasBalance,
    currentBalance: currentBalance.toString(),
    requiredBalance: requiredBalance.toString(),
    shortfall,
    proxyWallet: balanceInfo.proxyWallet,
  };
}

