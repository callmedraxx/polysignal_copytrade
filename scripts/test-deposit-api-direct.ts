import { config } from "../src/config/env";
import { logger } from "../src/utils/logger";

// Proxy wallet address to test
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef";

// Polymarket Bridge API URL
const BRIDGE_API_URL = "https://bridge.polymarket.com";

/**
 * Test fetching deposit address directly from Polymarket Bridge API
 */
async function testDepositAPIDirect() {
  console.log("🔍 TESTING POLYMARKET BRIDGE DEPOSIT API DIRECTLY");
  console.log("=".repeat(80));
  console.log(`\n📍 Proxy Wallet Address: ${PROXY_WALLET_ADDRESS}`);
  console.log(`\n🌐 API Endpoint: ${BRIDGE_API_URL}/deposit`);
  console.log(`   Method: POST`);
  console.log(`   Request Body: { "address": "${PROXY_WALLET_ADDRESS}" }`);
  
  // Call Polymarket Bridge API
  console.log(`\n   ⏳ Calling Polymarket Bridge API...\n`);
  
  try {
    const response = await fetch(`${BRIDGE_API_URL}/deposit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: PROXY_WALLET_ADDRESS,
      }),
    });
    
    // Read response text first
    const responseText = await response.text();
    
    console.log("=".repeat(80));
    console.log("📡 HTTP RESPONSE");
    console.log("=".repeat(80));
    console.log(`\n   Status: ${response.status} ${response.statusText}`);
    console.log(`   Headers:`);
    response.headers.forEach((value, key) => {
      console.log(`      ${key}: ${value}`);
    });
    console.log(`\n   Raw Response Text:`);
    console.log(`   ${responseText}`);
    
    if (!response.ok) {
      console.error(`\n❌ API ERROR: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${responseText}`);
      console.log(`\n💡 Possible reasons:`);
      console.log(`   1. Invalid proxy wallet address format`);
      console.log(`   2. Proxy wallet not recognized by Polymarket Bridge`);
      console.log(`   3. API endpoint changed`);
      console.log(`   4. Network/authentication issues`);
      return;
    }
    
    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`\n❌ JSON PARSE ERROR:`);
      console.error(`   ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
      console.error(`   Response was not valid JSON: ${responseText}`);
      return;
    }
    
    // Display and explain the response
    console.log("\n" + "=".repeat(80));
    console.log("✅ PARSED RESPONSE");
    console.log("=".repeat(80));
    console.log("\n📦 JSON Response:");
    console.log(JSON.stringify(data, null, 2));
    
    console.log("\n" + "=".repeat(80));
    console.log("📚 DETAILED EXPLANATION OF RESPONSE");
    console.log("=".repeat(80));
    
    // Explain the address field
    console.log("\n1️⃣  ADDRESS FIELD:");
    if (typeof data.address === "string") {
      console.log(`   Type: String`);
      console.log(`   Value: ${data.address}`);
      console.log(`   Format: Ethereum address (42 characters starting with 0x)`);
      console.log(`   Checksum: ${data.address}`);
      console.log(`\n   Meaning:`);
      console.log(`   - This is the EVM deposit address for your proxy wallet`);
      console.log(`   - Network: Ethereum Mainnet (Chain ID: 1)`);
      console.log(`   - This is where users send USDC FROM Ethereum mainnet`);
      console.log(`   - Polymarket Bridge will detect deposits to this address`);
      
      // Compare with proxy wallet
      if (data.address.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
        console.log(`\n   ⚠️  WARNING: Address matches proxy wallet!`);
        console.log(`   - This is unusual - deposit address should be different`);
        console.log(`   - May indicate an issue with the API or proxy wallet`);
      } else {
        console.log(`\n   ✅ Different from proxy wallet (correct)`);
        console.log(`   - Proxy Wallet (Polygon): ${PROXY_WALLET_ADDRESS}`);
        console.log(`   - Deposit Address (Ethereum): ${data.address}`);
        console.log(`   - These are on different networks!`);
      }
      
      // Check if matches expected deposit address
      const expectedDepositAddr = "0x7Ae9DBCc134865BEf3b66be0C8f5e7929344e56a";
      if (data.address.toLowerCase() === expectedDepositAddr.toLowerCase()) {
        console.log(`\n   ✅ Matches expected deposit address!`);
        console.log(`   - This is the address you mentioned: ${expectedDepositAddr}`);
        console.log(`   - This confirms the API returns consistent addresses`);
      } else {
        console.log(`\n   ℹ️  Different from expected deposit address`);
        console.log(`   - Expected: ${expectedDepositAddr}`);
        console.log(`   - Received: ${data.address}`);
        console.log(`   - Polymarket may generate addresses per proxy wallet`);
      }
      
    } else if (typeof data.address === "object" && data.address !== null) {
      console.log(`   Type: Object`);
      console.log(`   Structure: { evm, svm, btc }`);
      console.log(`   Full object: ${JSON.stringify(data.address, null, 2)}`);
      
      if (data.address.evm) {
        console.log(`\n   EVM Address: ${data.address.evm}`);
        console.log(`   - Meaning: Ethereum-compatible deposit address`);
        console.log(`   - Network: Ethereum Mainnet (Chain ID: 1)`);
        console.log(`   - Use this for: Ethereum, Polygon (source), Arbitrum, Base, etc.`);
        console.log(`   - Format: ${data.address.evm.length === 42 ? "Valid Ethereum address" : "Invalid format"}`);
        
        if (data.address.evm.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
          console.log(`   ⚠️  WARNING: EVM address matches proxy wallet!`);
        } else {
          console.log(`   ✅ EVM address is different from proxy wallet (correct)`);
        }
      }
      
      if (data.address.svm) {
        console.log(`\n   SVM Address: ${data.address.svm}`);
        console.log(`   - Meaning: Solana deposit address`);
        console.log(`   - Network: Solana (Base58 format)`);
        console.log(`   - Use this for: Solana blockchain deposits`);
      }
      
      if (data.address.btc) {
        console.log(`\n   BTC Address: ${data.address.btc}`);
        console.log(`   - Meaning: Bitcoin deposit address`);
        console.log(`   - Network: Bitcoin (Base58 format)`);
        console.log(`   - Use this for: Bitcoin deposits`);
      }
      
    } else {
      console.log(`   Type: ${typeof data.address}`);
      console.log(`   Value: ${data.address}`);
      console.log(`   ⚠️  Unexpected format!`);
    }
    
    // Explain depositAddresses array
    console.log("\n2️⃣  DEPOSIT ADDRESSES ARRAY:");
    if (data.depositAddresses && Array.isArray(data.depositAddresses)) {
      console.log(`   Type: Array`);
      console.log(`   Length: ${data.depositAddresses.length}`);
      console.log(`   Meaning: One deposit address per supported chain/token combination`);
      
      if (data.depositAddresses.length > 0) {
        console.log(`\n   📋 Details:`);
        data.depositAddresses.forEach((addr: any, index: number) => {
          console.log(`\n   Address #${index + 1}:`);
          console.log(`      Chain: ${addr.chainName || "Unknown"} (Chain ID: ${addr.chainId || "Unknown"})`);
          console.log(`      Token: ${addr.tokenSymbol || "Unknown"} (${addr.tokenAddress || "Unknown"})`);
          console.log(`      Deposit Address: ${addr.depositAddress || "Unknown"}`);
          
          // Explain based on chain
          if (addr.chainId === "1") {
            console.log(`      ✅ Ethereum Mainnet - Use this for Ethereum deposits`);
            console.log(`      💡 Send USDC from Ethereum to this address`);
          } else if (addr.chainId === "137") {
            console.log(`      ⚠️  Polygon - Unusual for deposit address`);
            console.log(`      💡 Usually deposit addresses are on Ethereum`);
          } else if (addr.chainId === "8453") {
            console.log(`      ℹ️  Base - Alternative chain for deposits`);
          } else if (addr.chainId === "42161") {
            console.log(`      ℹ️  Arbitrum - Alternative chain for deposits`);
          }
        });
      } else {
        console.log(`   ⚠️  Empty array - no deposit addresses returned`);
      }
    } else if (data.depositAddresses === undefined || data.depositAddresses === null) {
      console.log(`   Status: Not present in response`);
      console.log(`   Meaning: API doesn't return depositAddresses array in this format`);
      console.log(`   💡 Use the 'address' field instead (see above)`);
    } else {
      console.log(`   Type: ${typeof data.depositAddresses}`);
      console.log(`   Value: ${data.depositAddresses}`);
      console.log(`   ⚠️  Unexpected format - expected array`);
    }
    
    // Explain note field
    if (data.note) {
      console.log("\n3️⃣  NOTE FIELD:");
      console.log(`   Value: ${data.note}`);
      console.log(`   Meaning: Additional information from Polymarket Bridge API`);
      console.log(`   💡 Read this for important instructions or warnings`);
    }
    
    // Summary and usage instructions
    console.log("\n" + "=".repeat(80));
    console.log("🎯 HOW TO USE THIS DEPOSIT ADDRESS");
    console.log("=".repeat(80));
    
    const depositAddr = typeof data.address === "string" 
      ? data.address 
      : data.address?.evm || null;
    
    if (depositAddr) {
      console.log(`
✅ CORRECT USAGE FLOW:

1. User must be on Ethereum Mainnet (NOT Polygon!)
   - Network: Ethereum Mainnet
   - Chain ID: 1
   - Use MetaMask or wallet connected to Ethereum

2. User sends USDC from Ethereum mainnet
   - Token: Native USDC on Ethereum
   - Contract: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
   - Amount: Any amount above minimum (usually $2+ USD)

3. Destination address: ${depositAddr}
   - This is the deposit address returned by the API
   - Send USDC TO this address on Ethereum mainnet

4. Polymarket Bridge automatically:
   - Detects the deposit on Ethereum mainnet
   - Bridges funds: Ethereum → Polygon
   - Converts: Native USDC → USDC.e
   - Credits to proxy wallet: ${PROXY_WALLET_ADDRESS}

5. Timeline:
   - Bridge detection: ~1-2 minutes
   - Bridge processing: ~5-10 minutes
   - Total time: ~5-15 minutes

6. After bridge completes:
   - Check proxy wallet balance on Polygon
   - Token: USDC.e (bridged USDC)
   - Network: Polygon (Chain ID: 137)
   - Address: ${PROXY_WALLET_ADDRESS}

❌ WRONG USAGE (what causes issues):

1. ❌ Sending from Polygon to this address
   - Wrong network! Deposit address is on Ethereum
   - Funds won't be processed by bridge

2. ❌ Sending directly to proxy wallet from Ethereum
   - Bypasses bridge system
   - Funds may be stuck or lost

3. ❌ Using this address on Polygon
   - Deposit address should only be used on Ethereum
   - Won't trigger bridge correctly
      `);
    } else {
      console.log(`
⚠️  No clear deposit address found!
Check the depositAddresses array for specific chain/token addresses.
      `);
    }
    
    // Final summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`
API Call: ✅ Successful (${response.status})
Proxy Wallet: ${PROXY_WALLET_ADDRESS} (on Polygon)
Deposit Address: ${depositAddr || "Not found"} (on Ethereum)

Response Format:
${typeof data.address === "string" ? "String address" : typeof data.address === "object" ? "Object address (evm/svm/btc)" : "Unknown format"}
Deposit Addresses Array: ${data.depositAddresses?.length || 0} entries
${data.note ? `Note: ${data.note}` : ""}

💡 KEY TAKEAWAYS:
1. Deposit address is on Ethereum Mainnet (NOT Polygon)
2. Users send FROM Ethereum TO this address
3. Bridge automatically handles Ethereum → Polygon
4. Funds appear in proxy wallet after bridge completes
5. Always verify the network before sending funds!

🔗 Next Steps:
- Use deposit address for Ethereum deposits
- Monitor bridge status (5-15 minutes)
- Check proxy wallet balance on Polygon after bridge
- For Polygon users, use direct deposit endpoint instead
    `);
    
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ ERROR CALLING POLYMARKET BRIDGE API");
    console.error("=".repeat(80));
    console.error(`\n   Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    
    if (error instanceof Error && error.stack) {
      console.error(`\n   Stack trace:`);
      console.error(`   ${error.stack}`);
    }
    
    console.log(`\n💡 TROUBLESHOOTING:`);
    console.log(`   1. Check internet connectivity`);
    console.log(`   2. Verify Polymarket Bridge API is accessible`);
    console.log(`   3. Check if API endpoint has changed`);
    console.log(`   4. Verify proxy wallet address format is correct`);
    console.log(`   5. Check for CORS or network firewall issues`);
  }
}

// Main execution
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function main() {
  await testDepositAPIDirect();
}

