#!/usr/bin/env tsx
/**
 * Debug script to test deposit scanning for a specific proxy wallet
 * Usage: tsx scripts/debug-deposit-scanning.ts [proxyWallet]
 */

import { getTokenTransfers, getRateLimitStats } from "../src/services/explorer-api-client";
import { scanHistoricalDeposits, syncHistoricalDeposits, getCompleteDepositHistory } from "../src/services/deposit-history-scanner";
import { getUserByAddress } from "../src/services/auth";
import { prisma } from "../src/config/database";

const PROXY_WALLET = process.argv[2] || "0xc7341f97032a56510720c302003d4b09ce6cfeef";
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

async function debugDepositScanning() {
  console.log("🔍 DEBUGGING DEPOSIT SCANNING");
  console.log("=".repeat(80));
  console.log(`Proxy Wallet: ${PROXY_WALLET}`);
  console.log(`USDC.e Contract: ${POLYGON_USDCe}`);
  console.log("");

  // Step 1: Find user by proxy wallet
  console.log("Step 1: Finding user by proxy wallet...");
  const user = await prisma.user.findFirst({
    where: { proxyWallet: PROXY_WALLET.toLowerCase() },
  });

  if (!user) {
    console.log("❌ No user found with this proxy wallet!");
    console.log("   Trying to find by user address instead...");
    
    // Try to find by user address if provided
    if (process.argv[3]) {
      const userByAddress = await getUserByAddress(process.argv[3]);
      if (userByAddress) {
        console.log(`✅ Found user: ${userByAddress.address}`);
        console.log(`   Proxy Wallet: ${userByAddress.proxyWallet}`);
        await testWithUser(userByAddress.address);
        return;
      }
    }
    
    console.log("\n💡 To test properly, you need:");
    console.log("   1. A user in the database with this proxy wallet, OR");
    console.log("   2. Provide user address as second argument");
    console.log("\n   Usage: tsx scripts/debug-deposit-scanning.ts <proxyWallet> [userAddress]");
    return;
  }

  console.log(`✅ Found user: ${user.address}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   Proxy Wallet: ${user.proxyWallet}`);
  console.log("");

  await testWithUser(user.address);
}

