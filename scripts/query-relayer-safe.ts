/**
 * Query Polymarket relayer for existing Safe deployment address
 * 
 * This script demonstrates how to query the relayer for the actual
 * deployed Safe address when the relayer says "already deployed"
 * 
 * Usage:
 *   tsx scripts/query-relayer-safe.ts <userAddress>
 *   Example: tsx scripts/query-relayer-safe.ts 0xa3efc864fbd880bccf836df4783acf9fa4cc580b
 */

import { ethers } from "ethers";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { builderConfig } from "../src/services/builder-config";
import { config } from "../src/config/env";
import { deriveWalletForUser } from "../src/services/relayer-client";

const POLYGON_CHAIN_ID = 137;
const relayerUrl = process.env.POLYMARKET_RELAYER_URL || config.polymarket.relayerUrl;

async function queryRelayerForSafe(userAddress: string) {
  console.log("🔍 Querying Polymarket Relayer for Safe Deployment\n");
  console.log("=".repeat(60));
  console.log(`👤 User Address: ${userAddress}`);
  console.log("=".repeat(60) + "\n");
  
  // Derive wallet for user
  const derivedWallet = deriveWalletForUser(userAddress);
  console.log(`🔑 Derived Wallet: ${derivedWallet.address}\n`);
  
  // Create RelayerClient
  const relayerClient = new RelayClient(
    relayerUrl,
    POLYGON_CHAIN_ID,
    derivedWallet,
    builderConfig
  );
  
  console.log(`🌐 Relayer URL: ${relayerUrl}`);
  console.log(`📡 Chain ID: ${POLYGON_CHAIN_ID}\n`);
  
  // Step 1: Try to query transactions
  console.log("📋 Step 1: Querying relayer transactions...");
  try {
    const transactions = await relayerClient.getTransactions();
    console.log(`✅ Retrieved ${transactions.length} transaction(s) from relayer\n`);
    
    if (transactions.length === 0) {
      console.log("⚠️  No transactions found in relayer history");
      console.log("   This might mean:");
      console.log("   1. The Safe was never deployed via this relayer");
      console.log("   2. The relayer doesn't track historical transactions");
      console.log("   3. The derived wallet hasn't been used with this relayer");
    } else {
      console.log("📜 Transaction History:");
      transactions.forEach((tx: any, index: number) => {
        console.log(`\n   Transaction ${index + 1}:`);
        console.log(`   ID: ${tx.transactionID || 'N/A'}`);
        console.log(`   Type: ${tx.type || 'N/A'}`);
        console.log(`   State: ${tx.state || 'N/A'}`);
        console.log(`   From: ${tx.from || 'N/A'}`);
        console.log(`   To: ${tx.to || 'N/A'}`);
        console.log(`   Proxy Address: ${tx.proxyAddress || 'N/A'}`);
        console.log(`   Transaction Hash: ${tx.transactionHash || 'N/A'}`);
        console.log(`   Created: ${tx.createdAt || 'N/A'}`);
      });
      
      // Find SAFE-CREATE transactions
      const safeCreateTxs = transactions.filter(
        (tx: any) => tx.type === 'SAFE-CREATE' || tx.type === 'SAFE_CREATE'
      );
      
      if (safeCreateTxs.length > 0) {
        console.log(`\n✅ Found ${safeCreateTxs.length} Safe deployment transaction(s)`);
        
        // Get the most recent one
        const mostRecent = safeCreateTxs.sort((a: any, b: any) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        })[0];
        
        if (mostRecent.proxyAddress) {
          console.log(`\n📍 Most Recent Safe Deployment:`);
          console.log(`   Safe Address: ${mostRecent.proxyAddress}`);
          console.log(`   Transaction ID: ${mostRecent.transactionID}`);
          console.log(`   Transaction Hash: ${mostRecent.transactionHash}`);
          console.log(`   State: ${mostRecent.state}`);
          console.log(`   Created: ${mostRecent.createdAt}`);
          
          // Verify on-chain
          console.log(`\n🔍 Verifying Safe is deployed on-chain...`);
          const provider = new ethers.providers.JsonRpcProvider(
            process.env.POLYGON_RPC_URL || config.blockchain.polygonRpcUrl
          );
          const code = await provider.getCode(mostRecent.proxyAddress);
          
          if (code !== '0x' && code !== '0x0') {
            console.log(`✅ Safe IS deployed on-chain at ${mostRecent.proxyAddress}`);
            
            // Check owners
            const SAFE_ABI = [
              "function getOwners() view returns (address[] memory)",
              "function getThreshold() view returns (uint256)",
            ];
            const safeContract = new ethers.Contract(mostRecent.proxyAddress, SAFE_ABI, provider);
            const owners = await safeContract.getOwners();
            const threshold = await safeContract.getThreshold();
            
            console.log(`\n📋 Safe Configuration:`);
            console.log(`   Owners: ${owners.length}`);
            console.log(`   Threshold: ${threshold.toString()}`);
            console.log(`\n👥 Owners:`);
            owners.forEach((owner: string, index: number) => {
              const isDerived = owner.toLowerCase() === derivedWallet.address.toLowerCase();
              console.log(`   ${index + 1}. ${owner} ${isDerived ? '✅ (Derived Wallet)' : ''}`);
            });
            
            console.log("\n" + "=".repeat(60));
            console.log("✅ SUCCESS: Found deployed Safe address from relayer!");
            console.log("=".repeat(60));
            console.log(`   Safe Address: ${mostRecent.proxyAddress}`);
            console.log(`   Derived Wallet is Owner: ${owners.some((o: string) => o.toLowerCase() === derivedWallet.address.toLowerCase()) ? '✅ Yes' : '❌ No'}`);
            console.log("=".repeat(60));
            
            return mostRecent.proxyAddress;
          } else {
            console.log(`❌ Safe is NOT deployed on-chain at ${mostRecent.proxyAddress}`);
            console.log(`   The transaction may have failed or is still pending`);
          }
        } else {
          console.log(`⚠️  Safe deployment transaction found but no proxyAddress in response`);
        }
      } else {
        console.log(`\n⚠️  No SAFE-CREATE transactions found in history`);
        console.log(`   The Safe may have been deployed via a different method`);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Error querying relayer transactions: ${errorMessage}`);
    
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      console.log(`\n💡 This might be an authentication issue with the relayer`);
      console.log(`   Make sure POLY_BUILDER_API_KEY, POLY_BUILDER_SECRET, and POLY_BUILDER_PASSPHRASE are set`);
    }
  }
  
  // Step 2: Try to deploy (will return existing address if already deployed)
  console.log(`\n📦 Step 2: Attempting deployment to get address...`);
  try {
    const response = await relayerClient.deploy();
    const result = await response.wait();
    
    if (result && result.proxyAddress) {
      console.log(`✅ Deployment response received:`);
      console.log(`   Safe Address: ${result.proxyAddress}`);
      console.log(`   Transaction Hash: ${result.transactionHash}`);
      console.log(`   State: ${result.state}`);
      return result.proxyAddress;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`⚠️  Deployment attempt: ${errorMessage}`);
    
    if (errorMessage.includes('SAFE_DEPLOYED') || errorMessage.includes('safe already deployed')) {
      console.log(`   Relayer confirms Safe is already deployed`);
      console.log(`   But we couldn't get the address from the error`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("❌ Could not determine Safe address from relayer");
  console.log("=".repeat(60));
  return null;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("❌ Usage: tsx scripts/query-relayer-safe.ts <userAddress>");
    console.error("   Example: tsx scripts/query-relayer-safe.ts 0xa3efc864fbd880bccf836df4783acf9fa4cc580b");
    process.exit(1);
  }
  
  const userAddress = args[0];
  
  if (!ethers.utils.isAddress(userAddress)) {
    console.error(`❌ Invalid user address: ${userAddress}`);
    process.exit(1);
  }
  
  await queryRelayerForSafe(userAddress);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

