/**
 * Test script to verify Safe deployment via Polymarket relayer
 * 
 * This script:
 * 1. Generates a new test mnemonic
 * 2. Uses it to derive a test wallet
 * 3. Deploys a Safe via Polymarket relayer
 * 4. Verifies the deployment on-chain
 * 
 * Usage:
 *   tsx scripts/test-safe-deployment.ts
 */

import { ethers } from 'ethers';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { builderConfig } from '../src/services/builder-config';
import { config } from '../src/config/env';
import Safe from '@safe-global/protocol-kit';

const POLYGON_CHAIN_ID = 137;
const relayerUrl = process.env.POLYMARKET_RELAYER_URL || config.polymarket.relayerUrl;

// Safe contract ABI for verification
const SAFE_ABI = [
  "function getOwners() view returns (address[] memory)",
  "function getThreshold() view returns (uint256)",
  "function isOwner(address owner) view returns (bool)",
];

async function testSafeDeployment() {
  console.log('🧪 Testing Safe Deployment via Polymarket Relayer\n');
  console.log('='.repeat(60));
  
  // Step 1: Generate a new test mnemonic
  console.log('\n📝 Step 1: Generating new test mnemonic...');
  const testWallet = ethers.Wallet.createRandom();
  const testMnemonic = testWallet.mnemonic?.phrase;
  
  if (!testMnemonic) {
    throw new Error('Failed to generate mnemonic');
  }
  
  console.log(`✅ Generated test mnemonic:`);
  console.log(`   ${testMnemonic}`);
  console.log(`\n📋 Test Wallet Details:`);
  console.log(`   Address: ${testWallet.address}`);
  console.log(`   Private Key: ${testWallet.privateKey.substring(0, 20)}...`);
  
  // Step 2: Derive a wallet from the mnemonic (simulating user derivation)
  console.log('\n🔑 Step 2: Deriving wallet from mnemonic...');
  const derivationPath = "m/44'/60'/0'/0/0"; // Use first index for testing
  const derivedWallet = ethers.Wallet.fromMnemonic(testMnemonic, derivationPath);
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.POLYGON_RPC_URL || config.blockchain.polygonRpcUrl
  );
  const connectedWallet = derivedWallet.connect(provider);
  
  console.log(`✅ Derived wallet:`);
  console.log(`   Address: ${connectedWallet.address}`);
  console.log(`   Derivation Path: ${derivationPath}`);
  
  // Step 3: Calculate expected Safe address
  console.log('\n📍 Step 3: Calculating expected Safe address...');
  let expectedSafeAddress: string;
  try {
    const safeAccountConfig = {
      owners: [connectedWallet.address],
      threshold: 1,
    };
    
    const protocolKit = await Safe.init({
      provider: process.env.POLYGON_RPC_URL || config.blockchain.polygonRpcUrl,
      signer: connectedWallet.privateKey,
      predictedSafe: {
        safeAccountConfig,
      },
    });
    
    expectedSafeAddress = await protocolKit.getAddress();
    console.log(`✅ Expected Safe address: ${expectedSafeAddress}`);
  } catch (error) {
    console.error(`❌ Failed to calculate expected Safe address:`, error);
    throw error;
  }
  
  // Step 4: Check if Safe is already deployed (shouldn't be for a new mnemonic)
  console.log('\n🔍 Step 4: Checking if Safe is already deployed...');
  const code = await provider.getCode(expectedSafeAddress);
  if (code !== '0x' && code !== '0x0') {
    console.log(`⚠️  Safe already exists at ${expectedSafeAddress}!`);
    console.log(`   This is unexpected for a new test mnemonic.`);
    console.log(`   Checking owners...`);
    
    const safeContract = new ethers.Contract(expectedSafeAddress, SAFE_ABI, provider);
    const owners = await safeContract.getOwners();
    const threshold = await safeContract.getThreshold();
    
    console.log(`   Owners: ${owners.length}`);
    console.log(`   Threshold: ${threshold.toString()}`);
    owners.forEach((owner: string, index: number) => {
      console.log(`     ${index + 1}. ${owner}`);
    });
    
    return;
  } else {
    console.log(`✅ Safe is not deployed yet (expected for new test)`);
  }
  
  // Step 5: Create RelayerClient with the derived wallet
  console.log('\n🚀 Step 5: Creating RelayerClient with derived wallet...');
  const relayerClient = new RelayClient(
    relayerUrl,
    POLYGON_CHAIN_ID,
    connectedWallet,
    builderConfig
  );
  console.log(`✅ RelayerClient created`);
  console.log(`   Relayer URL: ${relayerUrl}`);
  console.log(`   Chain ID: ${POLYGON_CHAIN_ID}`);
  
  // Step 6: Deploy Safe via relayer
  console.log('\n📦 Step 6: Deploying Safe via Polymarket relayer...');
  let deploymentResult: any;
  try {
    const response = await relayerClient.deploy();
    console.log(`   Deployment response received, waiting for confirmation...`);
    
    deploymentResult = await response.wait();
    console.log(`   Deployment result:`, JSON.stringify(deploymentResult, null, 2));
    
    if (!deploymentResult) {
      throw new Error('Deployment failed - no result returned from relayer');
    }
    
    const deployedSafeAddress = deploymentResult.proxyAddress;
    const transactionHash = deploymentResult.transactionHash;
    
    if (!deployedSafeAddress) {
      throw new Error(`Deployment completed but no Safe address returned. Transaction: ${transactionHash}`);
    }
    
    console.log(`✅ Safe deployment initiated!`);
    console.log(`   Safe Address: ${deployedSafeAddress}`);
    console.log(`   Transaction Hash: ${transactionHash}`);
    console.log(`   State: ${deploymentResult.state || 'PENDING'}`);
    
    // Verify addresses match
    if (deployedSafeAddress.toLowerCase() !== expectedSafeAddress.toLowerCase()) {
      console.log(`⚠️  WARNING: Deployed address does NOT match expected address!`);
      console.log(`   Expected: ${expectedSafeAddress}`);
      console.log(`   Deployed: ${deployedSafeAddress}`);
    } else {
      console.log(`✅ Deployed address matches expected address!`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Deployment failed:`, errorMessage);
    
    if (errorMessage.includes('SAFE_DEPLOYED') || errorMessage.includes('safe already deployed')) {
      console.log(`\nℹ️  Relayer reports Safe already deployed`);
      console.log(`   Expected address: ${expectedSafeAddress}`);
      console.log(`   Verifying on-chain...`);
    } else {
      throw error;
    }
  }
  
  // Step 7: Verify deployment on-chain
  console.log('\n🔍 Step 7: Verifying Safe deployment on-chain...');
  
  // Wait a bit for transaction to be mined
  console.log(`   Waiting 5 seconds for transaction to be mined...`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const safeAddress = deploymentResult?.proxyAddress || expectedSafeAddress;
  const finalCode = await provider.getCode(safeAddress);
  
  if (finalCode === '0x' || finalCode === '0x0') {
    console.log(`❌ Safe is NOT deployed on-chain at ${safeAddress}`);
    console.log(`\n💡 Possible issues:`);
    console.log(`   1. Transaction is still pending (wait longer)`);
    console.log(`   2. Transaction failed or was reverted`);
    console.log(`   3. Relayer reported success but deployment didn't complete`);
    console.log(`   4. Network mismatch`);
    
    // Check transaction status if we have a hash
    if (deploymentResult?.transactionHash) {
      console.log(`\n🔍 Checking transaction status...`);
      try {
        const tx = await provider.getTransaction(deploymentResult.transactionHash);
        if (tx) {
          console.log(`   Transaction found:`);
          console.log(`   Block Number: ${tx.blockNumber || 'Pending'}`);
          console.log(`   From: ${tx.from}`);
          console.log(`   To: ${tx.to}`);
          console.log(`   Value: ${ethers.utils.formatEther(tx.value)} MATIC`);
          
          if (tx.blockNumber) {
            const receipt = await provider.getTransactionReceipt(deploymentResult.transactionHash);
            if (receipt) {
              console.log(`   Status: ${receipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
              console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
              if (receipt.status === 0) {
                console.log(`   ⚠️  Transaction failed! This explains why Safe is not deployed.`);
              }
            }
          } else {
            console.log(`   ⏳ Transaction is still pending`);
          }
        } else {
          console.log(`   ⚠️  Transaction not found on-chain`);
        }
      } catch (txError) {
        console.log(`   ⚠️  Could not check transaction: ${txError instanceof Error ? txError.message : 'Unknown error'}`);
      }
    }
    
    return;
  }
  
  console.log(`✅ Safe IS deployed on-chain at ${safeAddress}!`);
  
  // Step 8: Verify Safe configuration
  console.log('\n📋 Step 8: Verifying Safe configuration...');
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  
  try {
    const owners = await safeContract.getOwners();
    const threshold = await safeContract.getThreshold();
    const isDerivedWalletOwner = await safeContract.isOwner(connectedWallet.address);
    
    console.log(`✅ Safe Configuration:`);
    console.log(`   Threshold: ${threshold.toString()} (requires ${threshold.toString()} signatures)`);
    console.log(`   Total Owners: ${owners.length}`);
    console.log(`\n👥 Owners List:`);
    owners.forEach((owner: string, index: number) => {
      const isDerived = owner.toLowerCase() === connectedWallet.address.toLowerCase();
      console.log(`   ${index + 1}. ${owner} ${isDerived ? '✅ (Derived Wallet)' : ''}`);
    });
    
    if (isDerivedWalletOwner) {
      console.log(`\n✅ Derived wallet IS an owner of the Safe!`);
      console.log(`   This means the Safe can be used for trading.`);
    } else {
      console.log(`\n❌ Derived wallet is NOT an owner of the Safe!`);
      console.log(`   ⚠️  This will cause "invalid signature" errors!`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to verify Safe configuration:`, error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`   Test Mnemonic: ${testMnemonic.substring(0, 30)}...`);
  console.log(`   Derived Wallet: ${connectedWallet.address}`);
  console.log(`   Expected Safe: ${expectedSafeAddress}`);
  console.log(`   Deployed Safe: ${safeAddress}`);
  console.log(`   Deployment Status: ${finalCode !== '0x' && finalCode !== '0x0' ? '✅ Deployed' : '❌ Not Deployed'}`);
  console.log('='.repeat(60));
  
  console.log('\n💡 Next Steps:');
  if (finalCode !== '0x' && finalCode !== '0x0') {
    console.log('   ✅ Safe deployment test PASSED!');
    console.log('   The relayer is working correctly.');
  } else {
    console.log('   ❌ Safe deployment test FAILED!');
    console.log('   The relayer reported success but Safe is not on-chain.');
    console.log('   This indicates a problem with the relayer or deployment process.');
  }
}

// Run the test
testSafeDeployment().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