async function testWithUser(userAddress: string) {
  // Step 2: Test direct API call
  console.log("Step 2: Testing direct API call to Polygonscan...");
  console.log("-".repeat(80));
  
  try {
    const statsBefore = getRateLimitStats();
    console.log("Rate limit stats before:", JSON.stringify(statsBefore, null, 2));
    
    const transfers = await getTokenTransfers(
      PROXY_WALLET.toLowerCase(),
      "137", // Polygon chain ID
      POLYGON_USDCe,
      0, // Start from block 0
      99999999 // Scan to current block
    );
    
    const statsAfter = getRateLimitStats();
    console.log("Rate limit stats after:", JSON.stringify(statsAfter, null, 2));
    
    console.log(`\n✅ API call successful`);
    console.log(`   Total transfers found: ${transfers.length}`);
    
    if (transfers.length > 0) {
      console.log(`\n   First 5 transfers:`);
      transfers.slice(0, 5).forEach((tx: any, index: number) => {
        console.log(`   ${index + 1}. Hash: ${tx.hash}`);
        console.log(`      From: ${tx.from}`);
        console.log(`      To: ${tx.to}`);
        console.log(`      Value: ${tx.value}`);
        console.log(`      Block: ${tx.blockNumber}`);
        console.log(`      Time: ${new Date(parseInt(tx.timeStamp) * 1000).toISOString()}`);
        console.log(`      Contract: ${tx.contractAddress}`);
        console.log("");
      });
      
      // Filter for incoming transfers
      const incomingTransfers = transfers.filter((tx: any) => 
        tx.to && tx.to.toLowerCase() === PROXY_WALLET.toLowerCase()
      );
      
      console.log(`   Incoming transfers (to proxy wallet): ${incomingTransfers.length}`);
      
      if (incomingTransfers.length > 0) {
        console.log(`\n   First 5 incoming transfers:`);
        incomingTransfers.slice(0, 5).forEach((tx: any, index: number) => {
          console.log(`   ${index + 1}. Hash: ${tx.hash}`);
          console.log(`      From: ${tx.from}`);
          console.log(`      To: ${tx.to}`);
          console.log(`      Value: ${tx.value}`);
          console.log(`      Block: ${tx.blockNumber}`);
          console.log(`      Time: ${new Date(parseInt(tx.timeStamp) * 1000).toISOString()}`);
          console.log("");
        });
      }
    } else {
      console.log(`\n⚠️  No transfers found via API`);
      console.log(`   This could mean:`);
      console.log(`   - No USDC.e transfers to this address`);
      console.log(`   - API rate limiting or error`);
      console.log(`   - Address format issue`);
    }
  } catch (error) {
    console.error(`❌ Error calling API:`, error);
    console.error(`   Error details:`, error instanceof Error ? error.message : "Unknown error");
  }

  // Step 3: Test scanHistoricalDeposits
  console.log("\n" + "=".repeat(80));
  console.log("Step 3: Testing scanHistoricalDeposits function...");
  console.log("-".repeat(80));
  
  try {
    const historicalDeposits = await scanHistoricalDeposits(userAddress, 100, 0);
    console.log(`\n✅ scanHistoricalDeposits completed`);
    console.log(`   Deposits found: ${historicalDeposits.length}`);
    
    if (historicalDeposits.length > 0) {
      console.log(`\n   First 5 deposits:`);
      historicalDeposits.slice(0, 5).forEach((deposit, index) => {
        console.log(`   ${index + 1}. Amount: ${deposit.amount} ${deposit.token}`);
        console.log(`      Hash: ${deposit.transactionHash}`);
        console.log(`      Block: ${deposit.blockNumber}`);
        console.log(`      Time: ${deposit.timestamp.toISOString()}`);
        console.log(`      From: ${deposit.from}`);
        console.log(`      To: ${deposit.to}`);
        console.log("");
      });
    } else {
      console.log(`\n⚠️  No deposits found by scanHistoricalDeposits`);
    }
  } catch (error) {
    console.error(`❌ Error in scanHistoricalDeposits:`, error);
    console.error(`   Error details:`, error instanceof Error ? error.message : "Unknown error");
  }

  // Step 4: Test syncHistoricalDeposits
  console.log("\n" + "=".repeat(80));
  console.log("Step 4: Testing syncHistoricalDeposits function...");
  console.log("-".repeat(80));
  
  try {
    const syncResult = await syncHistoricalDeposits(userAddress, 100, 0);
    console.log(`\n✅ syncHistoricalDeposits completed`);
    console.log(`   Synced: ${syncResult.synced}`);
    console.log(`   Skipped: ${syncResult.skipped}`);
    console.log(`   Errors: ${syncResult.errors}`);
  } catch (error) {
    console.error(`❌ Error in syncHistoricalDeposits:`, error);
    console.error(`   Error details:`, error instanceof Error ? error.message : "Unknown error");
  }

  // Step 5: Check database deposits
  console.log("\n" + "=".repeat(80));
  console.log("Step 5: Checking database deposits...");
  console.log("-".repeat(80));
  
  try {
    const user = await getUserByAddress(userAddress);
    if (user) {
      const dbDeposits = await prisma.deposit.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      
      console.log(`\n✅ Database query successful`);
      console.log(`   Total deposits in database: ${dbDeposits.length}`);
      
      if (dbDeposits.length > 0) {
        console.log(`\n   First 5 deposits:`);
        dbDeposits.slice(0, 5).forEach((deposit, index) => {
          console.log(`   ${index + 1}. ID: ${deposit.id}`);
          console.log(`      Status: ${deposit.status}`);
          console.log(`      Amount: ${deposit.sourceAmount} ${deposit.sourceCurrency}`);
          console.log(`      TX Hash: ${deposit.transactionHash || "N/A"}`);
          console.log(`      Created: ${deposit.createdAt.toISOString()}`);
          if (deposit.metadata) {
            try {
              const metadata = JSON.parse(deposit.metadata);
              console.log(`      Block: ${metadata.blockNumber || "N/A"}`);
              console.log(`      Historical: ${metadata.isHistorical || false}`);
            } catch (e) {
              // Ignore parse errors
            }
          }
          console.log("");
        });
      } else {
        console.log(`\n⚠️  No deposits in database`);
      }
    }
  } catch (error) {
    console.error(`❌ Error checking database:`, error);
    console.error(`   Error details:`, error instanceof Error ? error.message : "Unknown error");
  }

  // Step 6: Test getCompleteDepositHistory
  console.log("\n" + "=".repeat(80));
  console.log("Step 6: Testing getCompleteDepositHistory function...");
  console.log("-".repeat(80));
  
  try {
    const history = await getCompleteDepositHistory(userAddress, true);
    console.log(`\n✅ getCompleteDepositHistory completed`);
    console.log(`   Total deposits: ${history.stats.total}`);
    console.log(`   Completed: ${history.stats.completed}`);
    console.log(`   Pending: ${history.stats.pending}`);
    console.log(`   Total amount: ${history.stats.totalAmount}`);
    console.log(`   Deposits array length: ${history.deposits.length}`);
    
    if (history.deposits.length > 0) {
      console.log(`\n   First 5 deposits:`);
      history.deposits.slice(0, 5).forEach((deposit, index) => {
        console.log(`   ${index + 1}. Amount: ${deposit.amount} ${deposit.tokenSymbol}`);
        console.log(`      Status: ${deposit.status}`);
        console.log(`      TX Hash: ${deposit.transactionHash}`);
        console.log(`      Block: ${deposit.blockNumber}`);
        console.log(`      Time: ${deposit.timestamp.toISOString()}`);
        console.log(`      Historical: ${deposit.isHistorical || false}`);
        console.log("");
      });
    }
  } catch (error) {
    console.error(`❌ Error in getCompleteDepositHistory:`, error);
    console.error(`   Error details:`, error instanceof Error ? error.message : "Unknown error");
  }

  console.log("\n" + "=".repeat(80));
  console.log("DEBUG COMPLETE");
  console.log("=".repeat(80));
}

// Run the debug script
debugDepositScanning()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });

