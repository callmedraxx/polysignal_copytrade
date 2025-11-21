import { ethers } from 'ethers';
import { config } from '../src/config/env';

const DEPOSIT_ADDRESS = '0xBDBEB089Ae247958B3535BaB90ec144bBB855D19';
const PROXY_WALLET = '0x9dfc674b9788c13a1b55b1ef96d07304798f9a05';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

async function checkDepositTransaction() {
  console.log('🔍 Finding the deposit transaction...\n');
  
  const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  
  // Get current block
  const currentBlock = await provider.getBlockNumber();
  console.log(`Current block: ${currentBlock}\n`);
  
  // Search for Transfer events TO the deposit address
  // Use smaller block ranges to avoid RPC limits
  const blockRange = 1000; // Search 1000 blocks at a time
  let found = false;
  
  // Search backwards from current block
  for (let startBlock = currentBlock; startBlock > 0 && !found; startBlock -= blockRange) {
    const endBlock = Math.min(startBlock, currentBlock);
    const fromBlock = Math.max(0, startBlock - blockRange);
    
    try {
      console.log(`Searching blocks ${fromBlock} to ${endBlock}...`);
      
      const filter = usdcContract.filters.Transfer(null, DEPOSIT_ADDRESS);
      const events = await usdcContract.queryFilter(filter, fromBlock, endBlock);
      
      if (events.length > 0) {
        console.log(`\n✅ Found ${events.length} deposit transaction(s)!\n`);
        
        for (const event of events) {
          const from = event.args?.from;
          const value = event.args?.value;
          const valueFormatted = ethers.utils.formatUnits(value, USDC_DECIMALS);
          const blockNumber = event.blockNumber;
          const txHash = event.transactionHash;
          
          console.log('📋 Transaction Details:');
          console.log(`   Hash: ${txHash}`);
          console.log(`   From: ${from}`);
          console.log(`   To: ${DEPOSIT_ADDRESS} (deposit address)`);
          console.log(`   Amount: ${valueFormatted} USDC`);
          console.log(`   Block: ${blockNumber}`);
          
          // Get full transaction details
          try {
            const tx = await provider.getTransaction(txHash);
            const receipt = await provider.getTransactionReceipt(txHash);
            
            console.log(`   Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
            console.log(`   Confirmations: ${currentBlock - receipt.blockNumber}`);
            
            // Check if this matches the 2 USDC deposit
            if (valueFormatted === '2.0' || valueFormatted.startsWith('2.')) {
              console.log(`   ✅ This matches your 2 USDC deposit!`);
              
              // Check block timestamp
              const block = await provider.getBlock(blockNumber);
              const timestamp = new Date(block.timestamp * 1000);
              console.log(`   Time: ${timestamp.toISOString()}`);
              console.log(`   Age: ${Math.floor((Date.now() - timestamp.getTime()) / 1000 / 60)} minutes ago`);
            }
          } catch (err) {
            console.log(`   ⚠️  Could not fetch full transaction details: ${err}`);
          }
          
          console.log();
        }
        
        found = true;
      }
    } catch (error: any) {
      if (error.message?.includes('Block range is too large')) {
        // Try smaller range
        console.log(`   ⚠️  Block range too large, trying smaller chunks...`);
        continue;
      }
      console.error(`   ❌ Error searching blocks ${fromBlock}-${endBlock}:`, error.message);
    }
  }
  
  if (!found) {
    console.log('❌ No deposit transactions found in recent blocks');
    console.log('   The deposit might be older, or the transaction might not have been indexed yet.');
  }
  
  // Also check Polymarket Bridge API for deposit status
  console.log('\n🔍 Checking Polymarket Bridge API...');
  try {
    const bridgeApiUrl = 'https://bridge.polymarket.com';
    
    // Try to query deposit status (if API supports it)
    // Note: This might not be available, but worth trying
    console.log('   Note: Polymarket Bridge API may not have a public deposit status endpoint.');
    console.log('   The deposit address should automatically process deposits.');
    console.log('   If funds are stuck, contact Polymarket support.');
  } catch (error) {
    console.error('   ❌ Error checking Bridge API:', error);
  }
}

checkDepositTransaction()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

