import { config } from "../src/config/env";

// Proxy wallet address
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef";

// Polymarket Bridge API URL
const BRIDGE_API_URL = "https://bridge.polymarket.com";

/**
 * Get Solana deposit address for proxy wallet
 */
async function getSolanaDepositAddress() {
  console.log("🔍 FETCHING SOLANA (SVM) DEPOSIT ADDRESS");
  console.log("=".repeat(80));
  console.log(`\n📍 Proxy Wallet Address: ${PROXY_WALLET_ADDRESS}`);
  console.log(`🌐 API Endpoint: ${BRIDGE_API_URL}/deposit`);
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
    
    if (!response.ok) {
      console.error(`\n❌ API ERROR: ${response.status} ${response.statusText}`);
      console.error(`   Response: ${responseText}`);
      return;
    }
    
    // Parse JSON response
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`\n❌ JSON PARSE ERROR:`);
      console.error(`   ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
      return;
    }
    
    // Display response
    console.log("\n" + "=".repeat(80));
    console.log("✅ PARSED RESPONSE");
    console.log("=".repeat(80));
    console.log("\n📦 Full JSON Response:");
    console.log(JSON.stringify(data, null, 2));
    
    // Extract Solana address
    console.log("\n" + "=".repeat(80));
    console.log("🪙 SOLANA (SVM) DEPOSIT ADDRESS");
    console.log("=".repeat(80));
    
    if (data.address && typeof data.address === "object") {
      if (data.address.svm) {
        console.log(`\n✅ Solana Deposit Address Found!`);
        console.log(`\n📍 SVM Address: ${data.address.svm}`);
        console.log(`   Format: Base58 (Solana address format)`);
        console.log(`   Length: ${data.address.svm.length} characters`);
        console.log(`   Network: Solana Mainnet`);
        
        // Validate Solana address format
        const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        if (solanaAddressRegex.test(data.address.svm)) {
          console.log(`   ✅ Valid Solana address format`);
        } else {
          console.log(`   ⚠️  Address format may be invalid`);
        }
        
        // Show other addresses for context
        if (data.address.evm) {
          console.log(`\n📍 EVM Address: ${data.address.evm}`);
          console.log(`   Network: Ethereum Mainnet (Chain ID: 1)`);
        }
        
        if (data.address.btc) {
          console.log(`\n📍 BTC Address: ${data.address.btc}`);
          console.log(`   Network: Bitcoin Mainnet`);
        }
        
        // Usage instructions
        console.log("\n" + "=".repeat(80));
        console.log("🎯 HOW TO USE THIS SOLANA DEPOSIT ADDRESS");
        console.log("=".repeat(80));
        console.log(`
✅ CORRECT USAGE FLOW:

1. User must be on Solana Mainnet
   - Network: Solana Mainnet
   - Use Phantom, Solflare, or other Solana wallets

2. Check supported assets for Solana
   - Call: GET ${BRIDGE_API_URL}/supported-assets
   - Look for chainId: "1151111081099710" (Solana)
   - Supported tokens: USDC, USDT, SOL, etc.

3. User sends tokens FROM Solana TO this address
   - Destination: ${data.address.svm}
   - Network: Solana Mainnet
   - Token: USDC (or other supported token)
   - Amount: Any amount above minimum (usually $5+ USD)

4. Polymarket Bridge automatically:
   - Detects the deposit on Solana
   - Bridges funds: Solana → Polygon
   - Converts tokens to USDC.e
   - Credits to proxy wallet: ${PROXY_WALLET_ADDRESS}

5. Timeline:
   - Bridge detection: ~1-2 minutes
   - Bridge processing: ~5-15 minutes
   - Total time: ~5-15 minutes

6. After bridge completes:
   - Check proxy wallet balance on Polygon
   - Token: USDC.e (bridged USDC)
   - Network: Polygon (Chain ID: 137)
   - Address: ${PROXY_WALLET_ADDRESS}

⚠️  IMPORTANT NOTES:

- The Solana address is unique to your proxy wallet
- This address is on Solana Mainnet, NOT Polygon
- You send FROM Solana TO this address
- The bridge handles Solana → Polygon conversion
- Funds appear in your proxy wallet on Polygon after bridge

❌ WRONG USAGE:

- Sending from Polygon to this Solana address (wrong network!)
- Sending from Ethereum to this Solana address (wrong network!)
- Sending directly to proxy wallet from Solana (bypasses bridge)
        `);
        
        // Check supported assets for Solana
        console.log("\n" + "=".repeat(80));
        console.log("📋 CHECKING SUPPORTED ASSETS FOR SOLANA");
        console.log("=".repeat(80));
        
        try {
          const assetsResponse = await fetch(`${BRIDGE_API_URL}/supported-assets`);
          if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            
            if (assetsData.supportedAssets && Array.isArray(assetsData.supportedAssets)) {
              const solanaAssets = assetsData.supportedAssets.filter(
                (asset: any) => asset.chainId === "1151111081099710" || asset.chainName === "Solana Mainnet"
              );
              
              if (solanaAssets.length > 0) {
                console.log(`\n✅ Found ${solanaAssets.length} supported assets on Solana:\n`);
                solanaAssets.forEach((asset: any, index: number) => {
                  console.log(`   ${index + 1}. ${asset.token.symbol} (${asset.token.name})`);
                  console.log(`      Address: ${asset.token.address}`);
                  console.log(`      Decimals: ${asset.token.decimals}`);
                  console.log(`      Minimum: $${asset.minCheckoutUsd} USD`);
                  console.log();
                });
              } else {
                console.log(`\n⚠️  No Solana assets found in supported assets list`);
              }
            }
          }
        } catch (error) {
          console.log(`\n⚠️  Could not fetch supported assets: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        
        // Summary
        console.log("\n" + "=".repeat(80));
        console.log("📊 SUMMARY");
        console.log("=".repeat(80));
        console.log(`
Proxy Wallet (Polygon): ${PROXY_WALLET_ADDRESS}
Solana Deposit Address: ${data.address.svm}

✅ Deposit Address Retrieved Successfully!
✅ Ready for Solana deposits

🔗 Next Steps:
1. Use the Solana address above for Solana deposits
2. Send supported tokens from Solana Mainnet
3. Wait 5-15 minutes for bridge to complete
4. Check proxy wallet balance on Polygon after bridge

💡 Remember:
- Solana address is on Solana Mainnet (NOT Polygon!)
- Bridge handles Solana → Polygon conversion
- Funds appear in proxy wallet after bridge completes
        `);
        
      } else {
        console.log(`\n❌ No Solana (SVM) address found in response`);
        console.log(`   Available addresses:`);
        if (data.address.evm) {
          console.log(`   - EVM: ${data.address.evm}`);
        }
        if (data.address.btc) {
          console.log(`   - BTC: ${data.address.btc}`);
        }
      }
    } else {
      console.log(`\n⚠️  Unexpected response format`);
      console.log(`   Response: ${JSON.stringify(data, null, 2)}`);
    }
    
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ ERROR FETCHING DEPOSIT ADDRESS");
    console.error("=".repeat(80));
    console.error(`\n   Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    
    if (error instanceof Error && error.stack) {
      console.error(`\n   Stack trace:`);
      console.error(`   ${error.stack}`);
    }
  }
}

// Main execution
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function main() {
  await getSolanaDepositAddress();
}

