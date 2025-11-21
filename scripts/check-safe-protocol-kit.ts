/**
 * Check Safe owners using Safe Protocol Kit
 * 
 * Usage:
 *   tsx scripts/check-safe-protocol-kit.ts <safeAddress>
 *   Example: tsx scripts/check-safe-protocol-kit.ts 0x28696ea26180c0844d459e1106ae3c77e3ffc25a
 */

import { ethers } from "ethers";
import Safe from '@safe-global/protocol-kit';
import { config } from "../src/config/env";

async function checkSafeOwners(safeAddress: string) {
  console.log("🔍 Checking Safe Owners using Safe Protocol Kit\n");
  console.log("=".repeat(60));
  console.log(`📍 Safe Address: ${safeAddress}`);
  console.log("=".repeat(60) + "\n");
  
  // Connect to Polygon
  const rpcUrl = process.env.POLYGON_RPC_URL || config.blockchain.polygonRpcUrl;
  console.log(`🌐 RPC URL: ${rpcUrl}`);
  
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  
  // Check network
  try {
    const network = await provider.getNetwork();
    console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);
    if (network.chainId !== 137) {
      console.warn(`⚠️  Warning: Expected Polygon (137), but got chain ID ${network.chainId}`);
    }
  } catch (error) {
    console.warn(`⚠️  Could not get network info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Check if Safe is deployed
  console.log(`\n🔍 Checking if Safe is deployed...`);
  const code = await provider.getCode(safeAddress);
  if (code === "0x" || code === "0x0") {
    console.error(`❌ Safe wallet is NOT deployed at ${safeAddress}`);
    return;
  }
  
  console.log(`✅ Safe wallet IS deployed on-chain!\n`);
  
  // Initialize Safe Protocol Kit
  console.log(`🔧 Initializing Safe Protocol Kit...`);
  try {
    const safeSdk = await Safe.init({
      provider: rpcUrl,
      safeAddress: ethers.utils.getAddress(safeAddress),
    });
    
    console.log(`✅ Safe Protocol Kit initialized\n`);
    
    // Get Safe information
    console.log(`📋 Fetching Safe information...`);
    const owners = await safeSdk.getOwners();
    const threshold = await safeSdk.getThreshold();
    const safeVersion = await safeSdk.getContractVersion();
    
    console.log(`✅ Safe Information Retrieved:\n`);
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   Safe Version: ${safeVersion}`);
    const thresholdNum = typeof threshold === 'number' ? threshold : (threshold.toString ? parseInt(threshold.toString()) : 1);
    console.log(`   Threshold: ${thresholdNum} (requires ${thresholdNum} signature${thresholdNum > 1 ? 's' : ''})`);
    console.log(`   Total Owners: ${owners.length}\n`);
    
    console.log("👥 Owners List:");
    owners.forEach((owner: string, index: number) => {
      const normalizedOwner = ethers.utils.getAddress(owner);
      console.log(`   ${index + 1}. ${normalizedOwner}`);
    });
    
    // Get Safe balance
    try {
      const balance = await provider.getBalance(safeAddress);
      console.log(`\n💰 Safe Balance: ${ethers.utils.formatEther(balance)} MATIC`);
    } catch (error) {
      console.log(`\n⚠️  Could not fetch Safe balance`);
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Summary:");
    console.log("=".repeat(60));
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   Safe Version: ${safeVersion}`);
    console.log(`   Owners: ${owners.length}`);
    console.log(`   Threshold: ${threshold.toString()}`);
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("❌ Error using Safe Protocol Kit:", error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    
    // Fallback: Use direct contract call
    console.log(`\n🔄 Falling back to direct contract call...`);
    const SAFE_ABI = [
      "function getOwners() view returns (address[] memory)",
      "function getThreshold() view returns (uint256)",
    ];
    
    try {
      const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
      const owners = await safeContract.getOwners();
      const threshold = await safeContract.getThreshold();
      
      console.log(`✅ Retrieved via direct contract call:\n`);
      console.log(`   Threshold: ${threshold.toString()}`);
      console.log(`   Total Owners: ${owners.length}\n`);
      console.log("👥 Owners List:");
      owners.forEach((owner: string, index: number) => {
        const normalizedOwner = ethers.utils.getAddress(owner);
        console.log(`   ${index + 1}. ${normalizedOwner}`);
      });
    } catch (fallbackError) {
      console.error(`❌ Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("❌ Usage: tsx scripts/check-safe-protocol-kit.ts <safeAddress>");
    console.error("   Example: tsx scripts/check-safe-protocol-kit.ts 0x28696ea26180c0844d459e1106ae3c77e3ffc25a");
    process.exit(1);
  }
  
  const safeAddress = args[0];
  
  // Validate address
  if (!ethers.utils.isAddress(safeAddress)) {
    console.error(`❌ Invalid Safe address: ${safeAddress}`);
    process.exit(1);
  }
  
  await checkSafeOwners(safeAddress);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

