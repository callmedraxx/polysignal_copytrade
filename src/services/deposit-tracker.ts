import { ethers } from "ethers";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { getUserByAddress } from "./auth";
import { createDepositAddresses } from "./bridge-deposit";
import { getTokenTransfers } from "./explorer-api-client";
import { getUserLogger } from "../utils/user-logger";

// USDC contract addresses
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC on Polygon
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon
// const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC on Ethereum (unused)

// ERC20 ABI (unused - kept for future use)
// const ERC20_ABI = [
//   "function balanceOf(address owner) view returns (uint256)",
//   "function decimals() view returns (uint8)",
//   "event Transfer(address indexed from, address indexed to, uint256 value)",
// ];

export interface DepositTrackingInfo {
  depositId: string;
  userId: string;
  userAddress: string;
  proxyWallet: string;
  sourceChain: string;
  sourceChainId: string;
  depositAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  amountRaw: string;
  sourceTxHash?: string;
  destinationTxHash?: string;
  status: "pending" | "processing" | "bridging" | "completed" | "failed";
  bridgeStartedAt?: Date;
  bridgeCompletedAt?: Date;
  estimatedCompletionTime?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new deposit record for tracking
 */
export async function createDepositRecord(
  userAddress: string,
  sourceChain: string,
  sourceChainId: string,
  tokenAddress: string,
  tokenSymbol: string,
  amount: string,
  amountRaw: string,
  sourceTxHash?: string,
  depositAddress?: string
): Promise<string> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
    if (!user.proxyWallet) {
      throw new Error(`User ${userAddress} does not have a proxy wallet`);
    }
    
    // Get deposit address if not provided
    if (!depositAddress) {
      const depositData = await createDepositAddresses(userAddress);
      
      if (sourceChainId === "1" || sourceChain.toLowerCase() === "ethereum") {
        depositAddress = typeof depositData.address === "string" 
          ? depositData.address 
          : depositData.address?.evm || undefined;
      } else if (sourceChainId === "1151111081099710" || sourceChain.toLowerCase() === "solana") {
        depositAddress = typeof depositData.address === "object" 
          ? depositData.address?.svm || undefined
          : undefined;
      }
      
      if (!depositAddress) {
        throw new Error(`Could not determine deposit address for chain ${sourceChain}`);
      }
    }
    
    // Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId: user.id,
        sourceCurrency: tokenSymbol,
        sourceAmount: amount,
        targetAmount: null, // Will be set when bridge completes
        status: "pending",
        transactionHash: sourceTxHash || null,
        proxyWallet: user.proxyWallet,
        metadata: JSON.stringify({
          sourceChain,
          sourceChainId,
          depositAddress,
          tokenAddress,
          tokenSymbol,
          amountRaw,
          sourceTxHash,
          createdAt: new Date().toISOString(),
        }),
      },
    });
    
    logger.info("Created deposit record for tracking", {
      depositId: deposit.id,
      userAddress,
      proxyWallet: user.proxyWallet,
      sourceChain,
      sourceChainId,
      depositAddress,
      tokenSymbol,
      amount,
      sourceTxHash,
    });
    
    return deposit.id;
  } catch (error) {
    logger.error("Error creating deposit record", {
      userAddress,
      sourceChain,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Check deposit status on source chain (Ethereum, Solana, etc.)
 * Uses rate-limited API client to respect API limits
 */
export async function checkSourceChainDeposit(
  _depositId: string,
  depositAddress: string,
  sourceChainId: string,
  tokenAddress: string
): Promise<{
  found: boolean;
  txHash?: string;
  amount?: string;
  blockNumber?: number;
  timestamp?: Date;
  error?: string;
}> {
  try {
    // Check Ethereum mainnet or Polygon deposits (EVM chains)
    if (sourceChainId === "1" || sourceChainId === "137") {
      // Use rate-limited API client
      const transfers = await getTokenTransfers(
        depositAddress,
        sourceChainId,
        tokenAddress,
        0,
        99999999
      );
      
      if (transfers.length > 0) {
        // Get most recent transfer to this address (incoming deposit)
        const transfer = transfers.find((tx: any) => 
          tx.to && tx.to.toLowerCase() === depositAddress.toLowerCase()
        );
        
        if (transfer) {
          const decimals = parseInt(transfer.tokenDecimal || "6");
          const amount = ethers.utils.formatUnits(transfer.value, decimals);
          
          return {
            found: true,
            txHash: transfer.hash,
            amount,
            blockNumber: parseInt(transfer.blockNumber),
            timestamp: new Date(parseInt(transfer.timeStamp) * 1000),
          };
        }
      }
      
      return {
        found: false,
        error: "No matching deposit found on source chain",
      };
    }
    
    // Check Solana deposits (would need Solana RPC)
    if (sourceChainId === "1151111081099710") {
      // TODO: Implement Solana deposit checking
      // This would require Solana web3.js library
      return {
        found: false,
        error: "Solana deposit checking not yet implemented",
      };
    }
    
    return {
      found: false,
      error: `Unsupported source chain: ${sourceChainId}`,
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if deposit has arrived in proxy wallet on Polygon
 * Uses rate-limited API client to respect API limits
 */
export async function checkDestinationDeposit(
  _depositId: string,
  proxyWallet: string,
  expectedAmount?: string
): Promise<{
  found: boolean;
  txHash?: string;
  amount?: string;
  token?: string;
  blockNumber?: number;
  timestamp?: Date;
  error?: string;
}> {
  try {
    // Check for both Native USDC and USDC.e transfers using rate-limited API
    const usdcAddresses = [
      { address: POLYGON_USDC, name: "Native USDC" },
      { address: POLYGON_USDCe, name: "USDC.e (Bridged)" },
    ];
    
    for (const usdcToken of usdcAddresses) {
      // Use rate-limited API client
      const transfers = await getTokenTransfers(
        proxyWallet,
        "137", // Polygon chain ID
        usdcToken.address,
        0,
        99999999
      );
      
      if (transfers.length > 0) {
        // Find most recent incoming transfer (to proxy wallet)
        const transfer = transfers.find((tx: any) => 
          tx.to && tx.to.toLowerCase() === proxyWallet.toLowerCase()
        );
        
        if (transfer) {
          const decimals = parseInt(transfer.tokenDecimal || "6");
          const amount = ethers.utils.formatUnits(transfer.value, decimals);
          
          // If expected amount provided, check if it matches
          if (expectedAmount) {
            const expectedNum = parseFloat(expectedAmount);
            const receivedNum = parseFloat(amount);
            // Allow small difference for fees/slippage (1%)
            if (Math.abs(expectedNum - receivedNum) > expectedNum * 0.01) {
              continue; // Amount doesn't match, check next token
            }
          }
          
          return {
            found: true,
            txHash: transfer.hash,
            amount,
            token: usdcToken.name,
            blockNumber: parseInt(transfer.blockNumber),
            timestamp: new Date(parseInt(transfer.timeStamp) * 1000),
          };
        }
      }
    }
    
    return {
      found: false,
      error: "No matching deposit found in proxy wallet",
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update deposit status
 */
export async function updateDepositStatus(
  depositId: string,
  status: "pending" | "processing" | "bridging" | "completed" | "failed",
  updates?: {
    destinationTxHash?: string;
    targetAmount?: string;
    errorMessage?: string;
    bridgeStartedAt?: Date;
    bridgeCompletedAt?: Date;
  }
): Promise<void> {
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });
    
    if (!deposit) {
      throw new Error(`Deposit not found: ${depositId}`);
    }

    const userLogger = getUserLogger(deposit.user.address);
    
    // Parse existing metadata
    const metadata = deposit.metadata ? JSON.parse(deposit.metadata) : {};
    
    // Update metadata with new info
    if (updates) {
      if (updates.bridgeStartedAt) {
        metadata.bridgeStartedAt = updates.bridgeStartedAt.toISOString();
      }
      if (updates.bridgeCompletedAt) {
        metadata.bridgeCompletedAt = updates.bridgeCompletedAt.toISOString();
      }
      if (updates.errorMessage) {
        metadata.errorMessage = updates.errorMessage;
      }
    }
    
    // Update deposit
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status,
        targetAmount: updates?.targetAmount || deposit.targetAmount,
        transactionHash: updates?.destinationTxHash || deposit.transactionHash,
        metadata: JSON.stringify(metadata),
      },
    });
    
    // Log deposit status update
    if (status === 'completed' && updates?.destinationTxHash) {
      userLogger.depositCompleted(depositId, updates.destinationTxHash, updates.targetAmount || deposit.targetAmount || deposit.sourceAmount, {
        sourceCurrency: deposit.sourceCurrency,
        sourceAmount: deposit.sourceAmount,
      });
    } else if (status === 'failed' && updates?.errorMessage) {
      userLogger.depositError(depositId, new Error(updates.errorMessage), {
        sourceCurrency: deposit.sourceCurrency,
        sourceAmount: deposit.sourceAmount,
      });
    } else {
      userLogger.info('DEPOSIT', `Deposit status updated to ${status}`, {
        depositId,
        status,
        updates,
      });
    }
    
    logger.info("Updated deposit status", {
      depositId,
      status,
      updates,
    });
  } catch (error) {
    logger.error("Error updating deposit status", {
      depositId,
      status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Track a specific deposit through the bridge process
 */
export async function trackDeposit(depositId: string): Promise<DepositTrackingInfo> {
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });
    
    if (!deposit) {
      throw new Error(`Deposit not found: ${depositId}`);
    }
    
    const metadata = deposit.metadata ? JSON.parse(deposit.metadata) : {};
    const sourceChain = metadata.sourceChain || "Unknown";
    const sourceChainId = metadata.sourceChainId || "Unknown";
    const depositAddress = metadata.depositAddress;
    const tokenAddress = metadata.tokenAddress;
    const tokenSymbol = metadata.tokenSymbol || deposit.sourceCurrency;
    const sourceTxHash = metadata.sourceTxHash || deposit.transactionHash;
    
    // Check if deposit was received on source chain
    let sourceDeposit = null;
    if (depositAddress && sourceChainId && tokenAddress && sourceTxHash) {
      sourceDeposit = await checkSourceChainDeposit(
        depositId,
        depositAddress,
        sourceChainId,
        tokenAddress
      );
    }
    
    // Check if deposit has arrived in proxy wallet
    const destinationDeposit = await checkDestinationDeposit(
      depositId,
      deposit.proxyWallet,
      deposit.sourceAmount
    );
    
    // Determine current status
    let currentStatus: "pending" | "processing" | "bridging" | "completed" | "failed" = deposit.status as any;
    let bridgeStartedAt: Date | undefined = metadata.bridgeStartedAt ? new Date(metadata.bridgeStartedAt) : undefined;
    let bridgeCompletedAt: Date | undefined = metadata.bridgeCompletedAt ? new Date(metadata.bridgeCompletedAt) : undefined;
    
    if (destinationDeposit.found) {
      // Deposit has arrived!
      if (currentStatus !== "completed") {
        currentStatus = "completed";
        bridgeCompletedAt = destinationDeposit.timestamp;
        if (!bridgeStartedAt && sourceDeposit?.found) {
          bridgeStartedAt = sourceDeposit.timestamp;
        }
        
        await updateDepositStatus(depositId, "completed", {
          destinationTxHash: destinationDeposit.txHash,
          targetAmount: destinationDeposit.amount,
          bridgeStartedAt,
          bridgeCompletedAt,
        });
      }
    } else if (sourceDeposit?.found) {
      // Source deposit found but not yet in destination
      if (currentStatus === "pending") {
        currentStatus = "bridging";
        bridgeStartedAt = sourceDeposit.timestamp;
        
        await updateDepositStatus(depositId, "bridging", {
          bridgeStartedAt,
        });
      }
    }
    
    // Calculate estimated completion time (5-15 minutes after bridge started)
    let estimatedCompletionTime: Date | undefined;
    if (bridgeStartedAt && !bridgeCompletedAt) {
      estimatedCompletionTime = new Date(bridgeStartedAt.getTime() + 10 * 60 * 1000); // 10 minutes average
    }
    
    return {
      depositId: deposit.id,
      userId: deposit.userId,
      userAddress: deposit.user.address,
      proxyWallet: deposit.proxyWallet,
      sourceChain,
      sourceChainId,
      depositAddress: depositAddress || "Unknown",
      tokenAddress: tokenAddress || "Unknown",
      tokenSymbol,
      amount: deposit.sourceAmount,
      amountRaw: metadata.amountRaw || "0",
      sourceTxHash: sourceTxHash || undefined,
      destinationTxHash: destinationDeposit.txHash || deposit.transactionHash || undefined,
      status: currentStatus,
      bridgeStartedAt,
      bridgeCompletedAt,
      estimatedCompletionTime,
      errorMessage: metadata.errorMessage || undefined,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    };
  } catch (error) {
    logger.error("Error tracking deposit", {
      depositId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Get all deposits for a user with tracking info
 */
export async function getUserDepositHistory(
  userAddress: string
): Promise<DepositTrackingInfo[]> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      return [];
    }
    
    const deposits = await prisma.deposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    
    // Track each deposit to get current status
    const trackedDeposits = await Promise.all(
      deposits.map(deposit => trackDeposit(deposit.id))
    );
    
    return trackedDeposits;
  } catch (error) {
    logger.error("Error getting user deposit history", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Get deposit tracking info by ID
 */
export async function getDepositTrackingInfo(
  depositId: string
): Promise<DepositTrackingInfo | null> {
  try {
    return await trackDeposit(depositId);
  } catch (error) {
    logger.error("Error getting deposit tracking info", {
      depositId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

