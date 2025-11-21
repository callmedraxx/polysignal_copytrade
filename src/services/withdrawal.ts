import { ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import { OperationType, SafeTransaction } from '@polymarket/builder-relayer-client';
import { createRelayerClientForUser } from './relayer-client';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ERC20 transfer interface for token withdrawals
const ERC20_INTERFACE = new Interface([
  {
    "constant": false,
    "inputs": [
      {"name": "_to", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"}
    ],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
]);

// ERC1155 transfer interface for conditional token withdrawals
const ERC1155_INTERFACE = new Interface([
  {
    "constant": false,
    "inputs": [
      {"name": "_to", "type": "address"},
      {"name": "_id", "type": "uint256"},
      {"name": "_value", "type": "uint256"},
      {"name": "_data", "type": "bytes"}
    ],
    "name": "safeTransferFrom",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
]);

/**
 * Get token balance for a wallet
 */
async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  decimals: number = 18
): Promise<string> {
  const provider = new ethers.providers.JsonRpcProvider(config.blockchain.polygonRpcUrl);
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_INTERFACE, provider);
  
  const balance = await tokenContract.balanceOf(walletAddress);
  return ethers.utils.formatUnits(balance, decimals);
}

/**
 * Get conditional token (ERC1155) balance for a wallet
 */
async function getERC1155Balance(
  contractAddress: string,
  walletAddress: string,
  tokenId: string
): Promise<string> {
  const provider = new ethers.providers.JsonRpcProvider(config.blockchain.polygonRpcUrl);
  
  // ERC1155 balanceOf signature
  const balanceOfInterface = new Interface([
    "function balanceOf(address account, uint256 id) view returns (uint256)"
  ]);
  
  const contract = new ethers.Contract(contractAddress, balanceOfInterface, provider);
  const balance = await contract.balanceOf(walletAddress, tokenId);
  return ethers.utils.formatUnits(balance, 18); // Conditional tokens use 18 decimals
}

/**
 * Withdraw USDC from proxy wallet to user's connected wallet
 */
export async function withdrawUSDC(
  userAddress: string,
  amount?: string // If not provided, withdraws all balance
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get user and verify proxy wallet exists
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
    });

    if (!user || !user.proxyWallet) {
      throw new Error(`User ${userAddress} not found or does not have a proxy wallet`);
    }

    const proxyWallet = user.proxyWallet;
    const usdcAddress = config.blockchain.usdcAddress;

    // Get balance
    const balance = await getTokenBalance(usdcAddress, proxyWallet, 6); // USDC has 6 decimals
    const balanceWei = ethers.utils.parseUnits(balance, 6);

    if (balanceWei.eq(0)) {
      throw new Error('Insufficient USDC balance in proxy wallet');
    }

    // Determine withdrawal amount
    let withdrawAmountWei: ethers.BigNumber;
    if (amount) {
      withdrawAmountWei = ethers.utils.parseUnits(amount, 6);
      if (withdrawAmountWei.gt(balanceWei)) {
        throw new Error(`Insufficient balance. Available: ${balance} USDC, Requested: ${amount} USDC`);
      }
    } else {
      // Withdraw all
      withdrawAmountWei = balanceWei;
    }

    // Create transfer transaction
    const transferTx: SafeTransaction = {
      to: usdcAddress,
      operation: OperationType.Call,
      data: ERC20_INTERFACE.encodeFunctionData('transfer', [
        userAddress,
        withdrawAmountWei.toString(),
      ]),
      value: '0',
    };

    logger.info('Withdrawing USDC', {
      userAddress,
      proxyWallet,
      amount: ethers.utils.formatUnits(withdrawAmountWei, 6),
    });

    // Execute withdrawal via relayer
    const relayerClient = createRelayerClientForUser(userAddress);
    const response = await relayerClient.execute([transferTx], 'Withdraw USDC');
    const result = await response.wait();

    if (result && result.transactionHash) {
      logger.info('USDC withdrawal successful', {
        userAddress,
        txHash: result.transactionHash,
        amount: ethers.utils.formatUnits(withdrawAmountWei, 6),
      });

      return {
        success: true,
        txHash: result.transactionHash,
      };
    } else {
      throw new Error('Withdrawal transaction completed but no transaction hash returned');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error withdrawing USDC', {
      userAddress,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Withdraw conditional token (ERC1155) from proxy wallet to user's connected wallet
 */
export async function withdrawConditionalToken(
  userAddress: string,
  tokenId: string,
  amount?: string // If not provided, withdraws all balance
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Get user and verify proxy wallet exists
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
    });

    if (!user || !user.proxyWallet) {
      throw new Error(`User ${userAddress} not found or does not have a proxy wallet`);
    }

    const proxyWallet = user.proxyWallet;
    const ctfAddress = config.blockchain.ctfAddress;

    // Get balance
    const balance = await getERC1155Balance(ctfAddress, proxyWallet, tokenId);
    const balanceWei = ethers.utils.parseUnits(balance, 18);

    if (balanceWei.eq(0)) {
      throw new Error(`Insufficient conditional token balance (tokenId: ${tokenId})`);
    }

    // Determine withdrawal amount
    let withdrawAmountWei: ethers.BigNumber;
    if (amount) {
      withdrawAmountWei = ethers.utils.parseUnits(amount, 18);
      if (withdrawAmountWei.gt(balanceWei)) {
        throw new Error(
          `Insufficient balance. Available: ${balance} tokens, Requested: ${amount} tokens`
        );
      }
    } else {
      // Withdraw all
      withdrawAmountWei = balanceWei;
    }

    // Create safeTransferFrom transaction
    // Note: When executing from Safe, the 'from' address is automatically the Safe (proxyWallet)
    // so we use proxyWallet as the 'from' parameter
    const transferTx: SafeTransaction = {
      to: ctfAddress,
      operation: OperationType.Call,
      data: ERC1155_INTERFACE.encodeFunctionData('safeTransferFrom', [
        proxyWallet, // from: proxy wallet (Safe)
        userAddress, // to: user's connected wallet
        tokenId, // token ID
        withdrawAmountWei.toString(), // amount
        '0x', // data: empty
      ]),
      value: '0',
    };

    logger.info('Withdrawing conditional token', {
      userAddress,
      proxyWallet,
      tokenId,
      amount: ethers.utils.formatUnits(withdrawAmountWei, 18),
    });

    // Execute withdrawal via relayer
    const relayerClient = createRelayerClientForUser(userAddress);
    const response = await relayerClient.execute([transferTx], 'Withdraw conditional token');
    const result = await response.wait();

    if (result && result.transactionHash) {
      logger.info('Conditional token withdrawal successful', {
        userAddress,
        txHash: result.transactionHash,
        tokenId,
        amount: ethers.utils.formatUnits(withdrawAmountWei, 18),
      });

      return {
        success: true,
        txHash: result.transactionHash,
      };
    } else {
      throw new Error('Withdrawal transaction completed but no transaction hash returned');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error withdrawing conditional token', {
      userAddress,
      tokenId,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get balances for a user's proxy wallet
 */
export async function getProxyWalletBalances(userAddress: string): Promise<{
  usdc: string;
  conditionalTokens: Array<{ tokenId: string; balance: string }>;
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
    });

    if (!user || !user.proxyWallet) {
      throw new Error(`User ${userAddress} not found or does not have a proxy wallet`);
    }

    const proxyWallet = user.proxyWallet;
    const usdcAddress = config.blockchain.usdcAddress;

    // Get USDC balance
    const usdcBalance = await getTokenBalance(usdcAddress, proxyWallet, 6);

    // Get conditional token balances (this would require scanning all tokens or tracking them)
    // For now, return empty array - can be enhanced to track token balances
    const conditionalTokens: Array<{ tokenId: string; balance: string }> = [];

    return {
      usdc: usdcBalance,
      conditionalTokens,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error getting proxy wallet balances', {
      userAddress,
      error: errorMessage,
    });
    throw error;
  }
}

