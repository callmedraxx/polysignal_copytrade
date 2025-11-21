import { prisma } from "../src/config/database";
import { getUnifiedDepositOptions } from "../src/services/deposit-options";

// Test with proxy wallet address
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef";

/**
 * Test the unified deposit endpoint
 */
async function testUnifiedDeposit() {
  console.log("🔍 TESTING UNIFIED DEPOSIT ENDPOINT");
  console.log("=".repeat(80));
  
  // Find user by proxy wallet
  console.log("\n📋 Finding user by proxy wallet...");
  const user = await prisma.user.findFirst({
    where: { proxyWallet: PROXY_WALLET_ADDRESS.toLowerCase() },
  });
  
  if (!user) {
    console.log("❌ No user found with this proxy wallet!");
    console.log("\n💡 To test properly, you need a user in the database.");
    console.log("   The endpoint requires an authenticated user.");
    console.log("\n   For testing via API:");
    console.log("   GET /api/deposit/unified");
    console.log("   Authorization: Bearer <JWT_TOKEN>");
    return;
  }
  
  console.log(`✅ Found user: ${user.address}`);
  console.log(`   Proxy Wallet: ${user.proxyWallet}`);
  
  // Get unified deposit options
  console.log("\n📋 Fetching unified deposit options...");
  try {
    const options = await getUnifiedDepositOptions(user.address);
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ UNIFIED DEPOSIT OPTIONS");
    console.log("=".repeat(80));
    
    // Display proxy wallet info
    console.log("\n📍 PROXY WALLET (Destination for ALL deposits):");
    console.log(`   Address: ${options.proxyWallet}`);
    console.log(`   Network: ${options.proxyWalletNetwork.name} (Chain ID: ${options.proxyWalletNetwork.chainId})`);
    console.log(`   Explorer: ${options.proxyWalletNetwork.explorerUrl}`);
    console.log(`   💡 This is where ALL deposits ultimately arrive!`);
    
    // Display options
    console.log("\n" + "=".repeat(80));
    console.log(`📦 DEPOSIT OPTIONS (${options.options.length} available)`);
    console.log("=".repeat(80));
    
    options.options.forEach((option, index) => {
      console.log(`\n${index + 1}. ${option.name}${option.recommended ? " ⭐ RECOMMENDED" : ""}`);
      console.log(`   Type: ${option.type}`);
      console.log(`   ID: ${option.id}`);
      console.log(`   Description: ${option.description}`);
      console.log(`   Network: ${option.network.displayName} (Chain ID: ${option.network.chainId})`);
      console.log(`   Deposit Address: ${option.depositAddress}`);
      console.log(`   Token: ${option.token.symbol} (${option.token.name})`);
      console.log(`   Token Address: ${option.token.address}`);
      console.log(`   Speed: ${option.speed}`);
      console.log(`   Fees: ${option.fees}`);
      
      if (option.explorerUrl) {
        console.log(`   Explorer: ${option.explorerUrl}`);
      }
      
      if (option.warnings && option.warnings.length > 0) {
        console.log(`\n   ⚠️  WARNINGS:`);
        option.warnings.forEach(warning => {
          console.log(`      ${warning}`);
        });
      }
      
      if (option.instructions && option.instructions.length > 0) {
        console.log(`\n   ✅ INSTRUCTIONS:`);
        option.instructions.forEach((instruction, i) => {
          console.log(`      ${i + 1}. ${instruction}`);
        });
      }
      
      if (option.commonMistakes && option.commonMistakes.length > 0) {
        console.log(`\n   ❌ COMMON MISTAKES (AVOID THESE):`);
        option.commonMistakes.forEach(mistake => {
          console.log(`      ${mistake}`);
        });
      }
      
      if (option.example) {
        console.log(`\n   📝 EXAMPLE:`);
        console.log(`      Network: ${option.example.network}`);
        console.log(`      Token: ${option.example.token}`);
        console.log(`      Amount: ${option.example.amount}`);
        console.log(`      From: ${option.example.from}`);
        console.log(`      To: ${option.example.to}`);
      }
    });
    
    // Display recommendations
    console.log("\n" + "=".repeat(80));
    console.log("💡 RECOMMENDATIONS");
    console.log("=".repeat(80));
    console.log(`\n📌 For Polygon Users:`);
    console.log(`   ${options.recommendations.forPolygonUsers}`);
    console.log(`\n📌 For Ethereum Users:`);
    console.log(`   ${options.recommendations.forEthereumUsers}`);
    console.log(`\n📌 For Other Chain Users:`);
    console.log(`   ${options.recommendations.forOtherChainUsers}`);
    
    // Display important notes
    console.log("\n" + "=".repeat(80));
    console.log("⚠️  IMPORTANT NOTES");
    console.log("=".repeat(80));
    options.importantNotes.forEach(note => {
      console.log(`   ${note}`);
    });
    
    // Display supported assets summary
    console.log("\n" + "=".repeat(80));
    console.log(`📊 SUPPORTED ASSETS (${options.supportedAssets.length} total)`);
    console.log("=".repeat(80));
    
    // Group by chain
    const byChain: Record<string, typeof options.supportedAssets> = {};
    options.supportedAssets.forEach(asset => {
      if (!byChain[asset.chainName]) {
        byChain[asset.chainName] = [];
      }
      byChain[asset.chainName].push(asset);
    });
    
    Object.entries(byChain).forEach(([chainName, assets]) => {
      console.log(`\n   ${chainName} (Chain ID: ${assets[0].chainId}):`);
      assets.forEach(asset => {
        console.log(`      - ${asset.token.symbol} (${asset.token.name})`);
        console.log(`        Address: ${asset.token.address}`);
        console.log(`        Minimum: $${asset.minCheckoutUsd} USD`);
      });
    });
    
    // Display help text
    console.log("\n" + "=".repeat(80));
    console.log("📚 HELP TEXT");
    console.log("=".repeat(80));
    console.log(`\n${options.helpText}`);
    
    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY");
    console.log("=".repeat(80));
    console.log(`
Proxy Wallet: ${options.proxyWallet} (on Polygon)
Total Options: ${options.options.length}
   - Direct: ${options.options.filter(o => o.type === 'direct').length}
   - Bridge: ${options.options.filter(o => o.type === 'bridge').length}
Recommended Option: ${options.options.find(o => o.recommended)?.name || 'None'}
Supported Assets: ${options.supportedAssets.length} assets across ${Object.keys(byChain).length} chains

✅ This endpoint provides all deposit information in one place!
✅ Clear warnings prevent common mistakes!
✅ Instructions guide users step-by-step!
✅ Recommendations help users choose the right method!
    `);
    
  } catch (error) {
    console.error("\n❌ ERROR FETCHING UNIFIED DEPOSIT OPTIONS:");
    console.error(`   ${error instanceof Error ? error.message : "Unknown error"}`);
    
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
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
  await testUnifiedDeposit();
}

