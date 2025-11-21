import { ethers } from "ethers";
import { config } from "../config/env";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { getUserByAddress } from "./auth";
import { getTokenTransfers, getRateLimitStats } from "./explorer-api-client";

// USDC contract addresses
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC on Polygon
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

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
  isNativeUSDC: boolean;
  isBridgedUSDCE: boolean;
}

/**
 * Scan historical deposits to proxy wallet from blockchain
 */
export async function scanHistoricalDeposits(
  userAddress: string,
  limit: number = 100
): Promise<HistoricalDeposit[]> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user || !user.proxyWallet) {
      return [];
    }
    
    const proxyWallet = user.proxyWallet.toLowerCase();
    
    const deposits: HistoricalDeposit[] = [];
    
    // Check both Native USDC and USDC.e using rate-limited API client
    const usdcTokens = [
      { address: POLYGON_USDC, name: "Native USDC", isNative: true },
      { address: POLYGON_USDCe, name: "USDC.e (Bridged)", isNative: false },
    ];
    
    // Log rate limit stats before scanning
    const statsBefore = getRateLimitStats();
    logger.info("Starting historical deposit scan", {
      userAddress,
      proxyWallet,
      rateLimitStats: statsBefore,
    });
    
    for (const usdcToken of usdcTokens) {
      try {
        // Use rate-limited API client
        const transfers = await getTokenTransfers(
          proxyWallet,
          "137", // Polygon chain ID
          usdcToken.address,
          0,
          99999999
        );
        
        // Filter for incoming transfers only (to proxy wallet)
        const incomingTransfers = transfers.filter((tx: any) => 
          tx.to && tx.to.toLowerCase() === proxyWallet
        );
        
        // Convert to HistoricalDeposit format
        for (const tx of incomingTransfers) {
          const decimals = parseInt(tx.tokenDecimal || "6");
          const amount = ethers.utils.formatUnits(tx.value, decimals);
          
          deposits.push({
            transactionHash: tx.hash,
            blockNumber: parseInt(tx.blockNumber),
            timestamp: new Date(parseInt(tx.timeStamp) * 1000),
            token: usdcToken.name,
            tokenAddress: tx.contractAddress.toLowerCase(),
            amount,
            amountRaw: tx.value,
            from: tx.from,
            to: tx.to,
            isNativeUSDC: usdcToken.isNative,
            isBridgedUSDCE: !usdcToken.isNative,
          });
        }
      } catch (error) {
        logger.error(`Error scanning deposits for token ${usdcToken.name}`, {
          userAddress,
          tokenAddress: usdcToken.address,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    // Log rate limit stats after scanning
    const statsAfter = getRateLimitStats();
    logger.info("Historical deposit scan completed", {
      userAddress,
      depositsFound: deposits.length,
      rateLimitStats: statsAfter,
      callsUsed: statsAfter.polygonscan.dailyCallCount - statsBefore.polygonscan.dailyCallCount,
    });
    
    // Sort by timestamp (newest first) and limit
    deposits.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return deposits.slice(0, limit);
  } catch (error) {
    logger.error("Error scanning historical deposits", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

/**
 * Sync historical deposits to database
 * Creates deposit records for historical deposits that don't exist yet
 */
export async function syncHistoricalDeposits(
  userAddress: string,
  limit: number = 100
): Promise<{
  synced: number;
  skipped: number;
  errors: number;
}> {
  try {
    const historicalDeposits = await scanHistoricalDeposits(userAddress, limit);
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
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
        
        // Create deposit record for historical deposit
        await prisma.deposit.create({
          data: {
            userId: user.id,
            sourceCurrency: deposit.isBridgedUSDCE ? "USDC.e (Bridged)" : "USDC",
            sourceAmount: deposit.amount,
            targetAmount: deposit.amount, // Same amount since it's already on Polygon
            status: "completed", // Historical deposits are already completed
            transactionHash: deposit.transactionHash.toLowerCase(),
            proxyWallet: deposit.to,
            metadata: JSON.stringify({
              isHistorical: true,
              sourceChain: "Polygon",
              sourceChainId: "137",
              tokenAddress: deposit.tokenAddress,
              tokenSymbol: deposit.isNativeUSDC ? "USDC" : "USDC.e",
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
        logger.error("Error syncing historical deposit", {
          userAddress,
          txHash: deposit.transactionHash,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        errors++;
      }
    }
    
    logger.info("Historical deposits sync completed", {
      userAddress,
      synced,
      skipped,
      errors,
      total: historicalDeposits.length,
    });
    
    return { synced, skipped, errors };
  } catch (error) {
    logger.error("Error syncing historical deposits", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Get comprehensive deposit history including historical deposits
 */
export async function getCompleteDepositHistory(
  userAddress: string
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
    isNativeUSDC?: boolean;
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
    // Get deposits from database
    const user = await getUserByAddress(userAddress);
    const dbDeposits = user
      ? await prisma.deposit.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        })
      : [];
    
    // Get historical deposits from blockchain
    const historicalDeposits = await scanHistoricalDeposits(userAddress, 100);
    
    // Combine and deduplicate
    const txHashes = new Set<string>();
    const allDeposits: any[] = [];
    
    // Add database deposits first
    for (const deposit of dbDeposits) {
      const txHash = deposit.transactionHash?.toLowerCase();
      if (txHash) {
        txHashes.add(txHash);
      }
      
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
        isNativeUSDC: metadata.tokenSymbol === "USDC" && metadata.tokenAddress?.toLowerCase() === POLYGON_USDC.toLowerCase(),
        isBridgedUSDCE: deposit.sourceCurrency.includes("USDC.e") || metadata.tokenSymbol === "USDC.e",
      });
    }
    
    // Add historical deposits that aren't in database
    for (const deposit of historicalDeposits) {
      if (!txHashes.has(deposit.transactionHash.toLowerCase())) {
        allDeposits.push({
          transactionHash: deposit.transactionHash,
          status: "completed",
          sourceChain: "Polygon",
          tokenSymbol: deposit.isNativeUSDC ? "USDC" : "USDC.e",
          amount: deposit.amount,
          targetAmount: deposit.amount,
          timestamp: deposit.timestamp,
          blockNumber: deposit.blockNumber,
          isHistorical: true,
          isNativeUSDC: deposit.isNativeUSDC,
          isBridgedUSDCE: deposit.isBridgedUSDCE,
        });
      }
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

