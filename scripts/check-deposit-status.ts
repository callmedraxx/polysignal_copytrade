#!/usr/bin/env tsx
/**
 * Script to check deposit status and monitor when funds are transferred
 * from deposit address to proxy wallet
 * 
 * Usage: tsx scripts/check-deposit-status.ts
 */

import { ethers } from 'ethers';
import { config } from '../src/config/env';

const DEPOSIT_ADDRESS = '0xBDBEB089Ae247958B3535BaB90ec144bBB855D19';
const PROXY_WALLET = '0x9dfc674b9788c13a1b55b1ef96d07304798f9a05';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const TRANSACTION_HASH = '0x8b584608d04dc5659018cb8c33d7f80782cdf201bf874e3a19d93fc4c94b124f';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

async function checkDepositStatus() {
  console.log('🔍 Checking Deposit Status...\n');
  console.log('Transaction Hash:', TRANSACTION_HASH);
  console.log('Deposit Address:', DEPOSIT_ADDRESS);
  console.log('Proxy Wallet:', PROXY_WALLET);
  console.log('');

  const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  try {
    // Check balances
    const [depositBalance, proxyBalance] = await Promise.all([
      usdc.balanceOf(DEPOSIT_ADDRESS),
      usdc.balanceOf(PROXY_WALLET),
    ]);

    const depositBalanceFormatted = ethers.utils.formatUnits(depositBalance, 6);
    const proxyBalanceFormatted = ethers.utils.formatUnits(proxyBalance, 6);

    console.log('📊 Current Balances:');
    console.log(`   Deposit Address: ${depositBalanceFormatted} USDC`);
    console.log(`   Proxy Wallet: ${proxyBalanceFormatted} USDC`);
    console.log('');

    // Check transaction details
    const tx = await provider.getTransaction(TRANSACTION_HASH);
    const receipt = await provider.getTransactionReceipt(TRANSACTION_HASH);

    if (tx && receipt) {
      console.log('📝 Transaction Details:');
      console.log(`   Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   From: ${tx.from}`);
      console.log(`   To: ${tx.to}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);
      console.log('');

      // Check if funds have been transferred
      if (depositBalance.gt(0)) {
        console.log('⚠️  ISSUE DETECTED:');
        console.log(`   Funds (${depositBalanceFormatted} USDC) are still in the deposit address.`);
        console.log('   They have not been transferred to the proxy wallet yet.');
        console.log('');
        console.log('💡 This indicates Polymarket Bridge has not processed the deposit yet.');
        console.log('   The deposit address is correctly linked to your proxy wallet,');
        console.log('   but Polymarket\'s backend needs to process the transfer.');
        console.log('');
        console.log('📞 Recommended Actions:');
        console.log('   1. Contact Polymarket support with the transaction hash');
        console.log('   2. Wait a bit longer (processing can take time)');
        console.log('   3. Check Polymarket Bridge status page');
      } else {
        console.log('✅ Funds have been transferred from deposit address!');
        console.log(`   Proxy wallet now has ${proxyBalanceFormatted} USDC`);
      }
    }

    // Check for recent transfers from deposit address
    console.log('\n🔎 Checking for transfers from deposit address...');
    const currentBlock = await provider.getBlockNumber();
    const TransferEvent = ethers.utils.id('Transfer(address,address,uint256)');
    
    // Check last 1000 blocks for transfers
    const fromBlock = Math.max(0, currentBlock - 1000);
    const filter = {
      address: USDC_ADDRESS,
      topics: [
        TransferEvent,
        ethers.utils.hexZeroPad(DEPOSIT_ADDRESS, 32), // from address
      ],
      fromBlock,
      toBlock: 'latest',
    };

    try {
      const logs = await provider.getLogs(filter);
      if (logs.length > 0) {
        console.log(`   Found ${logs.length} transfer(s) from deposit address:`);
        logs.forEach((log, index) => {
          const toAddress = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
          console.log(`   ${index + 1}. To: ${toAddress}`);
        });
      } else {
        console.log('   No transfers found from deposit address in recent blocks.');
      }
    } catch (error) {
      console.log('   Could not check transfer history (this is okay)');
    }

  } catch (error) {
    console.error('❌ Error checking deposit status:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
    }
  }
}

// Run the check
checkDepositStatus()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });


