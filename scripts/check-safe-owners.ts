import { ethers } from "ethers";
import { config } from "../src/config/env";
import { deriveWalletForUser, getExpectedSafeAddress } from "../src/services/relayer-client";
import { prisma } from "../src/config/database";

// Safe contract ABI - minimal ABI for getting owners
const SAFE_ABI = [
  "function getOwners() view returns (address[] memory)",
  "function getThreshold() view returns (uint256)",
  "function isOwner(address owner) view returns (bool)",
];

/**
 * Check Safe wallet owners on-chain
 */
async function checkSafeOwners(safeAddress: string, userAddress?: string) {
  console.log("🔍 Checking Safe wallet owners on-chain...\n");
  console.log(`📍 Safe Address: ${safeAddress}`);
  
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
    console.error(`❌ Safe wallet is not deployed at ${safeAddress}`);
    console.log(`\n💡 Possible reasons:`);
    console.log(`   1. The Safe was never deployed`);
    console.log(`   2. The address is incorrect`);
    console.log(`   3. You're connected to the wrong network`);
    console.log(`   4. The Safe was deployed on a different network`);
    console.log(`\n🔍 Checking transaction history...`);
    
    // Try to get transaction count (nonce) - if it's > 0, the address has been used
    try {
      const txCount = await provider.getTransactionCount(safeAddress);
      const balance = await provider.getBalance(safeAddress);
      console.log(`   Transaction Count: ${txCount}`);
      console.log(`   Balance: ${ethers.utils.formatEther(balance)} MATIC`);
      if (txCount > 0) {
        console.log(`   ⚠️  Address has ${txCount} transactions, but no contract code`);
        console.log(`   This suggests the address was used but the Safe contract is not deployed`);
      } else {
        console.log(`   ℹ️  Address has never been used (0 transactions)`);
      }
    } catch (error) {
      console.log(`   ⚠️  Could not check transaction count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // If user address is provided, calculate expected Safe address
    if (userAddress) {
      console.log(`\n🔍 Calculating expected Safe address from derived wallet...`);
      try {
        const derivedWallet = deriveWalletForUser(userAddress);
        console.log(`   Derived Wallet: ${derivedWallet.address}`);
        const expectedSafeAddress = await getExpectedSafeAddress(derivedWallet);
        console.log(`   Expected Safe Address: ${expectedSafeAddress}`);
        
        if (expectedSafeAddress.toLowerCase() === safeAddress.toLowerCase()) {
          console.log(`   ✅ Expected address matches provided address`);
          console.log(`   ⚠️  But the Safe is not deployed at this address!`);
          console.log(`\n💡 Possible Issues:`);
          console.log(`   1. The relayer reported "Safe already deployed" but the deployment never completed`);
          console.log(`   2. The deployment transaction failed or was reverted`);
          console.log(`   3. The deployment is still pending confirmation`);
          console.log(`   4. There's a network mismatch (deployed on different network)`);
          console.log(`\n🔧 Recommended Actions:`);
          console.log(`   1. Check the relayer transaction status`);
          console.log(`   2. Verify the deployment transaction on PolygonScan`);
          console.log(`   3. Try redeploying the Safe if it's truly not deployed`);
          console.log(`   4. Check if the relayer is using a different network`);
        } else {
          console.log(`   ⚠️  Expected address does NOT match provided address!`);
          console.log(`   📍 Provided: ${safeAddress}`);
          console.log(`   📍 Expected: ${expectedSafeAddress}`);
          console.log(`   💡 Try checking the expected address instead.`);
          
          // Check if expected address is deployed
          console.log(`\n🔍 Checking if expected Safe address is deployed...`);
          const expectedCode = await provider.getCode(expectedSafeAddress);
          if (expectedCode !== "0x" && expectedCode !== "0x0") {
            console.log(`   ✅ Expected Safe address IS deployed!`);
            console.log(`   💡 The Safe was deployed to: ${expectedSafeAddress}`);
            console.log(`   ⚠️  But the stored address is: ${safeAddress}`);
            console.log(`   💡 This suggests the database has the wrong address stored.`);
            
            // Check owners of the expected address
            console.log(`\n🔍 Checking owners of the expected Safe address...`);
            try {
              const expectedSafeContract = new ethers.Contract(expectedSafeAddress, SAFE_ABI, provider);
              const expectedOwners = await expectedSafeContract.getOwners();
              const expectedThreshold = await expectedSafeContract.getThreshold();
              
              console.log(`   ✅ Found Safe at expected address!`);
              console.log(`   Owners: ${expectedOwners.length}`);
              console.log(`   Threshold: ${expectedThreshold.toString()}`);
              console.log(`\n👥 Owners List:`);
              expectedOwners.forEach((owner: string, index: number) => {
                const isDerived = owner.toLowerCase() === derivedWallet.address.toLowerCase();
                console.log(`   ${index + 1}. ${owner} ${isDerived ? '✅ (Derived Wallet)' : ''}`);
              });
              
              // Check if derived wallet is owner
              const isOwner = expectedOwners.some(
                (owner: string) => owner.toLowerCase() === derivedWallet.address.toLowerCase()
              );
              if (isOwner) {
                console.log(`\n✅ Derived wallet IS an owner of the expected Safe!`);
              } else {
                console.log(`\n❌ Derived wallet is NOT an owner of the expected Safe!`);
                console.log(`   ⚠️  This is the root cause of the "invalid signature" error!`);
              }
            } catch (error) {
              console.log(`   ⚠️  Could not check owners: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            console.log(`   ❌ Expected Safe address is also NOT deployed`);
          }
        }
      } catch (error) {
        console.log(`   ⚠️  Could not calculate expected Safe address: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return;
  }
  
  console.log("✅ Safe wallet is deployed\n");
  
  // Create Safe contract instance
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  
  try {
    // Get owners
    const owners = await safeContract.getOwners();
    const threshold = await safeContract.getThreshold();
    
    console.log("📋 Safe Wallet Configuration:");
    console.log(`   Threshold: ${threshold.toString()} (requires ${threshold.toString()} signatures)`);
    console.log(`   Total Owners: ${owners.length}\n`);
    
    console.log("👥 Owners List:");
    owners.forEach((owner: string, index: number) => {
      console.log(`   ${index + 1}. ${owner}`);
    });
    
    // If user address is provided, check derived wallet
    if (userAddress) {
      console.log("\n🔑 Derived Wallet Information:");
      try {
        const derivedWallet = deriveWalletForUser(userAddress);
        console.log(`   User Address: ${userAddress}`);
        console.log(`   Derived Wallet: ${derivedWallet.address}`);
        
        // Calculate expected Safe address
        try {
          const expectedSafeAddress = await getExpectedSafeAddress(derivedWallet);
          console.log(`   Expected Safe Address: ${expectedSafeAddress}`);
          if (expectedSafeAddress.toLowerCase() === safeAddress.toLowerCase()) {
            console.log(`   ✅ Expected Safe address matches the provided address`);
          } else {
            console.log(`   ⚠️  Expected Safe address does NOT match the provided address!`);
            console.log(`   📍 Provided: ${safeAddress}`);
            console.log(`   📍 Expected: ${expectedSafeAddress}`);
          }
        } catch (error) {
          console.log(`   ⚠️  Could not calculate expected Safe address: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Check if derived wallet is an owner
        const isOwner = await safeContract.isOwner(derivedWallet.address);
        if (isOwner) {
          console.log(`   ✅ Derived wallet IS an owner of the Safe`);
        } else {
          console.log(`   ❌ Derived wallet is NOT an owner of the Safe`);
          console.log(`   ⚠️  This may cause signature validation issues!`);
        }
        
        // Check if derived wallet matches any owner
        const matchesOwner = owners.some(
          (owner: string) => owner.toLowerCase() === derivedWallet.address.toLowerCase()
        );
        if (matchesOwner) {
          console.log(`   ✅ Derived wallet matches an owner in the list`);
        } else {
          console.log(`   ❌ Derived wallet does NOT match any owner in the list`);
        }
      } catch (error) {
        console.error(`   ❌ Error deriving wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   Owners: ${owners.length}`);
    console.log(`   Threshold: ${threshold.toString()}`);
    if (userAddress) {
      const derivedWallet = deriveWalletForUser(userAddress);
      const isOwner = owners.some(
        (owner: string) => owner.toLowerCase() === derivedWallet.address.toLowerCase()
      );
      console.log(`   Derived Wallet is Owner: ${isOwner ? "✅ Yes" : "❌ No"}`);
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
  // Get Safe address from command line or use default
  const args = process.argv.slice(2);
  let safeAddress: string | undefined;
  let userAddress: string | undefined;
  
  // If first arg looks like a Safe address (42 chars starting with 0x), use it
  if (args.length > 0 && args[0].startsWith('0x') && args[0].length === 42) {
    safeAddress = args[0];
    // Check if second arg is user address
    if (args.length > 1 && args[1].startsWith('0x') && args[1].length === 42) {
      userAddress = args[1];
    }
  } else if (args.length > 0) {
    // First arg is user address
    userAddress = args[0];
    safeAddress = "0x9dfc674b9788c13a1b55b1ef96d07304798f9a05"; // Default
  } else {
    safeAddress = "0x9dfc674b9788c13a1b55b1ef96d07304798f9a05"; // Default
  }
  
  if (args.length > 0) {
    // First arg could be Safe address or user address
    if (args[0].startsWith("0x") && args[0].length === 42) {
      // Check if it's a Safe address (try to find user by proxyWallet)
      try {
        const user = await prisma.user.findFirst({
          where: { proxyWallet: args[0].toLowerCase() },
        });
        if (user) {
          safeAddress = args[0];
          userAddress = user.address;
          console.log(`👤 Found user in database: ${userAddress}`);
          console.log(`📍 Safe Address: ${safeAddress}\n`);
        } else {
          // Assume it's a user address
          userAddress = args[0];
          console.log(`👤 Using user address from command line: ${userAddress}`);
          // Try to find Safe address from database
          try {
            const user = await prisma.user.findFirst({
              where: { address: userAddress.toLowerCase() },
            });
            if (user && user.proxyWallet) {
              safeAddress = user.proxyWallet;
              console.log(`📍 Found Safe address in database: ${safeAddress}\n`);
            } else {
              console.log(`📍 Using default Safe address: ${safeAddress}\n`);
            }
          } catch (error) {
            console.log(`📍 Using default Safe address: ${safeAddress}\n`);
          }
        }
      } catch (error) {
        // Database not available, assume it's user address
        userAddress = args[0];
        console.log(`👤 Using user address from command line: ${userAddress}`);
        console.log(`📍 Using default Safe address: ${safeAddress}\n`);
      }
    } else {
      userAddress = args[0];
      console.log(`👤 Using user address from command line: ${userAddress}`);
      console.log(`📍 Using default Safe address: ${safeAddress}\n`);
    }
  } else {
    // Try to find user address from database using default Safe address
    try {
      const user = await prisma.user.findFirst({
        where: { proxyWallet: safeAddress.toLowerCase() },
      });
      if (user) {
        userAddress = user.address;
        console.log(`👤 Found user in database: ${userAddress}`);
        console.log(`📍 Safe Address: ${safeAddress}\n`);
      } else {
        console.log("ℹ️  No user address provided. Run with: tsx scripts/check-safe-owners.ts <userAddress>");
        console.log("   Example: tsx scripts/check-safe-owners.ts 0xa3efc864fbd880bccf836df4783acf9fa4cc580b");
        console.log("   Or: tsx scripts/check-safe-owners.ts <safeAddress>\n");
      }
    } catch (error) {
      console.log("ℹ️  Could not query database (may be in-memory or not available)");
      console.log("   Run with: tsx scripts/check-safe-owners.ts <userAddress>");
      console.log("   Example: tsx scripts/check-safe-owners.ts 0xa3efc864fbd880bccf836df4783acf9fa4cc580b\n");
    }
  }
  
  await checkSafeOwners(safeAddress, userAddress);
  
  // Close database connection if needed
  try {
    await prisma.$disconnect();
  } catch (error) {
    // Ignore disconnect errors
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

