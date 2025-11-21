import { ethers } from "ethers";
import { config } from "../src/config/env";
import { prisma } from "../src/config/database";
import { createDepositAddresses } from "../src/services/bridge-deposit";

// Addresses to investigate
const PROXY_WALLET_ADDRESS = "0xc7341f97032a56510720c302003d4b09ce6cfeef"; // Safe proxy wallet
const DEPOSIT_EVM_ADDRESS = "0x7Ae9DBCc134865BEf3b66be0C8f5e7929344e56a"; // Deposit address from Polymarket Bridge API

// USDC contract address on Polygon (Native USDC)
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Native USDC on Polygon
// USDC.e (bridged) contract address on Polygon
const POLYGON_USDCe = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC.e on Polygon

// ERC20 ABI for balance checking
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Etherscan-like API URLs (for transaction history)
const POLYGONSCAN_API_URL = process.env.POLYGONSCAN_API_URL || "https://api.polygonscan.com/api";

/**
 * Check balance of an address for both USDC and USDC.e
 */
async function checkBalances(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  label: string
) {
  console.log(`\n💰 Checking balances for ${label}`);
  console.log(`   Address: ${address}`);
  
  try {
    // Check native MATIC balance
    const maticBalance = await provider.getBalance(address);
    console.log(`   MATIC: ${ethers.utils.formatEther(maticBalance)} MATIC`);
    
    // Check Native USDC balance
    try {
      const usdcContract = new ethers.Contract(POLYGON_USDC, ERC20_ABI, provider);
      const usdcBalance = await usdcContract.balanceOf(address);
      const usdcDecimals = await usdcContract.decimals();
      const usdcSymbol = await usdcContract.symbol();
      const formattedUsdc = ethers.utils.formatUnits(usdcBalance, usdcDecimals);
      console.log(`   ${usdcSymbol}: ${formattedUsdc} (${usdcBalance.toString()} raw)`);
    } catch (error) {
      console.log(`   Native USDC: Error checking - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Check USDC.e (bridged) balance
    try {
      const usdceContract = new ethers.Contract(POLYGON_USDCe, ERC20_ABI, provider);
      const usdceBalance = await usdceContract.balanceOf(address);
      const usdceDecimals = await usdceContract.decimals();
      const usdceSymbol = await usdceContract.symbol();
      const formattedUsdce = ethers.utils.formatUnits(usdceBalance, usdceDecimals);
      console.log(`   ${usdceSymbol}: ${formattedUsdce} (${usdceBalance.toString()} raw)`);
    } catch (error) {
      console.log(`   USDC.e: Error checking - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`   ❌ Error checking balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if an address is a contract
 */
async function checkIsContract(
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<boolean> {
  const code = await provider.getCode(address);
  return code !== "0x" && code !== "0x0";
}

/**
 * Get transaction history for an address (using Polygonscan API if available)
 */
async function getTransactionHistory(address: string) {
  const apiKey = process.env.POLYGONSCAN_API_KEY;
  
  if (!apiKey) {
    console.log(`   ⚠️  POLYGONSCAN_API_KEY not set, skipping transaction history`);
    console.log(`   💡 Set POLYGONSCAN_API_KEY in .env to enable transaction history checking`);
    return null;
  }
  
  try {
    console.log(`   🔍 Fetching transaction history from Polygonscan...`);
    
    // Get normal transactions
    const normalUrl = `${POLYGONSCAN_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const normalResponse = await fetch(normalUrl);
    const normalData = await normalResponse.json();
    
    if (normalData.status !== "1") {
      console.log(`   ⚠️  Error fetching normal transactions: ${normalData.message || 'Unknown error'}`);
    }
    
    // Get token transfers
    const tokenUrl = `${POLYGONSCAN_API_URL}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.status !== "1") {
      console.log(`   ⚠️  Error fetching token transactions: ${tokenData.message || 'Unknown error'}`);
    }
    
    const normalTxs = normalData.status === "1" ? normalData.result : [];
    const tokenTxs = tokenData.status === "1" ? tokenData.result : [];
    
    console.log(`   ✅ Found ${normalTxs.length} normal transactions`);
    console.log(`   ✅ Found ${tokenTxs.length} token transactions`);
    
    return {
      normal: normalTxs,
      tokens: tokenTxs,
    };
  } catch (error) {
    console.log(`   ⚠️  Error fetching transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Display transaction history with details
 */
function displayTransactionHistory(history: { normal: any[]; tokens: any[] }, address: string, label: string) {
  if (history.tokens.length === 0 && history.normal.length === 0) {
    console.log(`   ℹ️  No transactions found for this address`);
    return;
  }
  
  // Show USDC transfers (both Native and Bridged)
  const usdcNativeTransfers = history.tokens.filter((tx: any) => 
    tx.contractAddress.toLowerCase() === POLYGON_USDC.toLowerCase() &&
    tx.to.toLowerCase() === address.toLowerCase()
  );
  
  const usdceTransfers = history.tokens.filter((tx: any) => 
    tx.contractAddress.toLowerCase() === POLYGON_USDCe.toLowerCase() &&
    tx.to.toLowerCase() === address.toLowerCase()
  );
  
  if (usdcNativeTransfers.length > 0) {
    console.log(`\n   💵 Native USDC Transfers (received): ${usdcNativeTransfers.length}`);
    usdcNativeTransfers.slice(0, 5).forEach((tx: any, index: number) => {
      const amount = ethers.utils.formatUnits(tx.value, tx.tokenDecimal);
      const timestamp = new Date(parseInt(tx.timeStamp) * 1000);
      
      console.log(`   ${index + 1}. ⬇️  RECEIVED: ${amount} Native USDC`);
      console.log(`      From: ${tx.from}`);
      console.log(`      To: ${tx.to}`);
      console.log(`      Hash: ${tx.hash}`);
      console.log(`      Time: ${timestamp.toISOString()}`);
      console.log(`      Block: ${tx.blockNumber}`);
      console.log(`      ✅ This is a direct deposit on Polygon!`);
    });
  }
  
  if (usdceTransfers.length > 0) {
    console.log(`\n   💵 USDC.e (Bridged) Transfers (received): ${usdceTransfers.length}`);
    usdceTransfers.slice(0, 5).forEach((tx: any, index: number) => {
      const amount = ethers.utils.formatUnits(tx.value, tx.tokenDecimal);
      const timestamp = new Date(parseInt(tx.timeStamp) * 1000);
      
      console.log(`   ${index + 1}. ⬇️  RECEIVED: ${amount} USDC.e`);
      console.log(`      From: ${tx.from}`);
      console.log(`      To: ${tx.to}`);
      console.log(`      Hash: ${tx.hash}`);
      console.log(`      Time: ${timestamp.toISOString()}`);
      console.log(`      Block: ${tx.blockNumber}`);
      console.log(`      ✅ This is from a bridge transaction!`);
    });
  }
  
  if (usdcNativeTransfers.length === 0 && usdceTransfers.length === 0) {
    console.log(`\n   ⚠️  No USDC or USDC.e deposits found`);
    console.log(`   💡 Check if you sent funds to the correct address`);
  }
}

/**
 * Find which user owns this proxy wallet
 */
async function findUserByProxyWallet(proxyWalletAddress: string) {
  try {
    const user = await prisma.user.findFirst({
      where: { proxyWallet: proxyWalletAddress.toLowerCase() },
    });
    return user;
  } catch (error) {
    console.error(`   Error querying database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Test creating deposit addresses with the proxy wallet
 */
async function testCreateDepositAddresses(userAddress: string) {
  try {
    console.log(`\n🧪 Testing deposit address creation for user: ${userAddress}`);
    const result = await createDepositAddresses(userAddress);
    
    console.log(`   ✅ Deposit addresses created successfully`);
    console.log(`   Address returned: ${typeof result.address === 'string' ? result.address : JSON.stringify(result.address)}`);
    console.log(`   Deposit addresses count: ${result.depositAddresses?.length || 0}`);
    
    if (result.depositAddresses && result.depositAddresses.length > 0) {
      console.log(`\n   📋 Deposit Addresses:`);
      result.depositAddresses.forEach((addr, index) => {
        console.log(`   ${index + 1}. Chain: ${addr.chainName} (${addr.chainId})`);
        console.log(`      Token: ${addr.tokenSymbol} (${addr.tokenAddress})`);
        console.log(`      Deposit Address: ${addr.depositAddress}`);
        
        // Check if this matches our known deposit address
        if (addr.depositAddress.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase()) {
          console.log(`      ✅ This matches the known deposit address!`);
        }
      });
    }
    
    return result;
  } catch (error) {
    console.error(`   ❌ Error creating deposit addresses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

/**
 * Explain how Polymarket Bridge deposit works
 */
function explainPolymarketBridge() {
  console.log("\n" + "=".repeat(80));
  console.log("📚 HOW POLYMARKET BRIDGE DEPOSIT WORKS");
  console.log("=".repeat(80));
  console.log(`
The Polymarket Bridge deposit system works as follows:

1. PROXY WALLET (Safe): ${PROXY_WALLET_ADDRESS}
   - This is your Gnosis Safe wallet deployed on Polygon
   - This is where funds will ultimately be credited AFTER bridging
   - DO NOT send funds directly to this address from other chains
   
2. DEPOSIT ADDRESS: ${DEPOSIT_EVM_ADDRESS}
   - This is generated by Polymarket Bridge API when you call /deposit/create-addresses
   - This address is on Ethereum mainnet (or the source chain)
   - Users send funds TO this address FROM other chains (Ethereum, etc.)
   - Polymarket Bridge automatically:
     a. Receives funds at this deposit address
     b. Bridges them from Ethereum → Polygon
     c. Credits USDC.e to your proxy wallet on Polygon
   
3. THE FLOW:
   User sends USDC on Ethereum → Deposit Address (${DEPOSIT_EVM_ADDRESS})
                                      ↓
                              Polymarket Bridge Service
                                      ↓
                    Bridges to Polygon & credits USDC.e
                                      ↓
                       Proxy Wallet (${PROXY_WALLET_ADDRESS})
   
4. COMMON MISTAKE:
   ❌ Sending funds directly to proxy wallet (${PROXY_WALLET_ADDRESS}) from Ethereum
      - These funds won't be bridged automatically
      - They may be stuck or lost
   
   ✅ Sending funds to deposit address (${DEPOSIT_EVM_ADDRESS}) from Ethereum
      - Polymarket Bridge handles the bridging automatically
      - Funds appear in proxy wallet after bridge completes

5. IMPORTANT:
   - The deposit address is unique per proxy wallet
   - You must use the deposit address returned by /deposit/create-addresses
   - Do NOT reuse deposit addresses across different proxy wallets
   - The deposit address is typically on Ethereum mainnet (chainId: 1)
   - The proxy wallet is on Polygon (chainId: 137)
  `);
}

/**
 * Main investigation function
 */
async function investigate() {
  console.log("🔍 INVESTIGATING POLYMARKET BRIDGE DEPOSIT ADDRESSES");
  console.log("=".repeat(80));
  
  // Connect to Polygon
  const rpcUrl = process.env.POLYGON_RPC_URL || config.blockchain.polygonRpcUrl;
  console.log(`🌐 Connecting to Polygon: ${rpcUrl}`);
  
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
  
  // Explain how it works
  explainPolymarketBridge();
  
  // Find user by proxy wallet
  console.log("\n" + "=".repeat(80));
  console.log("👤 FINDING USER BY PROXY WALLET");
  console.log("=".repeat(80));
  
  const user = await findUserByProxyWallet(PROXY_WALLET_ADDRESS);
  if (user) {
    console.log(`✅ Found user:`);
    console.log(`   User Address: ${user.address}`);
    console.log(`   Proxy Wallet: ${user.proxyWallet}`);
    console.log(`   User ID: ${user.id}`);
  } else {
    console.log(`❌ No user found with proxy wallet: ${PROXY_WALLET_ADDRESS}`);
  }
  
  // Check balances of proxy wallet
  console.log("\n" + "=".repeat(80));
  console.log("💰 CHECKING PROXY WALLET BALANCES");
  console.log("=".repeat(80));
  
  await checkBalances(provider, PROXY_WALLET_ADDRESS, "Proxy Wallet (Safe)");
  
  // Check if proxy wallet is a contract
  const isProxyContract = await checkIsContract(provider, PROXY_WALLET_ADDRESS);
  console.log(`\n   Is Contract: ${isProxyContract ? "✅ Yes (Safe wallet)" : "❌ No (EOA)"}`);
  
  // Check transaction history of proxy wallet
  console.log(`\n   📜 Transaction History:`);
  const proxyHistory = await getTransactionHistory(PROXY_WALLET_ADDRESS);
  if (proxyHistory) {
    displayTransactionHistory(proxyHistory, PROXY_WALLET_ADDRESS, "Proxy Wallet");
  }
  
  // Check deposit EVM address on Polygon
  console.log("\n" + "=".repeat(80));
  console.log("💳 CHECKING DEPOSIT EVM ADDRESS ON POLYGON");
  console.log("=".repeat(80));
  console.log(`\n📍 Checking: ${DEPOSIT_EVM_ADDRESS}`);
  console.log(`\n⚠️  IMPORTANT: The deposit EVM address from Polymarket Bridge API`);
  console.log(`   is typically on Ethereum mainnet, NOT Polygon.`);
  console.log(`   However, since you mentioned sending on Polygon, let's check both.`);
  
  // Try to check on Polygon anyway
  await checkBalances(provider, DEPOSIT_EVM_ADDRESS, "Deposit EVM Address (on Polygon)");
  
  const isDepositContract = await checkIsContract(provider, DEPOSIT_EVM_ADDRESS);
  console.log(`\n   Is Contract (on Polygon): ${isDepositContract ? "✅ Yes" : "❌ No"}`);
  
  // Check transaction history on Polygon
  console.log(`\n   📜 Transaction History (Polygon):`);
  const depositHistory = await getTransactionHistory(DEPOSIT_EVM_ADDRESS);
  if (depositHistory) {
    displayTransactionHistory(depositHistory, DEPOSIT_EVM_ADDRESS, "Deposit Address (Polygon)");
  }
  
  // Test creating deposit addresses if we found a user
  if (user) {
    console.log("\n" + "=".repeat(80));
    console.log("🧪 TESTING DEPOSIT ADDRESS CREATION");
    console.log("=".repeat(80));
    
    try {
      const depositResult = await testCreateDepositAddresses(user.address);
      
      // Check if the returned address matches
      const returnedAddress = typeof depositResult.address === 'string' 
        ? depositResult.address 
        : depositResult.address?.evm || null;
      
      if (returnedAddress) {
        console.log(`\n   🔍 Comparing addresses:`);
        console.log(`   Proxy Wallet: ${PROXY_WALLET_ADDRESS}`);
        console.log(`   Returned Address: ${returnedAddress}`);
        console.log(`   Known Deposit Address: ${DEPOSIT_EVM_ADDRESS}`);
        
        if (returnedAddress.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase()) {
          console.log(`   ✅ Returned address matches known deposit address!`);
        } else if (returnedAddress.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
          console.log(`   ⚠️  Returned address matches proxy wallet (unexpected - should be deposit address)`);
        } else {
          console.log(`   ⚠️  Returned address is different from both known addresses`);
        }
        
        // Check if deposit address is in the list
        const depositAddrInList = depositResult.depositAddresses?.find(
          addr => addr.depositAddress.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase()
        );
        
        if (depositAddrInList) {
          console.log(`   ✅ Known deposit address found in depositAddresses list:`);
          console.log(`      Chain: ${depositAddrInList.chainName} (${depositAddrInList.chainId})`);
          console.log(`      Token: ${depositAddrInList.tokenSymbol}`);
        } else {
          console.log(`   ⚠️  Known deposit address NOT found in depositAddresses list`);
        }
      }
    } catch (error) {
      console.error(`   ❌ Failed to test deposit address creation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Summary and recommendations
  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY & RECOMMENDATIONS");
  console.log("=".repeat(80));
  
  const hasProxyFunds = proxyHistory && (
    proxyHistory.tokens.filter((tx: any) => 
      (tx.contractAddress.toLowerCase() === POLYGON_USDC.toLowerCase() ||
       tx.contractAddress.toLowerCase() === POLYGON_USDCe.toLowerCase()) &&
      tx.to.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()
    ).length > 0
  );
  
  console.log(`
🔍 INVESTIGATION RESULTS:

1. Proxy Wallet (${PROXY_WALLET_ADDRESS}):
   - This is your Safe wallet on Polygon
   ${hasProxyFunds ? '✅ Found deposit transactions!' : '❌ No deposit transactions found'}
   - Check balances above to see current balance
   
2. Deposit Address (${DEPOSIT_EVM_ADDRESS}):
   - This address is typically on Ethereum mainnet (NOT Polygon)
   - However, you mentioned sending on Polygon
   - If you sent funds to this address on Polygon, they may not be processed correctly
   
3. ISSUE DIAGNOSIS - POLYGON DEPOSITS:
   
   ⚠️  CRITICAL UNDERSTANDING:
   
   The Polymarket Bridge deposit system works like this:
   
   a) User calls /deposit/create-addresses API
      → API returns deposit address (typically on Ethereum mainnet)
      
   b) User sends funds FROM Ethereum mainnet TO the deposit address
      → Funds are on Ethereum, not Polygon yet
      
   c) Polymarket Bridge detects the deposit
      → Automatically bridges funds from Ethereum → Polygon
      → Credits USDC.e to your proxy wallet on Polygon
   
   ❌ PROBLEM: If you sent funds directly on Polygon:
   - You bypassed the bridge entirely
   - Funds may be in the wrong address or lost
   - The deposit address on Ethereum won't see Polygon transactions
   
4. WHAT HAPPENED IN YOUR CASE:
   ${hasProxyFunds ? 
     '✅ Funds WERE received in proxy wallet (check transaction history above)' :
     '❌ Funds were NOT received in proxy wallet'}
   
   Possible scenarios:
   a) Sent to proxy wallet directly on Polygon → Should appear (check balance above)
   b) Sent to deposit address on Polygon → Wrong address (should be Ethereum)
   c) Sent to wrong address entirely → Funds lost or in different wallet
   
5. NEXT STEPS:
   a. ✅ Check proxy wallet balance above (already done)
   b. ✅ Check transaction history above (already done)
   c. Run: npm run check:ethereum-deposit (to check Ethereum mainnet)
   d. Verify which address you actually sent funds to
   e. If sent to deposit address on Polygon, that's the issue
   f. For future deposits: Send from Ethereum to deposit address
   
6. RECOMMENDED SOLUTION FOR YOUR USERS:
   
   ✅ CORRECT FLOW:
   1. User calls POST /api/deposit/create-addresses (authenticated)
   2. API returns deposit addresses for each chain
   3. User sends funds FROM Ethereum mainnet TO the deposit address
   4. Polymarket Bridge automatically handles the rest
   5. Funds appear in proxy wallet on Polygon as USDC.e
   
   ❌ WRONG FLOW (what you did):
   1. Get deposit address
   2. Send funds TO that address ON Polygon
   → This won't work because bridge expects Ethereum deposits
   
7. PROPOSED SERVICE IMPROVEMENT:
   See below for a complete deposit monitoring service...
  `);
  
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
  await investigate();
}


