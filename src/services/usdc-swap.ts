import { ethers } from 'ethers';
import { config } from '../config/env';
import { executeSafeTransaction } from './wallet';
import { prisma } from '../config/database';

// USDC contract addresses
const USDC_NATIVE_ADDRESS = config.blockchain.usdcAddress || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_BRIDGED_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC.e

// Uniswap V3 SwapRouter on Polygon
const UNISWAP_V3_SWAP_ROUTER = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

// ERC20 ABI for approvals
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Uniswap V3 SwapRouter ABI (exactInputSingle)
const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

const USDC_DECIMALS = 6;

export interface SwapResult {
  success: boolean;
  txHash?: string;
  amountIn: string;
  amountOut: string;
  error?: string;
}

/**
 * Swap USDC.e to Native USDC using Uniswap V3
 * Executes swap via Safe wallet transaction
 * 
 * @param userAddress User's Ethereum address
 * @param amount Amount of USDC.e to swap (in USDC, e.g., "2.0"). If not provided, swaps all available USDC.e
 * @returns Swap result with transaction hash
 */
export async function swapUSDCEToNative(
  userAddress: string,
  amount?: string
): Promise<SwapResult> {
  try {
    // Get user and proxy wallet
    const normalizedAddress = userAddress.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user || !user.proxyWallet) {
      return {
        success: false,
        amountIn: '0',
        amountOut: '0',
        error: 'User not found or proxy wallet not created',
      };
    }

    const proxyWallet = user.proxyWallet;
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      return {
        success: false,
        amountIn: '0',
        amountOut: '0',
        error: 'Polygon RPC URL not configured',
      };
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check USDC.e balance
    const bridgedUSDCContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);
    const bridgedBalance = await bridgedUSDCContract.balanceOf(proxyWallet);
    
    if (bridgedBalance.isZero()) {
      return {
        success: false,
        amountIn: '0',
        amountOut: '0',
        error: 'No USDC.e balance to swap',
      };
    }

    // Determine amount to swap
    let amountToSwap: ethers.BigNumber;
    if (amount) {
      amountToSwap = ethers.utils.parseUnits(amount, USDC_DECIMALS);
      if (amountToSwap.gt(bridgedBalance)) {
        return {
          success: false,
          amountIn: '0',
          amountOut: '0',
          error: `Insufficient USDC.e balance. Available: ${ethers.utils.formatUnits(bridgedBalance, USDC_DECIMALS)}, Requested: ${amount}`,
        };
      }
    } else {
      // Swap all available USDC.e
      amountToSwap = bridgedBalance;
    }

    // Get relayer private key (needs to be configured)
    const relayerPrivateKey = config.safe.relayerPrivateKey;
    if (!relayerPrivateKey) {
      return {
        success: false,
        amountIn: ethers.utils.formatUnits(amountToSwap, USDC_DECIMALS),
        amountOut: '0',
        error: 'Relayer private key not configured. Cannot execute swap.',
      };
    }

    // Check if we need to approve first
    const swapRouter = new ethers.Contract(UNISWAP_V3_SWAP_ROUTER, SWAP_ROUTER_ABI, provider);
    const currentAllowance = await bridgedUSDCContract.allowance(proxyWallet, UNISWAP_V3_SWAP_ROUTER);
    
    if (currentAllowance.lt(amountToSwap)) {
      // Need to approve first
      console.log(`Approving USDC.e for swap...`);
      
      const approveData = bridgedUSDCContract.interface.encodeFunctionData('approve', [
        UNISWAP_V3_SWAP_ROUTER,
        ethers.constants.MaxUint256, // Approve max for future swaps
      ]);

      // Execute approval via Safe
      const approveReceipt = await executeSafeTransaction(
        proxyWallet,
        relayerPrivateKey,
        USDC_BRIDGED_ADDRESS,
        ethers.BigNumber.from(0),
        approveData
      );

      if (!approveReceipt) {
        return {
          success: false,
          amountIn: ethers.utils.formatUnits(amountToSwap, USDC_DECIMALS),
          amountOut: '0',
          error: 'Failed to approve USDC.e for swap',
        };
      }

      console.log(`✅ Approved USDC.e. Transaction: ${approveReceipt.transactionHash}`);
    }

    // Calculate minimum amount out (with 0.5% slippage tolerance)
    // Note: In production, you might want to fetch current price from Uniswap
    // const slippageTolerance = 0.005; // 0.5%
    const amountOutMinimum = amountToSwap.mul(995).div(1000); // Rough estimate, should use Uniswap quote

    // Uniswap V3 fee tier for USDC/USDC.e pool (usually 0.01% = 100)
    // You may need to check which fee tier exists for this pair
    const fee = 100; // 0.01% fee tier

    // Build swap parameters
    const swapParams = {
      tokenIn: USDC_BRIDGED_ADDRESS,
      tokenOut: USDC_NATIVE_ADDRESS,
      fee: fee,
      recipient: proxyWallet, // Send native USDC back to proxy wallet
      deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes from now
      amountIn: amountToSwap.toString(),
      amountOutMinimum: amountOutMinimum.toString(),
      sqrtPriceLimitX96: 0, // No price limit
    };

    // Encode swap function call
    const swapData = swapRouter.interface.encodeFunctionData('exactInputSingle', [swapParams]);

    console.log(`🔄 Executing swap: ${ethers.utils.formatUnits(amountToSwap, USDC_DECIMALS)} USDC.e → Native USDC`);

    // Execute swap via Safe
    const swapReceipt = await executeSafeTransaction(
      proxyWallet,
      relayerPrivateKey,
      UNISWAP_V3_SWAP_ROUTER,
      ethers.BigNumber.from(0),
      swapData
    );

    if (!swapReceipt) {
      return {
        success: false,
        amountIn: ethers.utils.formatUnits(amountToSwap, USDC_DECIMALS),
        amountOut: '0',
        error: 'Swap transaction failed',
      };
    }

    // Get actual amount out from events (simplified - in production, parse events)
    // For now, we'll estimate based on 1:1 ratio (should be close for stablecoins)
    const estimatedAmountOut = amountToSwap.mul(995).div(1000); // Account for fees

    console.log(`✅ Swap successful! Transaction: ${swapReceipt.transactionHash}`);

    return {
      success: true,
      txHash: swapReceipt.transactionHash,
      amountIn: ethers.utils.formatUnits(amountToSwap, USDC_DECIMALS),
      amountOut: ethers.utils.formatUnits(estimatedAmountOut, USDC_DECIMALS),
    };
  } catch (error: any) {
    console.error('Error swapping USDC.e to Native USDC:', error);
    return {
      success: false,
      amountIn: '0',
      amountOut: '0',
      error: error.message || 'Unknown error during swap',
    };
  }
}

/**
 * Check if user has USDC.e that needs to be swapped
 * @param userAddress User's Ethereum address
 * @returns USDC.e balance if any exists
 */
export async function checkUSDCEBalance(userAddress: string): Promise<{
  hasUSDCE: boolean;
  balance: string;
  balanceRaw: string;
}> {
  try {
    const normalizedAddress = userAddress.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user || !user.proxyWallet) {
      return {
        hasUSDCE: false,
        balance: '0',
        balanceRaw: '0',
      };
    }

    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      return {
        hasUSDCE: false,
        balance: '0',
        balanceRaw: '0',
      };
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const bridgedUSDCContract = new ethers.Contract(USDC_BRIDGED_ADDRESS, ERC20_ABI, provider);
    const balance = await bridgedUSDCContract.balanceOf(user.proxyWallet);

    return {
      hasUSDCE: !balance.isZero(),
      balance: ethers.utils.formatUnits(balance, USDC_DECIMALS),
      balanceRaw: balance.toString(),
    };
  } catch (error) {
    console.error('Error checking USDC.e balance:', error);
    return {
      hasUSDCE: false,
      balance: '0',
      balanceRaw: '0',
    };
  }
}

