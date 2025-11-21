import { ethers } from "ethers";

// Deposit address on Ethereum to check
const DEPOSIT_EVM_ADDRESS = "0x7Ae9DBCc134865BEf3b66be0C8f5e7929344e56a";

// USDC contract address on Ethereum
const ETHEREUM_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// Etherscan API
const ETHERSCAN_API_URL = process.env.ETHERSCAN_API_URL || "https://api.etherscan.com/api";

/**
 * Check balances on Ethereum mainnet
 */
async function checkEthereumBalances(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
  label: string
) {
  console.log(`\n💰 Checking Ethereum balances for ${label}`);
  console.log(`   Address: ${address}`);
  
  try {
    // Check native ETH balance
    const ethBalance = await provider.getBalance(address);
    console.log(`   ETH: ${ethers.utils.formatEther(ethBalance)} ETH`);
    
    // Check USDC balance
    try {
      const usdcContract = new ethers.Contract(ETHEREUM_USDC, ERC20_ABI, provider);
      const usdcBalance = await usdcContract.balanceOf(address);
      const usdcDecimals = await usdcContract.decimals();
      const usdcSymbol = await usdcContract.symbol();
      const formattedUsdc = ethers.utils.formatUnits(usdcBalance, usdcDecimals);
      console.log(`   ${usdcSymbol}: ${formattedUsdc} (${usdcBalance.toString()} raw)`);
      
      if (usdcBalance.gt(0)) {
        console.log(`   ✅ Has USDC balance!`);
      } else {
        console.log(`   ❌ No USDC balance`);
      }
    } catch (error) {
      console.log(`   USDC: Error checking - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`   ❌ Error checking balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get transaction history from Etherscan
 */
async function getEthereumTransactionHistory(address: string) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  
  if (!apiKey) {
    console.log(`\n⚠️  ETHERSCAN_API_KEY not set`);
    console.log(`   Cannot fetch transaction history from Etherscan API`);
    console.log(`   Set ETHERSCAN_API_KEY in your .env file to enable this feature`);
    return null;
  }
  
  try {
    console.log(`\n📜 Fetching transaction history from Etherscan...`);
    
    // Get normal transactions
    const normalUrl = `${ETHERSCAN_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const normalResponse = await fetch(normalUrl);
    const normalData = await normalResponse.json();
    
    if (normalData.status !== "1") {
      console.log(`   ⚠️  Error fetching normal transactions: ${normalData.message || 'Unknown error'}`);
    }
    
    // Get token transfers
    const tokenUrl = `${ETHERSCAN_API_URL}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
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
    console.log(`   ❌ Error fetching transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

/**
 * Display transaction history
 */
function displayTransactionHistory(history: { normal: any[]; tokens: any[] }) {
  if (history.tokens.length === 0 && history.normal.length === 0) {
    console.log(`   ℹ️  No transactions found for this address`);
    return;
  }
  
  // Show USDC transfers
  const usdcTransfers = history.tokens.filter((tx: any) => 
    tx.contractAddress.toLowerCase() === ETHEREUM_USDC.toLowerCase()
  );
  
  if (usdcTransfers.length > 0) {
    console.log(`\n   💵 USDC Transfers (${usdcTransfers.length}):`);
    usdcTransfers.slice(0, 10).forEach((tx: any, index: number) => {
      const amount = ethers.utils.formatUnits(tx.value, tx.tokenDecimal);
      const timestamp = new Date(parseInt(tx.timeStamp) * 1000);
      const isIncoming = tx.to.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase();
      
      console.log(`   ${index + 1}. ${isIncoming ? '⬇️  RECEIVED' : '⬆️  SENT'}: ${amount} USDC`);
      console.log(`      From: ${tx.from}`);
      console.log(`      To: ${tx.to}`);
      console.log(`      Hash: ${tx.hash}`);
      console.log(`      Time: ${timestamp.toISOString()}`);
      console.log(`      Block: ${tx.blockNumber}`);
      if (isIncoming) {
        console.log(`      ✅ This is an incoming deposit!`);
      }
    });
  } else {
    console.log(`\n   ⚠️  No USDC transfers found`);
  }
  
  // Show ETH transfers
  const ethTransfers = history.normal.filter((tx: any) => {
    const isIncoming = tx.to.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase();
    const isOutgoing = tx.from.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase();
    return isIncoming || isOutgoing;
  });
  
  if (ethTransfers.length > 0) {
    console.log(`\n   ⛽ ETH Transfers (${ethTransfers.length}):`);
    ethTransfers.slice(0, 5).forEach((tx: any, index: number) => {
      const amount = ethers.utils.formatEther(tx.value);
      const timestamp = new Date(parseInt(tx.timeStamp) * 1000);
      const isIncoming = tx.to.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase();
      
      console.log(`   ${index + 1}. ${isIncoming ? '⬇️  RECEIVED' : '⬆️  SENT'}: ${amount} ETH`);
      console.log(`      From: ${tx.from}`);
      console.log(`      To: ${tx.to}`);
      console.log(`      Hash: ${tx.hash}`);
      console.log(`      Time: ${timestamp.toISOString()}`);
      console.log(`      Block: ${tx.blockNumber}`);
    });
  }
}

/**
 * Check if address is a contract on Ethereum
 */
async function checkIsContract(
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<boolean> {
  try {
    const code = await provider.getCode(address);
    return code !== "0x" && code !== "0x0";
  } catch (error) {
    console.error(`   Error checking if contract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Main investigation function
 */
async function investigate() {
  console.log("🔍 CHECKING ETHEREUM MAINNET DEPOSIT ADDRESS");
  console.log("=".repeat(80));
  console.log(`\n📍 Deposit Address: ${DEPOSIT_EVM_ADDRESS}`);
  console.log(`\nℹ️  This address is on Ethereum mainnet (not Polygon)`);
  console.log(`   Funds sent to this address from Ethereum will be bridged by Polymarket`);
  
  // Connect to Ethereum mainnet
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || "https://eth.llamarpc.com";
  console.log(`\n🌐 Connecting to Ethereum mainnet: ${ethereumRpcUrl}`);
  
  const provider = new ethers.providers.JsonRpcProvider(ethereumRpcUrl);
  
  // Check network
  try {
    const network = await provider.getNetwork();
    console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);
    if (network.chainId !== 1) {
      console.warn(`⚠️  Warning: Expected Ethereum mainnet (1), but got chain ID ${network.chainId}`);
    }
  } catch (error) {
    console.warn(`⚠️  Could not get network info: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Check balances
  console.log("\n" + "=".repeat(80));
  console.log("💰 CHECKING BALANCES");
  console.log("=".repeat(80));
  
  await checkEthereumBalances(provider, DEPOSIT_EVM_ADDRESS, "Deposit Address");
  
  // Check if it's a contract
  console.log("\n" + "=".repeat(80));
  console.log("📋 ADDRESS INFORMATION");
  console.log("=".repeat(80));
  
  const isContract = await checkIsContract(provider, DEPOSIT_EVM_ADDRESS);
  console.log(`\n   Is Contract: ${isContract ? "✅ Yes" : "❌ No (EOA)"}`);
  
  if (isContract) {
    console.log(`   ℹ️  This is a contract address (likely Polymarket Bridge contract)`);
  } else {
    console.log(`   ℹ️  This is an EOA (Externally Owned Account) address`);
  }
  
  // Get transaction history
  console.log("\n" + "=".repeat(80));
  console.log("📜 TRANSACTION HISTORY");
  console.log("=".repeat(80));
  
  const history = await getEthereumTransactionHistory(DEPOSIT_EVM_ADDRESS);
  
  if (history) {
    displayTransactionHistory(history);
  }
  
  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("📊 SUMMARY");
  console.log("=".repeat(80));
  console.log(`
🔍 INVESTIGATION RESULTS:

1. Deposit Address: ${DEPOSIT_EVM_ADDRESS}
   - This address is on Ethereum mainnet
   - This is where users should send funds FROM Ethereum
   - Polymarket Bridge will automatically bridge funds to Polygon

2. Findings:
   ${history && history.tokens.filter((tx: any) => 
     tx.contractAddress.toLowerCase() === ETHEREUM_USDC.toLowerCase() &&
     tx.to.toLowerCase() === DEPOSIT_EVM_ADDRESS.toLowerCase()
   ).length > 0 ? '✅ Found incoming USDC deposits!' : '❌ No incoming USDC deposits found'}
   
   ${history && history.normal.length > 0 ? '✅ Address has transaction history' : '⚠️  No transaction history found'}

3. Next Steps:
   a. If deposits were found, check Polymarket Bridge status
   b. Wait for bridge to complete (can take several minutes)
   c. Check Polygon proxy wallet balance after bridge completes
   d. If no deposits found, verify you're sending to the correct address
   e. Ensure funds are sent FROM Ethereum TO this deposit address

4. Common Issues:
   ❌ Sending from Polygon to this address (wrong - this is Ethereum address)
   ❌ Sending to proxy wallet directly (wrong - use deposit address)
   ✅ Sending from Ethereum to this deposit address (correct!)
  `);
}

// Main execution
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function main() {
  await investigate();
}


