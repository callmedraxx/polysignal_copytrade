/**
 * Verify a deployed Safe and check if the owner matches the derived wallet
 * 
 * Usage:
 *   tsx scripts/verify-deployed-safe.ts <safeAddress> <derivedWalletAddress>
 *   Example: tsx scripts/verify-deployed-safe.ts 0xb2a4ef3913f4c6fd0a82ab1ca2af0be3b85856fa 0xaCd15889DA6452801D082541fD944E631C8B4011
 */

import { ethers } from "ethers";
import { config } from "../src/config/env";

// Safe contract ABI
const SAFE_ABI = [
  "function getOwners() view returns (address[] memory)",
  "function getThreshold() view returns (uint256)",
  "function isOwner(address owner) view returns (bool)",
];

async function verifyDeployedSafe(safeAddress: string, expectedDerivedWallet: string) {
  console.log("🔍 Verifying Deployed Safe\n");
  console.log("=".repeat(60));
  console.log(`📍 Safe Address: ${safeAddress}`);
  console.log(`🔑 Expected Derived Wallet: ${expectedDerivedWallet}`);
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
  
  // Create Safe contract instance
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  
  try {
    // Get owners
    const owners = await safeContract.getOwners();
    const threshold = await safeContract.getThreshold();
    
    console.log("📋 Safe Wallet Configuration:");
    console.log(`   Threshold: ${threshold.toString()} (requires ${threshold.toString()} signature${threshold.gt(1) ? 's' : ''})`);
    console.log(`   Total Owners: ${owners.length}\n`);
    
    console.log("👥 Owners List:");
    owners.forEach((owner: string, index: number) => {
      const normalizedOwner = ethers.utils.getAddress(owner);
      const normalizedExpected = ethers.utils.getAddress(expectedDerivedWallet);
      const matches = normalizedOwner.toLowerCase() === normalizedExpected.toLowerCase();
      console.log(`   ${index + 1}. ${normalizedOwner} ${matches ? '✅ (Matches Expected)' : ''}`);
    });
    
    // Check if expected derived wallet is an owner
    const normalizedExpected = ethers.utils.getAddress(expectedDerivedWallet);
    const isOwner = await safeContract.isOwner(normalizedExpected);
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ Verification Results:");
    console.log("=".repeat(60));
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   Expected Derived Wallet: ${normalizedExpected}`);
    console.log(`   Is Owner: ${isOwner ? '✅ YES' : '❌ NO'}`);
    console.log(`   Total Owners: ${owners.length}`);
    console.log(`   Threshold: ${threshold.toString()}`);
    
    if (isOwner) {
      console.log("\n✅ SUCCESS: The derived wallet IS an owner of the Safe!");
      console.log("   This Safe can be used for trading with POLY_GNOSIS_SAFE signature type.");
    } else {
      console.log("\n❌ FAILURE: The derived wallet is NOT an owner of the Safe!");
      console.log("   ⚠️  This will cause 'invalid signature' errors when trading.");
      console.log("\n   Actual owners:");
      owners.forEach((owner: string, index: number) => {
        console.log(`     ${index + 1}. ${ethers.utils.getAddress(owner)}`);
      });
    }
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("❌ Error fetching Safe owners:", error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Usage: tsx scripts/verify-deployed-safe.ts <safeAddress> <derivedWalletAddress>");
    console.error("   Example: tsx scripts/verify-deployed-safe.ts 0xb2a4ef3913f4c6fd0a82ab1ca2af0be3b85856fa 0xaCd15889DA6452801D082541fD944E631C8B4011");
    process.exit(1);
  }
  
  const safeAddress = args[0];
  const derivedWalletAddress = args[1];
  
  // Validate addresses
  if (!ethers.utils.isAddress(safeAddress)) {
    console.error(`❌ Invalid Safe address: ${safeAddress}`);
    process.exit(1);
  }
  
  if (!ethers.utils.isAddress(derivedWalletAddress)) {
    console.error(`❌ Invalid derived wallet address: ${derivedWalletAddress}`);
    process.exit(1);
  }
  
  await verifyDeployedSafe(safeAddress, derivedWalletAddress);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

