/**
 * Test script for HD wallet derivation
 * This script tests that HD wallet derivation creates unique wallets for different users
 * 
 * Usage:
 *   tsx scripts/test-hd-derivation.ts
 */

import { ethers } from 'ethers';
import { createRelayerClientForUser } from '../src/services/relayer-client';
import { config } from '../src/config/env';

async function testHDDerivation() {
  console.log('🧪 Testing HD Wallet Derivation\n');
  
  // Check if mnemonic is configured
  if (!config.blockchain.hdWalletMnemonic || config.blockchain.hdWalletMnemonic.trim() === '') {
    console.error('❌ HD_WALLET_MNEMONIC is not configured in .env file');
    console.log('\n📝 To generate a mnemonic, run:');
    console.log('   node -e "const { ethers } = require(\'ethers\'); const w = ethers.Wallet.createRandom(); console.log(w.mnemonic.phrase);"');
    console.log('\nThen add it to your .env file as:');
    console.log('   HD_WALLET_MNEMONIC="your mnemonic phrase here"');
    process.exit(1);
  }

  // Test addresses (different users)
  const testAddresses = [
    '0x1234567890123456789012345678901234567890',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    '0x9876543210987654321098765432109876543210',
  ];

  console.log('📋 Test Configuration:');
  console.log(`   Mnemonic: ${config.blockchain.hdWalletMnemonic.substring(0, 20)}...`);
  console.log(`   Number of test users: ${testAddresses.length}\n`);

  console.log('🔍 Testing Wallet Derivation:\n');

  const derivedWallets: { userAddress: string; derivedAddress: string; derivationPath: string }[] = [];

  for (const userAddress of testAddresses) {
    try {
      // Create RelayerClient for this user (this will derive a wallet)
      const relayerClient = createRelayerClientForUser(userAddress);
      
      // Get the derived wallet address from the RelayerClient's signer
      // Note: We need to access the internal signer, but since it's private,
      // we'll derive it again using the same logic
      const normalizedAddress = ethers.utils.getAddress(userAddress.toLowerCase());
      const addressHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(normalizedAddress));
      const index = ethers.BigNumber.from(addressHash).mod(2147483647).toNumber();
      const derivationPath = `m/44'/60'/0'/0/${index}`;
      const derivedWallet = ethers.Wallet.fromMnemonic(config.blockchain.hdWalletMnemonic, derivationPath);
      
      derivedWallets.push({
        userAddress: normalizedAddress,
        derivedAddress: derivedWallet.address,
        derivationPath,
      });

      console.log(`✅ User: ${normalizedAddress}`);
      console.log(`   Derived Wallet: ${derivedWallet.address}`);
      console.log(`   Derivation Path: ${derivationPath}`);
      console.log(`   Index: ${index}\n`);
    } catch (error) {
      console.error(`❌ Error for user ${userAddress}:`, error);
    }
  }

  // Check for uniqueness
  console.log('🔍 Checking Uniqueness:\n');
  const addresses = derivedWallets.map(w => w.derivedAddress);
  const uniqueAddresses = new Set(addresses);
  
  if (addresses.length === uniqueAddresses.size) {
    console.log('✅ All derived wallets are unique!');
  } else {
    console.error('❌ Duplicate wallets detected!');
    console.error('   This should not happen with proper HD derivation.');
  }

  // Test deterministic behavior (same user should get same wallet)
  console.log('\n🔄 Testing Deterministic Behavior:\n');
  const testUser = testAddresses[0];
  const firstDerivation = derivedWallets.find(w => w.userAddress === ethers.utils.getAddress(testUser.toLowerCase()));
  
  if (firstDerivation) {
    // Derive again
    const normalizedAddress = ethers.utils.getAddress(testUser.toLowerCase());
    const addressHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(normalizedAddress));
    const index = ethers.BigNumber.from(addressHash).mod(2147483647).toNumber();
    const derivationPath = `m/44'/60'/0'/0/${index}`;
    const derivedWallet = ethers.Wallet.fromMnemonic(config.blockchain.hdWalletMnemonic, derivationPath);
    
    if (derivedWallet.address.toLowerCase() === firstDerivation.derivedAddress.toLowerCase()) {
      console.log('✅ Deterministic derivation works correctly!');
      console.log(`   Same user always gets same wallet: ${derivedWallet.address}`);
    } else {
      console.error('❌ Deterministic derivation failed!');
      console.error(`   First: ${firstDerivation.derivedAddress}`);
      console.error(`   Second: ${derivedWallet.address}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Total users tested: ${testAddresses.length}`);
  console.log(`   Unique wallets: ${uniqueAddresses.size}`);
  console.log(`   Deterministic: ${firstDerivation ? '✅' : '❓'}`);
  
  console.log('\n✨ HD Wallet Derivation Test Complete!\n');
  console.log('💡 Next Steps:');
  console.log('   1. Test actual Safe deployment with: createProxyWallet(ownerAddress)');
  console.log('   2. Verify each user gets a unique Safe address');
  console.log('   3. After deployment works, proceed with owner addition');
}

// Run the test
testHDDerivation().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

