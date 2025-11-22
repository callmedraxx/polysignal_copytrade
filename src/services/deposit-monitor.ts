import { ethers } from "ethers";
import { config } from "../config/env";
// import { prisma } from "../config/database"; // Unused
import { logger } from "../utils/logger";
import { getUserByAddress } from "./auth";

// USDC contract addresses
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC on Polygon
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const POLYGONSCAN_API_URL = process.env.POLYGONSCAN_API_URL || "https://api.polygonscan.com/api";

export interface DepositCheckResult {
  userAddress: string;
  proxyWallet: string;
  hasDeposits: boolean;
  deposits: Array<{
    token: string;
    amount: string;
    amountRaw: string;
    transactionHash: string;
    blockNumber: number;
    timestamp: Date;
    isNativeUSDC: boolean;
    isBridgedUSDCE: boolean;
  }>;
  totalBalance: string;
  nativeUSDCBalance: string;
  bridgedUSDCEBalance: string;
  lastChecked: Date;
}

/**
 * Monitor deposits for a user's proxy wallet
 * Checks for incoming USDC and USDC.e transfers on Polygon
 */
export async function monitorUserDeposits(
  userAddress: string,
  sinceBlock?: number
): Promise<DepositCheckResult> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
    if (!user.proxyWallet) {
      throw new Error(`User ${userAddress} does not have a proxy wallet`);
    }
    
    const proxyWallet = user.proxyWallet;
    
    // Connect to Polygon
    const rpcUrl = config.blockchain.polygonRpcUrl;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Get current block if not specified (stored for future use)
    // const currentBlock = sinceBlock || (await provider.getBlockNumber());
    
    // Check balances
    const nativeUSDCContract = new ethers.Contract(POLYGON_USDC, ERC20_ABI, provider);
    const bridgedUSDCEContract = new ethers.Contract(POLYGON_USDCe, ERC20_ABI, provider);
    
    const nativeUSDCBalance = await nativeUSDCContract.balanceOf(proxyWallet);
    const bridgedUSDCEBalance = await bridgedUSDCEContract.balanceOf(proxyWallet);
    const nativeUSDCDecimals = await nativeUSDCContract.decimals();
    const bridgedUSDCEDecimals = await bridgedUSDCEContract.decimals();
    
    const nativeUSDCFormatted = ethers.utils.formatUnits(nativeUSDCBalance, nativeUSDCDecimals);
    const bridgedUSDCEFormatted = ethers.utils.formatUnits(bridgedUSDCEBalance, bridgedUSDCEDecimals);
    
    // Get transaction history from Polygonscan
    const deposits: DepositCheckResult["deposits"] = [];
    const apiKey = process.env.POLYGONSCAN_API_KEY;
    
    if (apiKey) {
      try {
        // Get token transfers to this address
        const tokenUrl = `${POLYGONSCAN_API_URL}?module=account&action=tokentx&address=${proxyWallet}&startblock=${sinceBlock || 0}&endblock=99999999&sort=desc&apikey=${apiKey}`;
        const tokenResponse = await fetch(tokenUrl);
        const tokenData = await tokenResponse.json() as { status: string; result?: any[]; message?: string };
        
        if (tokenData.status === "1" && Array.isArray(tokenData.result)) {
          // Filter for USDC transfers (both native and bridged)
          const usdcTransfers = tokenData.result.filter((tx: any) => {
            const isNativeUSDC = tx.contractAddress.toLowerCase() === POLYGON_USDC.toLowerCase();
            const isBridgedUSDCE = tx.contractAddress.toLowerCase() === POLYGON_USDCe.toLowerCase();
            const isIncoming = tx.to.toLowerCase() === proxyWallet.toLowerCase();
            
            return (isNativeUSDC || isBridgedUSDCE) && isIncoming;
          });
          
          // Convert to deposit format
          for (const tx of usdcTransfers) {
            const isNativeUSDC = tx.contractAddress.toLowerCase() === POLYGON_USDC.toLowerCase();
            const decimals = parseInt(tx.tokenDecimal);
            const amount = ethers.utils.formatUnits(tx.value, decimals);
            
            deposits.push({
              token: isNativeUSDC ? "Native USDC" : "USDC.e (Bridged)",
              amount,
              amountRaw: tx.value,
              transactionHash: tx.hash,
              blockNumber: parseInt(tx.blockNumber),
              timestamp: new Date(parseInt(tx.timeStamp) * 1000),
              isNativeUSDC,
              isBridgedUSDCE: !isNativeUSDC,
            });
          }
          
          // Sort by block number (newest first)
          deposits.sort((a, b) => b.blockNumber - a.blockNumber);
        }
      } catch (error) {
        logger.error("Error fetching transaction history from Polygonscan", {
          userAddress,
          proxyWallet,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    // Calculate total balance
    const totalNative = parseFloat(nativeUSDCFormatted);
    const totalBridged = parseFloat(bridgedUSDCEFormatted);
    const totalBalance = (totalNative + totalBridged).toFixed(6);
    
    return {
      userAddress,
      proxyWallet,
      hasDeposits: deposits.length > 0,
      deposits,
      totalBalance,
      nativeUSDCBalance: nativeUSDCFormatted,
      bridgedUSDCEBalance: bridgedUSDCEFormatted,
      lastChecked: new Date(),
    };
  } catch (error) {
    logger.error("Error monitoring user deposits", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Check if a specific transaction hash represents a deposit
 */
export async function verifyDepositTransaction(
  transactionHash: string,
  expectedRecipient: string
): Promise<{
  isValid: boolean;
  isDeposit: boolean;
  token?: string;
  amount?: string;
  recipient?: string;
  blockNumber?: number;
  timestamp?: Date;
  error?: string;
}> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(transactionHash);
    
    if (!receipt) {
      return {
        isValid: false,
        isDeposit: false,
        error: "Transaction not found",
      };
    }
    
    // Check if it's a token transfer
    const nativeUSDCContract = new ethers.Contract(POLYGON_USDC, ERC20_ABI, provider);
    const bridgedUSDCEContract = new ethers.Contract(POLYGON_USDCe, ERC20_ABI, provider);
    
    // Parse Transfer events
    const nativeUSDCIface = new ethers.utils.Interface(ERC20_ABI);
    const bridgedUSDCEIface = new ethers.utils.Interface(ERC20_ABI);
    
    for (const log of receipt.logs) {
      try {
        // Check native USDC
        if (log.address.toLowerCase() === POLYGON_USDC.toLowerCase()) {
          const parsed = nativeUSDCIface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            const to = parsed.args.to.toLowerCase();
            if (to === expectedRecipient.toLowerCase()) {
              const decimals = await nativeUSDCContract.decimals();
              const amount = ethers.utils.formatUnits(parsed.args.value, decimals);
              
              return {
                isValid: true,
                isDeposit: true,
                token: "Native USDC",
                amount,
                recipient: to,
                blockNumber: receipt.blockNumber,
                timestamp: new Date((await provider.getBlock(receipt.blockNumber)).timestamp * 1000),
              };
            }
          }
        }
        
        // Check bridged USDC.e
        if (log.address.toLowerCase() === POLYGON_USDCe.toLowerCase()) {
          const parsed = bridgedUSDCEIface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            const to = parsed.args.to.toLowerCase();
            if (to === expectedRecipient.toLowerCase()) {
              const decimals = await bridgedUSDCEContract.decimals();
              const amount = ethers.utils.formatUnits(parsed.args.value, decimals);
              
              return {
                isValid: true,
                isDeposit: true,
                token: "USDC.e (Bridged)",
                amount,
                recipient: to,
                blockNumber: receipt.blockNumber,
                timestamp: new Date((await provider.getBlock(receipt.blockNumber)).timestamp * 1000),
              };
            }
          }
        }
      } catch (parseError) {
        // Not a Transfer event, continue
        continue;
      }
    }
    
    return {
      isValid: true,
      isDeposit: false,
      error: "Transaction found but no deposit detected",
    };
  } catch (error) {
    return {
      isValid: false,
      isDeposit: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get deposit status summary for a user
 */
export async function getDepositStatus(userAddress: string): Promise<{
  hasProxyWallet: boolean;
  proxyWallet?: string;
  currentBalance: string;
  nativeUSDC: string;
  bridgedUSDCE: string;
  recentDeposits: number;
  lastDeposit?: Date;
}> {
  try {
    const result = await monitorUserDeposits(userAddress);
    
    return {
      hasProxyWallet: true,
      proxyWallet: result.proxyWallet,
      currentBalance: result.totalBalance,
      nativeUSDC: result.nativeUSDCBalance,
      bridgedUSDCE: result.bridgedUSDCEBalance,
      recentDeposits: result.deposits.length,
      lastDeposit: result.deposits[0]?.timestamp,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not have a proxy wallet")) {
      return {
        hasProxyWallet: false,
        currentBalance: "0",
        nativeUSDC: "0",
        bridgedUSDCE: "0",
        recentDeposits: 0,
      };
    }
    throw error;
  }
}

