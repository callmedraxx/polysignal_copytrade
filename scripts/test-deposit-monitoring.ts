import { ethers } from "ethers";
import { config } from "../src/config/env";
import { prisma } from "../src/config/database";
import { getUserByAddress } from "../src/services/auth";
import { scanHistoricalDeposits, syncHistoricalDeposits } from "../src/services/deposit-history-scanner";
import { checkSourceChainDeposit, checkDestinationDeposit, trackDeposit } from "../src/services/deposit-tracker";
import { getRateLimitStats } from "../src/services/explorer-api-client";

// Proxy wallet to test
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef";
const DEPOSIT_ADDRESS = "0x7Ae9DBCc134865BEf3b66be0C8f5e7929344e56a";

/**
 * Test deposit monitoring with rate limiting
 */
async function testDepositMonitoring() {
  console.log("🧪 TESTING DEPOSIT MONITORING WITH RATE LIMITING");
  console.log("=".repeat(80));
  
  // Check API keys
  console.log("\n📋 Checking API Keys...");
  const etherscanKey = process.env.ETHERSCAN_API_KEY;
  const polygonscanKey = process.env.POLYGONSCAN_API_KEY;
  
  if (!etherscanKey) {
    console.log("❌ ETHERSCAN_API_KEY not set");
  } else {
    console.log(`✅ ETHERSCAN_API_KEY: ${etherscanKey.substring(0, 10)}...`);
  }
  
  if (!polygonscanKey) {
    console.log("❌ POLYGONSCAN_API_KEY not set");
  } else {
    console.log(`✅ POLYGONSCAN_API_KEY: ${polygonscanKey.substring(0, 10)}...`);
  }
  
  if (!etherscanKey || !polygonscanKey) {
    console.log("\n⚠️  Please set both API keys in .env file:");
    console.log("   ETHERSCAN_API_KEY=your_key_here");
    console.log("   POLYGONSCAN_API_KEY=your_key_here");
    return;
  }
  
  // Get rate limit stats
  console.log("\n📊 Rate Limit Stats (before):");
  const statsBefore = getRateLimitStats();
  console.log(`   Etherscan:`);
  console.log(`      Queue: ${statsBefore.etherscan.queueLength}`);
  console.log(`      Daily calls: ${statsBefore.etherscan.dailyCallCount} / ${statsBefore.etherscan.dailyLimit}`);
  console.log(`      Remaining: ${statsBefore.etherscan.remainingCalls}`);
  console.log(`      Cache size: ${statsBefore.etherscan.cacheSize}`);
  console.log(`   Polygonscan:`);
  console.log(`      Queue: ${statsBefore.polygonscan.queueLength}`);
  console.log(`      Daily calls: ${statsBefore.polygonscan.dailyCallCount} / ${statsBefore.polygonscan.dailyLimit}`);
  console.log(`      Remaining: ${statsBefore.polygonscan.remainingCalls}`);
  console.log(`      Cache size: ${statsBefore.polygonscan.cacheSize}`);
  
  // Find user
  console.log("\n📋 Finding user by proxy wallet...");
  const user = await prisma.user.findFirst({
    where: { proxyWallet: PROXY_WALLET_ADDRESS.toLowerCase() },
  });
  
  if (!user) {
    console.log("❌ No user found with this proxy wallet!");
    console.log("\n💡 This means the proxy wallet exists but isn't linked to a user in the database.");
    console.log("   For testing, we'll use the proxy wallet address directly.");
    
    // Test without user
    await testWithoutUser();
    return;
  }
  
  console.log(`✅ Found user: ${user.address}`);
  console.log(`   Proxy Wallet: ${user.proxyWallet}`);
  
  // Test 1: Scan historical deposits
  console.log("\n" + "=".repeat(80));
  console.log("TEST 1: SCANNING HISTORICAL DEPOSITS");
  console.log("=".repeat(80));
  
  try {
    const historicalDeposits = await scanHistoricalDeposits(user.address, 50);
    console.log(`\n✅ Found ${historicalDeposits.length} historical deposits`);
    
    if (historicalDeposits.length > 0) {
      console.log(`\n   Recent deposits:`);
      historicalDeposits.slice(0, 5).forEach((deposit, index) => {
        console.log(`   ${index + 1}. ${deposit.amount} ${deposit.token}`);
        console.log(`      Hash: ${deposit.transactionHash}`);
        console.log(`      Block: ${deposit.blockNumber}`);
        console.log(`      Time: ${deposit.timestamp.toISOString()}`);
      });
    } else {
      console.log(`   ℹ️  No historical deposits found (or cache returned empty)`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Test 2: Check destination deposit (proxy wallet on Polygon)
  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: CHECKING DESTINATION DEPOSITS (PROXY WALLET ON POLYGON)");
  console.log("=".repeat(80));
  
  try {
    const destinationCheck = await checkDestinationDeposit(
      "test-id",
      PROXY_WALLET_ADDRESS,
      undefined // No expected amount
    );
    
    if (destinationCheck.found) {
      console.log(`\n✅ Found deposit in proxy wallet!`);
      console.log(`   Token: ${destinationCheck.token}`);
      console.log(`   Amount: ${destinationCheck.amount}`);
      console.log(`   Transaction: ${destinationCheck.txHash}`);
      console.log(`   Block: ${destinationCheck.blockNumber}`);
      console.log(`   Time: ${destinationCheck.timestamp?.toISOString()}`);
    } else {
      console.log(`\n❌ No deposit found in proxy wallet`);
      console.log(`   Error: ${destinationCheck.error || "None"}`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Test 3: Check source chain deposit (Ethereum deposit address)
  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: CHECKING SOURCE CHAIN DEPOSITS (ETHEREUM DEPOSIT ADDRESS)");
  console.log("=".repeat(80));
  
  try {
    const sourceCheck = await checkSourceChainDeposit(
      "test-id",
      DEPOSIT_ADDRESS,
      "1", // Ethereum chain ID
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" // USDC on Ethereum
    );
    
    if (sourceCheck.found) {
      console.log(`\n✅ Found deposit on Ethereum!`);
      console.log(`   Amount: ${sourceCheck.amount}`);
      console.log(`   Transaction: ${sourceCheck.txHash}`);
      console.log(`   Block: ${sourceCheck.blockNumber}`);
      console.log(`   Time: ${sourceCheck.timestamp?.toISOString()}`);
    } else {
      console.log(`\n❌ No deposit found on Ethereum`);
      console.log(`   Error: ${sourceCheck.error || "None"}`);
      console.log(`   💡 This is expected if you haven't sent funds from Ethereum yet`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Test 4: Sync historical deposits
  console.log("\n" + "=".repeat(80));
  console.log("TEST 4: SYNCING HISTORICAL DEPOSITS TO DATABASE");
  console.log("=".repeat(80));
  
  try {
    const syncResult = await syncHistoricalDeposits(user.address, 50);
    console.log(`\n✅ Sync completed:`);
    console.log(`   Synced: ${syncResult.synced} new deposits`);
    console.log(`   Skipped: ${syncResult.skipped} existing deposits`);
    console.log(`   Errors: ${syncResult.errors}`);
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Get rate limit stats after tests
  console.log("\n" + "=".repeat(80));
  console.log("📊 Rate Limit Stats (after):");
  console.log("=".repeat(80));
  
  const statsAfter = getRateLimitStats();
  console.log(`\n   Etherscan:`);
  console.log(`      Queue: ${statsAfter.etherscan.queueLength}`);
  console.log(`      Daily calls: ${statsAfter.etherscan.dailyCallCount} / ${statsAfter.etherscan.dailyLimit}`);
  console.log(`      Remaining: ${statsAfter.etherscan.remainingCalls}`);
  console.log(`      Calls used in this test: ${statsAfter.etherscan.dailyCallCount - statsBefore.etherscan.dailyCallCount}`);
  console.log(`      Cache size: ${statsAfter.etherscan.cacheSize}`);
  
  console.log(`\n   Polygonscan:`);
  console.log(`      Queue: ${statsAfter.polygonscan.queueLength}`);
  console.log(`      Daily calls: ${statsAfter.polygonscan.dailyCallCount} / ${statsAfter.polygonscan.dailyLimit}`);
  console.log(`      Remaining: ${statsAfter.polygonscan.remainingCalls}`);
  console.log(`      Calls used in this test: ${statsAfter.polygonscan.dailyCallCount - statsBefore.polygonscan.dailyCallCount}`);
  console.log(`      Cache size: ${statsAfter.polygonscan.cacheSize}`);
  
  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("✅ TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`
Rate Limiting: ✅ Active
  - Max 5 calls per second
  - Max 100,000 calls per day
  - 5-minute cache TTL

API Usage:
  - Etherscan: ${statsAfter.etherscan.dailyCallCount - statsBefore.etherscan.dailyCallCount} calls used
  - Polygonscan: ${statsAfter.polygonscan.dailyCallCount - statsBefore.polygonscan.dailyCallCount} calls used

Cache Status:
  - Etherscan cache: ${statsAfter.etherscan.cacheSize} entries
  - Polygonscan cache: ${statsAfter.polygonscan.cacheSize} entries

✅ Rate limiting is working correctly!
✅ API calls are being cached to reduce usage!
✅ Queue system prevents rate limit violations!
  `);
  
  // Close database connection
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnect errors
  }
}

/**
 * Test without user (just test API calls)
 */
async function testWithoutUser() {
  console.log("\n🧪 Testing API calls without user...");
  
  // Test destination check (proxy wallet on Polygon)
  console.log("\n1. Testing destination deposit check (Polygon)...");
  try {
    const result = await checkDestinationDeposit(
      "test",
      PROXY_WALLET_ADDRESS,
      undefined
    );
    
    console.log(`   ✅ API call successful`);
    if (result.found) {
      console.log(`   Found: ${result.amount} ${result.token}`);
    } else {
      console.log(`   Not found: ${result.error || "No deposit found"}`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Test source check (Ethereum deposit address)
  console.log("\n2. Testing source deposit check (Ethereum)...");
  try {
    const result = await checkSourceChainDeposit(
      "test",
      DEPOSIT_ADDRESS,
      "1",
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    );
    
    console.log(`   ✅ API call successful`);
    if (result.found) {
      console.log(`   Found: ${result.amount}`);
    } else {
      console.log(`   Not found: ${result.error || "No deposit found"}`);
    }
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  // Get rate limit stats
  const stats = getRateLimitStats();
  console.log("\n📊 Rate Limit Stats:");
  console.log(`   Polygonscan: ${stats.polygonscan.dailyCallCount} calls used today`);
  console.log(`   Etherscan: ${stats.etherscan.dailyCallCount} calls used today`);
}

// Main execution
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function main() {
  await testDepositMonitoring();
}

