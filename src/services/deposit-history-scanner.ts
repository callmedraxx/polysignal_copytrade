import { ethers } from "ethers";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { getUserByAddress } from "./auth";
import { getTokenTransfers, getRateLimitStats } from "./explorer-api-client";

// USDC.e contract address (only token we track for deposits)
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon

// ERC20 ABI (kept for potential future use)
const _ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
void _ERC20_ABI; // Mark as intentionally unused

// Use rate-limited API client instead of direct API calls

export interface HistoricalDeposit {
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  token: string;
  tokenAddress: string;
  amount: string;
  amountRaw: string;
  from: string;
  to: string;
  isBridgedUSDCE: boolean; // Always true since we only track USDC.e
}

/**
 * Get the highest block number from existing deposits for a user
 * Used for incremental scanning (only scan new blocks)
 */
async function getLastCheckedBlockNumber(userId: string): Promise<number> {
  try {
    // Find the highest block number from existing deposits
    const deposits = await prisma.deposit.findMany({
      where: { userId },
      select: { metadata: true },
    });
    
    let maxBlock = 0;
    for (const deposit of deposits) {
      if (deposit.metadata) {
        try {
          const metadata = JSON.parse(deposit.metadata);
          if (metadata.blockNumber && typeof metadata.blockNumber === 'number') {
            maxBlock = Math.max(maxBlock, metadata.blockNumber);
          }
        } catch {
          // Ignore invalid JSON
        }
      }
    }
    
    return maxBlock;
  } catch (error) {
    logger.error("Error getting last checked block number", {
      userId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return 0; // Start from beginning if error
  }
}

/**
 * Scan deposits to proxy wallet from blockchain
 * Only checks USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
 * Uses incremental scanning from last checked block if available
 */
export async function scanHistoricalDeposits(
  userAddress: string,
  limit: number = 100,
  startBlock?: number
): Promise<HistoricalDeposit[]> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user || !user.proxyWallet) {
      return [];
    }
    
    const proxyWallet = user.proxyWallet.toLowerCase();
    
    // Get last checked block number if not provided
    let fromBlock = startBlock;
    if (fromBlock === undefined) {
      const lastBlock = await getLastCheckedBlockNumber(user.id);
      // If we have a last checked block, start from the next block to avoid duplicates
      // If no deposits exist, start from block 0
      fromBlock = lastBlock > 0 ? lastBlock + 1 : 0;
    }
    
    const deposits: HistoricalDeposit[] = [];
    
    // Log rate limit stats before scanning
    const statsBefore = getRateLimitStats();
    logger.info("Starting deposit scan (USDC.e only)", {
      userAddress,
      proxyWallet,
      fromBlock,
      rateLimitStats: statsBefore,
    });
    
    try {
      // Use rate-limited API client to scan USDC.e transfers
      // Normalize address to lowercase for consistent API calls
      const transfers = await getTokenTransfers(
        proxyWallet.toLowerCase(),
        "137", // Polygon chain ID
        POLYGON_USDCe.toLowerCase(),
        fromBlock,
        99999999 // Scan to current block
      );
      
      logger.info("Token transfers API response", {
        userAddress,
        proxyWallet,
        transfersCount: transfers.length,
        fromBlock,
      });
      
      // Filter for incoming transfers only (to proxy wallet)
      // Also verify the contract address matches USDC.e
      const incomingTransfers = transfers.filter((tx: any) => {
        const txTo = tx.to ? tx.to.toLowerCase() : null;
        const txContract = tx.contractAddress ? tx.contractAddress.toLowerCase() : null;
        const matchesProxyWallet = txTo === proxyWallet.toLowerCase();
        const matchesUSDCE = txContract === POLYGON_USDCe.toLowerCase();
        
        return matchesProxyWallet && matchesUSDCE;
      });
      
      logger.info("Filtered incoming transfers", {
        userAddress,
        proxyWallet,
        totalTransfers: transfers.length,
        incomingTransfers: incomingTransfers.length,
      });
      
      // Convert to HistoricalDeposit format
      for (const tx of incomingTransfers) {
        const decimals = parseInt(tx.tokenDecimal || "6");
        const amount = ethers.utils.formatUnits(tx.value, decimals);
        
        deposits.push({
          transactionHash: tx.hash,
          blockNumber: parseInt(tx.blockNumber),
          timestamp: new Date(parseInt(tx.timeStamp) * 1000),
          token: "USDC.e",
          tokenAddress: tx.contractAddress.toLowerCase(),
          amount,
          amountRaw: tx.value,
          from: tx.from,
          to: tx.to,
          isBridgedUSDCE: true, // Always true since we only track USDC.e
        });
      }
    } catch (error) {
      logger.error("Error scanning USDC.e deposits", {
        userAddress,
        tokenAddress: POLYGON_USDCe,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    
    // Log rate limit stats after scanning
    const statsAfter = getRateLimitStats();
    logger.info("Deposit scan completed", {
      userAddress,
      depositsFound: deposits.length,
      fromBlock,
      rateLimitStats: statsAfter,
      callsUsed: statsAfter.polygonscan.dailyCallCount - statsBefore.polygonscan.dailyCallCount,
    });
    
    // Sort by timestamp (newest first) and limit
    deposits.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return deposits.slice(0, limit);
  } catch (error) {
    logger.error("Error scanning deposits", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

/**
 * Sync deposits to database
 * Always creates database records for any on-chain deposits found
 * This ensures we have complete records for analysis and don't need to scan blockchain every time
 */
export async function syncHistoricalDeposits(
  userAddress: string,
  limit: number = 100,
  startBlock?: number
): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
    // Scan for deposits (incremental from last checked block if not specified)
    const historicalDeposits = await scanHistoricalDeposits(userAddress, limit, startBlock);
    
    let synced = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const deposit of historicalDeposits) {
      try {
        // Check if deposit record already exists (by transaction hash)
        const existing = await prisma.deposit.findFirst({
          where: {
            userId: user.id,
            transactionHash: deposit.transactionHash.toLowerCase(),
          },
        });
        
        if (existing) {
          // Already exists, skip
          skipped++;
          continue;
        }
        
        // Always create deposit record for any on-chain deposit found
        await prisma.deposit.create({
          data: {
            userId: user.id,
            sourceCurrency: "USDC.e", // Only USDC.e is tracked
            sourceAmount: deposit.amount,
            targetAmount: deposit.amount, // Same amount since it's already on Polygon
            status: "completed", // On-chain deposits are already completed
            transactionHash: deposit.transactionHash.toLowerCase(),
            proxyWallet: deposit.to,
            metadata: JSON.stringify({
              isHistorical: true,
              sourceChain: "Polygon",
              sourceChainId: "137",
              tokenAddress: deposit.tokenAddress,
              tokenSymbol: "USDC.e",
              amountRaw: deposit.amountRaw,
              from: deposit.from,
              blockNumber: deposit.blockNumber,
              timestamp: deposit.timestamp.toISOString(),
              syncedAt: new Date().toISOString(),
            }),
          },
        });
        
        synced++;
      } catch (error) {
        logger.error("Error syncing deposit", {
          userAddress,
          txHash: deposit.transactionHash,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        errors++;
      }
    }
    
    logger.info("Deposits sync completed", {
      userAddress,
      synced,
      skipped,
      errors,
      total: historicalDeposits.length,
    });
    
    return { synced, skipped, errors };
  } catch (error) {
    logger.error("Error syncing deposits", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Get comprehensive deposit history
 * Always syncs new deposits from blockchain to database for record keeping
 * Returns deposits from database (which includes all synced on-chain deposits)
 */
export async function getCompleteDepositHistory(
  userAddress: string,
  autoSync: boolean = true
): Promise<{
  deposits: Array<{
    depositId?: string;
    transactionHash: string;
    status: string;
    sourceChain?: string;
    tokenSymbol: string;
    amount: string;
    targetAmount?: string;
    timestamp: Date;
    blockNumber: number;
    isHistorical?: boolean;
    isBridgedUSDCE?: boolean;
  }>;
  stats: {
    total: number;
    completed: number;
    pending: number;
    totalAmount: string;
  };
}> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      return {
        deposits: [],
        stats: {
          total: 0,
          completed: 0,
          pending: 0,
          totalAmount: "0.000000",
        },
      };
    }
    
    // Always sync new deposits from blockchain to database
    // This ensures we have complete records and only need to scan new blocks next time
    if (autoSync) {
      try {
        // Force a full scan from block 0 if no deposits exist in database
        // This ensures we catch all historical deposits on first sync
        const existingDeposits = await prisma.deposit.findMany({
          where: { userId: user.id },
          take: 1,
        });
        
        const startBlock = existingDeposits.length === 0 ? 0 : undefined;
        logger.info("Auto-syncing deposits", {
          userAddress,
          startBlock: startBlock !== undefined ? startBlock : "incremental",
          existingDepositsCount: existingDeposits.length,
        });
        
        await syncHistoricalDeposits(userAddress, 100, startBlock);
      } catch (error) {
        logger.error("Error auto-syncing deposits", {
          userAddress,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue even if sync fails - we'll still return database deposits
      }
    }
    
    // Get all deposits from database (includes all synced on-chain deposits)
    const dbDeposits = await prisma.deposit.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    
    // Format deposits for response
    const allDeposits: any[] = [];
    
    for (const deposit of dbDeposits) {
      const metadata = deposit.metadata ? JSON.parse(deposit.metadata) : {};
      
      allDeposits.push({
        depositId: deposit.id,
        transactionHash: deposit.transactionHash || "unknown",
        status: deposit.status,
        sourceChain: metadata.sourceChain || "Polygon",
        tokenSymbol: deposit.sourceCurrency,
        amount: deposit.sourceAmount,
        targetAmount: deposit.targetAmount || deposit.sourceAmount,
        timestamp: deposit.createdAt,
        blockNumber: metadata.blockNumber || 0,
        isHistorical: metadata.isHistorical || false,
        isBridgedUSDCE: deposit.sourceCurrency.includes("USDC.e") || metadata.tokenSymbol === "USDC.e",
      });
    }
    
    // Sort by timestamp (newest first)
    allDeposits.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Calculate stats
    const completed = allDeposits.filter(d => d.status === "completed").length;
    const pending = allDeposits.filter(d => 
      ["pending", "processing", "bridging"].includes(d.status)
    ).length;
    
    const totalAmount = allDeposits
      .filter(d => d.targetAmount)
      .reduce((sum, d) => sum + parseFloat(d.targetAmount || "0"), 0)
      .toFixed(6);
    
    return {
      deposits: allDeposits,
      stats: {
        total: allDeposits.length,
        completed,
        pending,
        totalAmount,
      },
    };
  } catch (error) {
    logger.error("Error getting complete deposit history", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

