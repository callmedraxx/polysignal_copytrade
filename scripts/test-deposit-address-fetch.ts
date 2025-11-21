import { prisma } from "../src/config/database";
import { createDepositAddresses } from "../src/services/bridge-deposit";
import { logger } from "../src/utils/logger";

// Proxy wallet address to test
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef";

/**
 * Find user by proxy wallet address
 */
async function findUserByProxyWallet(proxyWallet: string) {
  try {
    const user = await prisma.user.findFirst({
      where: { 
        proxyWallet: proxyWallet.toLowerCase() 
      },
    });
    return user;
  } catch (error) {
    console.error("Error finding user:", error);
    return null;
  }
}

/**
 * Test fetching deposit address from Polymarket Bridge API
 */
async function testDepositAddressFetch() {
  console.log("🔍 TESTING POLYMARKET BRIDGE DEPOSIT ADDRESS FETCH");
  console.log("=".repeat(80));
  console.log(`\n📍 Proxy Wallet Address: ${PROXY_WALLET_ADDRESS}`);
  
  // Step 1: Find user by proxy wallet
  console.log("\n📋 Step 1: Finding user associated with proxy wallet...");
  const user = await findUserByProxyWallet(PROXY_WALLET_ADDRESS);
  
  if (!user) {
    console.log("❌ No user found with this proxy wallet address!");
    console.log("\n💡 This means:");
    console.log("   - The proxy wallet exists on-chain but isn't linked to a user in the database");
    console.log("   - You may need to create a user record first");
    console.log("   - Or this proxy wallet belongs to a different system");
    return;
  }
  
  console.log("✅ Found user:");
  console.log(`   User Address: ${user.address}`);
  console.log(`   User ID: ${user.id}`);
  console.log(`   Proxy Wallet: ${user.proxyWallet}`);
  
  // Step 2: Fetch deposit addresses from Polymarket Bridge API
  console.log("\n📋 Step 2: Fetching deposit addresses from Polymarket Bridge API...");
  console.log(`   API Endpoint: https://bridge.polymarket.com/deposit`);
  console.log(`   Method: POST`);
  console.log(`   Request Body: { "address": "${user.proxyWallet}" }`);
  console.log(`\n   ⏳ Calling Polymarket Bridge API...\n`);
  
  try {
    const result = await createDepositAddresses(user.address);
    
    // Step 3: Display and explain the response
    console.log("=".repeat(80));
    console.log("✅ RESPONSE RECEIVED FROM POLYMARKET BRIDGE API");
    console.log("=".repeat(80));
    
    console.log("\n📦 Raw Response:");
    console.log(JSON.stringify(result, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("📚 EXPLANATION OF RESPONSE");
    console.log("=".repeat(80));
    
    // Explain the address field
    console.log("\n1️⃣  ADDRESS FIELD:");
    if (typeof result.address === "string") {
      console.log(`   Type: String`);
      console.log(`   Value: ${result.address}`);
      console.log(`   Meaning: This is the EVM deposit address for your proxy wallet`);
      console.log(`   Network: Ethereum Mainnet (Chain ID: 1)`);
      console.log(`   Usage: Send USDC from Ethereum mainnet TO this address`);
      
      if (result.address.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
        console.log(`   ⚠️  WARNING: Address matches proxy wallet - this is unusual`);
        console.log(`   💡 Normally, deposit address should be different from proxy wallet`);
      } else {
        console.log(`   ✅ Different from proxy wallet - this is correct`);
        console.log(`   📍 Proxy Wallet (Polygon): ${PROXY_WALLET_ADDRESS}`);
        console.log(`   📍 Deposit Address (Ethereum): ${result.address}`);
      }
    } else if (typeof result.address === "object") {
      console.log(`   Type: Object`);
      console.log(`   Structure: { evm, svm, btc }`);
      if (result.address.evm) {
        console.log(`   EVM Address: ${result.address.evm}`);
        console.log(`   Meaning: Ethereum-compatible deposit address`);
        console.log(`   Network: Ethereum Mainnet (Chain ID: 1)`);
        console.log(`   Usage: Send USDC from Ethereum mainnet TO this address`);
      }
      if (result.address.svm) {
        console.log(`   SVM Address: ${result.address.svm}`);
        console.log(`   Meaning: Solana deposit address`);
      }
      if (result.address.btc) {
        console.log(`   BTC Address: ${result.address.btc}`);
        console.log(`   Meaning: Bitcoin deposit address`);
      }
    }
    
    // Explain depositAddresses array
    console.log("\n2️⃣  DEPOSIT ADDRESSES ARRAY:");
    if (result.depositAddresses && result.depositAddresses.length > 0) {
      console.log(`   Count: ${result.depositAddresses.length} deposit addresses`);
      console.log(`   Meaning: One deposit address per supported chain/token combination`);
      
      result.depositAddresses.forEach((addr, index) => {
        console.log(`\n   Address #${index + 1}:`);
        console.log(`      Chain: ${addr.chainName} (Chain ID: ${addr.chainId})`);
        console.log(`      Token: ${addr.tokenSymbol} (${addr.tokenAddress})`);
        console.log(`      Deposit Address: ${addr.depositAddress}`);
        
        // Check if this matches known addresses
        if (addr.depositAddress.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
          console.log(`      ⚠️  WARNING: Matches proxy wallet address - unexpected!`);
        }
        
        if (addr.chainId === "1") {
          console.log(`      ✅ Ethereum Mainnet - use this for Ethereum deposits`);
        } else if (addr.chainId === "137") {
          console.log(`      ⚠️  Polygon - unusual for deposit address (usually Ethereum)`);
        } else {
          console.log(`      ℹ️  Other chain - check if you need this`);
        }
      });
    } else {
      console.log(`   Count: 0 (empty array)`);
      console.log(`   Meaning: No deposit addresses returned`);
      console.log(`   ⚠️  This could mean:`);
      console.log(`      - API didn't return depositAddresses array`);
      console.log(`      - No supported assets configured`);
      console.log(`      - API response format is different`);
      
      if (result.note) {
        console.log(`   📝 Note from API: ${result.note}`);
      }
    }
    
    // Explain note field
    if (result.note) {
      console.log("\n3️⃣  NOTE FIELD:");
      console.log(`   Value: ${result.note}`);
      console.log(`   Meaning: Additional information from Polymarket Bridge API`);
    }
    
    // Explain how to use
    console.log("\n" + "=".repeat(80));
    console.log("🎯 HOW TO USE THIS DEPOSIT ADDRESS");
    console.log("=".repeat(80));
    
    const depositAddr = typeof result.address === "string" 
      ? result.address 
      : result.address?.evm || null;
    
    if (depositAddr) {
      console.log(`
✅ CORRECT USAGE:

1. User should be on Ethereum Mainnet (NOT Polygon)
2. User sends USDC from Ethereum mainnet
3. Destination: ${depositAddr}
4. Network: Ethereum Mainnet (Chain ID: 1)
5. Token: USDC (Native on Ethereum)
6. Amount: Any amount above minimum (usually $2+)

After sending:
- Polymarket Bridge detects the deposit
- Automatically bridges: Ethereum → Polygon
- Credits USDC.e to your proxy wallet: ${PROXY_WALLET_ADDRESS}
- Takes 5-15 minutes for bridge to complete

❌ WRONG USAGE:

- Sending from Polygon to this address (wrong network!)
- Sending directly to proxy wallet from Ethereum (bypasses bridge)
- Using this address on Polygon (won't work correctly)
      `);
    } else {
      console.log(`
⚠️  No deposit address found in response!
Check the depositAddresses array for specific chain/token addresses.
      `);
    }
    
    // Check if deposit address matches expected format
    console.log("\n" + "=".repeat(80));
    console.log("🔍 VALIDATION CHECK");
    console.log("=".repeat(80));
    
    const expectedDepositAddr = "0x7Ae9DBCc134865BEf3b66be0C8f5e7929344e56a";
    const receivedDepositAddr = typeof result.address === "string"
      ? result.address
      : result.address?.evm || null;
    
    if (receivedDepositAddr) {
      if (receivedDepositAddr.toLowerCase() === expectedDepositAddr.toLowerCase()) {
        console.log(`✅ Deposit address matches expected: ${expectedDepositAddr}`);
        console.log(`   This is the address you mentioned in your issue`);
      } else {
        console.log(`⚠️  Deposit address is DIFFERENT from expected`);
        console.log(`   Expected: ${expectedDepositAddr}`);
        console.log(`   Received: ${receivedDepositAddr}`);
        console.log(`   💡 Polymarket may generate new addresses per request`);
        console.log(`   💡 Or addresses may be unique per proxy wallet`);
      }
    } else {
      console.log(`❌ Could not extract deposit address from response`);
    }
    
    // Final summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`
Proxy Wallet: ${PROXY_WALLET_ADDRESS} (on Polygon)
Deposit Address: ${receivedDepositAddr || "Not found"} (on Ethereum)

✅ API Call: Successful
✅ Response: Received and parsed
${result.depositAddresses?.length ? `✅ Deposit Addresses: ${result.depositAddresses.length} found` : "⚠️  Deposit Addresses: None in array"}

💡 NEXT STEPS:
1. Use the deposit address from response for Ethereum deposits
2. Send USDC from Ethereum mainnet (NOT Polygon)
3. Wait 5-15 minutes for bridge to complete
4. Check proxy wallet balance on Polygon after bridge
    `);
    
  } catch (error) {
    console.error("\n❌ ERROR FETCHING DEPOSIT ADDRESS:");
    console.error(`   ${error instanceof Error ? error.message : "Unknown error"}`);
    
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    
    console.log("\n💡 TROUBLESHOOTING:");
    console.log("   1. Check if Polymarket Bridge API is accessible");
    console.log("   2. Verify proxy wallet address is correct");
    console.log("   3. Check network connectivity");
    console.log("   4. Verify API hasn't changed");
  }
  
  // Close database connection
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnect errors
  }
}

// Main execution
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function main() {
  await testDepositAddressFetch();
}

