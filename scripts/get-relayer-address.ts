/**
 * Helper script to get relayer address from private key
 * 
 * Usage:
 *   npx tsx scripts/get-relayer-address.ts [PRIVATE_KEY]
 *   OR
 *   RELAYER_PRIVATE_KEY=0x... npx tsx scripts/get-relayer-address.ts
 */

import { ethers } from 'ethers';
import { config } from '../src/config/env';

async function main() {
  // Get private key from command line arg or env var
  const privateKey = process.argv[2] || config.safe.relayerPrivateKey || process.env.SAFE_RELAYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error('❌ Error: No private key provided');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/get-relayer-address.ts [PRIVATE_KEY]');
    console.log('  OR');
    console.log('  SAFE_RELAYER_PRIVATE_KEY=0x... npx tsx scripts/get-relayer-address.ts');
    console.log('\nOr set SAFE_RELAYER_PRIVATE_KEY in your .env file');
    process.exit(1);
  }

  try {
    // Validate private key format
    const keyWithoutPrefix = privateKey.startsWith('0x') 
      ? privateKey.slice(2) 
      : privateKey;
    
    if (!/^[0-9a-fA-F]{64}$/.test(keyWithoutPrefix)) {
      throw new Error('Invalid private key format. Must be 64 hex characters.');
    }

    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey);
    
    console.log('\n✅ Relayer Wallet Information:');
    console.log('=' .repeat(60));
    console.log(`Address: ${wallet.address}`);
    console.log(`Private Key: ${privateKey.substring(0, 10)}...${privateKey.substring(privateKey.length - 8)}`);
    console.log('=' .repeat(60));
    
    console.log('\n📝 Add to your .env file:');
    console.log(`SAFE_RELAYER_ADDRESS=${wallet.address}`);
    console.log(`SAFE_RELAYER_PRIVATE_KEY=${privateKey}`);
    
    // Check balance on Polygon
    console.log('\n💰 Checking balance on Polygon...');
    const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    try {
      const balance = await provider.getBalance(wallet.address);
      const balanceFormatted = ethers.utils.formatEther(balance);
      
      console.log(`Balance: ${balanceFormatted} POL`);
      
      if (balance.isZero()) {
        console.log('\n⚠️  Warning: Relayer wallet has no POL!');
        console.log('   You need to fund this wallet with POL for gas fees.');
        console.log('   Send POL to:', wallet.address);
      } else {
        console.log('✅ Relayer wallet has POL for gas fees');
      }
    } catch (error) {
      console.log('⚠️  Could not check balance (network issue)');
    }
    
    console.log('\n' + '=' .repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);

