import { ethers } from 'ethers';
import { config } from '../src/config/env';

// Addresses from user's issue
const DEPOSIT_ADDRESS = '0xBDBEB089Ae247958B3535BaB90ec144bBB855D19';
const PROXY_WALLET = '0x9dfc674b9788c13a1b55b1ef96d07304798f9a05';
const CHAIN_ID = 137; // Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // Native USDC on Polygon
const USDC_DECIMALS = 6;

// USDC ABI (minimal)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

async function verifyDeposit() {
  console.log('🔍 Verifying deposit on-chain...\n');
  
  const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  
  console.log(`📡 Connected to Polygon RPC: ${rpcUrl}`);
  console.log(`📍 Deposit Address: ${DEPOSIT_ADDRESS}`);
  console.log(`📍 Proxy Wallet: ${PROXY_WALLET}\n`);
  
  // 1. Check deposit address USDC balance
  console.log('1️⃣ Checking deposit address USDC balance...');
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  
  try {
    const depositBalance = await usdcContract.balanceOf(DEPOSIT_ADDRESS);
    const depositBalanceFormatted = ethers.utils.formatUnits(depositBalance, USDC_DECIMALS);
    console.log(`   Balance: ${depositBalanceFormatted} USDC`);
    console.log(`   Raw balance: ${depositBalance.toString()}\n`);
    
    if (depositBalance.gt(0)) {
      console.log('   ✅ Deposit address has USDC balance');
    } else {
      console.log('   ❌ Deposit address has NO USDC balance');
    }
  } catch (error) {
    console.error('   ❌ Error checking deposit address balance:', error);
  }
  
  // 2. Check proxy wallet USDC balance
  console.log('2️⃣ Checking proxy wallet USDC balance...');
  try {
    const proxyBalance = await usdcContract.balanceOf(PROXY_WALLET);
    const proxyBalanceFormatted = ethers.utils.formatUnits(proxyBalance, USDC_DECIMALS);
    console.log(`   Balance: ${proxyBalanceFormatted} USDC`);
    console.log(`   Raw balance: ${proxyBalance.toString()}\n`);
    
    if (proxyBalance.gt(0)) {
      console.log('   ✅ Proxy wallet has USDC balance');
    } else {
      console.log('   ❌ Proxy wallet has NO USDC balance');
    }
  } catch (error) {
    console.error('   ❌ Error checking proxy wallet balance:', error);
  }
  
  // 3. Check if deposit address is a contract
  console.log('3️⃣ Checking if deposit address is a contract...');
  try {
    const depositCode = await provider.getCode(DEPOSIT_ADDRESS);
    if (depositCode && depositCode !== '0x') {
      console.log('   ✅ Deposit address IS a contract');
      console.log(`   Code length: ${depositCode.length} bytes`);
    } else {
      console.log('   ℹ️  Deposit address is an EOA (Externally Owned Account)');
    }
  } catch (error) {
    console.error('   ❌ Error checking deposit address code:', error);
  }
  console.log();
  
  // 4. Check recent Transfer events from deposit address
  console.log('4️⃣ Checking recent Transfer events from deposit address...');
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10k blocks (~1 day)
    
    const filter = usdcContract.filters.Transfer(DEPOSIT_ADDRESS, null);
    const events = await usdcContract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`   Searched blocks ${fromBlock} to ${currentBlock}`);
    console.log(`   Found ${events.length} Transfer event(s) from deposit address\n`);
    
    if (events.length > 0) {
      console.log('   Recent transfers FROM deposit address:');
      for (const event of events.slice(0, 10)) { // Show last 10
        const to = event.args?.to;
        const value = event.args?.value;
        const valueFormatted = ethers.utils.formatUnits(value, USDC_DECIMALS);
        const blockNumber = event.blockNumber;
        const txHash = event.transactionHash;
        
        console.log(`   - To: ${to}`);
        console.log(`     Amount: ${valueFormatted} USDC`);
        console.log(`     Block: ${blockNumber}`);
        console.log(`     TX: ${txHash}`);
        
        if (to?.toLowerCase() === PROXY_WALLET.toLowerCase()) {
          console.log(`     ✅ This transfer went to the proxy wallet!`);
        }
        console.log();
      }
    } else {
      console.log('   ⚠️  No transfers found from deposit address');
    }
  } catch (error) {
    console.error('   ❌ Error checking Transfer events:', error);
  }
  
  // 5. Check recent Transfer events TO proxy wallet
  console.log('5️⃣ Checking recent Transfer events TO proxy wallet...');
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000);
    
    const filter = usdcContract.filters.Transfer(null, PROXY_WALLET);
    const events = await usdcContract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`   Found ${events.length} Transfer event(s) to proxy wallet\n`);
    
    if (events.length > 0) {
      console.log('   Recent transfers TO proxy wallet:');
      for (const event of events.slice(0, 10)) {
        const from = event.args?.from;
        const value = event.args?.value;
        const valueFormatted = ethers.utils.formatUnits(value, USDC_DECIMALS);
        const blockNumber = event.blockNumber;
        const txHash = event.transactionHash;
        
        console.log(`   - From: ${from}`);
        console.log(`     Amount: ${valueFormatted} USDC`);
        console.log(`     Block: ${blockNumber}`);
        console.log(`     TX: ${txHash}`);
        
        if (from?.toLowerCase() === DEPOSIT_ADDRESS.toLowerCase()) {
          console.log(`     ✅ This transfer came from the deposit address!`);
        }
        console.log();
      }
    } else {
      console.log('   ⚠️  No transfers found to proxy wallet');
    }
  } catch (error) {
    console.error('   ❌ Error checking Transfer events:', error);
  }
  
  // 6. Check deposit address transaction history
  console.log('6️⃣ Checking deposit address transaction history...');
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000);
    
    // Get all blocks in range and check transactions
    console.log(`   Searching blocks ${fromBlock} to ${currentBlock}...`);
    
    // Check recent transactions (last 100 blocks for speed)
    const recentBlocks = Math.min(100, currentBlock - fromBlock);
    let txCount = 0;
    
    for (let i = 0; i < recentBlocks; i++) {
      const blockNum = currentBlock - i;
      try {
        const block = await provider.getBlockWithTransactions(blockNum);
        for (const tx of block.transactions) {
          if (tx.from?.toLowerCase() === DEPOSIT_ADDRESS.toLowerCase() || 
              tx.to?.toLowerCase() === DEPOSIT_ADDRESS.toLowerCase()) {
            txCount++;
            if (txCount <= 5) { // Show first 5
              console.log(`   TX ${txCount}:`);
              console.log(`     Hash: ${tx.hash}`);
              console.log(`     From: ${tx.from}`);
              console.log(`     To: ${tx.to}`);
              console.log(`     Value: ${ethers.utils.formatEther(tx.value)} MATIC`);
              console.log(`     Block: ${blockNum}`);
              console.log();
            }
          }
        }
      } catch (err) {
        // Skip if block not available
      }
    }
    
    console.log(`   Found ${txCount} transaction(s) involving deposit address`);
  } catch (error) {
    console.error('   ❌ Error checking transaction history:', error);
  }
  
  // 7. Check if deposit address has any MATIC (for gas)
  console.log('7️⃣ Checking deposit address MATIC balance...');
  try {
    const maticBalance = await provider.getBalance(DEPOSIT_ADDRESS);
    const maticBalanceFormatted = ethers.utils.formatEther(maticBalance);
    console.log(`   Balance: ${maticBalanceFormatted} MATIC\n`);
    
    if (maticBalance.eq(0)) {
      console.log('   ⚠️  Deposit address has no MATIC - cannot execute transfers');
    }
  } catch (error) {
    console.error('   ❌ Error checking MATIC balance:', error);
  }
  
  // 8. Summary and recommendations
  console.log('\n📊 SUMMARY:');
  console.log('='.repeat(60));
  console.log(`Deposit Address: ${DEPOSIT_ADDRESS}`);
  console.log(`Proxy Wallet: ${PROXY_WALLET}`);
  console.log('\n💡 Analysis:');
  console.log('The Polymarket Bridge deposit address is a special address that');
  console.log('should automatically bridge and transfer funds to your proxy wallet.');
  console.log('If funds are stuck, they may need to be manually processed by');
  console.log('Polymarket\'s bridge service, or there may be a delay in processing.');
  console.log('='.repeat(60));
}

// Run verification
verifyDeposit()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });

