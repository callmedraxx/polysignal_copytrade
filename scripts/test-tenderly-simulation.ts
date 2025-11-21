/**
 * Test script for Tenderly simulation
 * 
 * This script tests the Tenderly simulation before executing trades
 * to catch GS013 errors early.
 * 
 * Usage:
 *   tsx scripts/test-tenderly-simulation.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { config } from '../src/config/env';
import { simulateSafeTransaction, extractTenderlyError } from '../src/services/tenderly-simulator';
import { getSafeInstance } from '../src/services/wallet';

async function testTenderlySimulation() {
  console.log('🧪 Testing Tenderly Simulation\n');

  // Check if Tenderly is configured
  if (!process.env.TENDERLY_ACCESS_TOKEN || !process.env.TENDERLY_API_URL) {
    console.error('❌ Tenderly not configured!');
    console.error('   Please set TENDERLY_ACCESS_TOKEN and TENDERLY_API_URL in your .env file');
    console.error('   Format: TENDERLY_API_URL=https://api.tenderly.co/api/v1/account/{accountSlug}/project/{projectSlug}');
    process.exit(1);
  }

  // Check if Safe relayer is configured
  if (!config.safe.relayerPrivateKey) {
    console.error('❌ SAFE_RELAYER_PRIVATE_KEY not configured!');
    process.exit(1);
  }

  // Test parameters - update these with your actual values
  const safeAddress = process.env.TEST_SAFE_ADDRESS || '0xd4ad5afedac9385ce6cc5d95edfebeb7501de57e';
  const polymarketAddress = process.env.POLYMARKET_FPMM_ADDRESS || '0x8B9805A2f595B6705e74F7310829f2d299D21522';
  const amountWei = process.env.TEST_AMOUNT_WEI || '1000000'; // 1 USDC (6 decimals)
  const outcomeIndex = parseInt(process.env.TEST_OUTCOME_INDEX || '1');

  console.log('📋 Test Parameters:');
  console.log(`   Safe Address: ${safeAddress}`);
  console.log(`   Polymarket Address: ${polymarketAddress}`);
  console.log(`   Amount (wei): ${amountWei}`);
  console.log(`   Outcome Index: ${outcomeIndex}`);
  console.log(`   Tenderly API URL: ${process.env.TENDERLY_API_URL}\n`);

  try {
    // Initialize Safe Protocol Kit
    console.log('🔐 Initializing Safe Protocol Kit...');
    const protocolKit = await getSafeInstance(safeAddress, config.safe.relayerPrivateKey);
    
    const owners = await protocolKit.getOwners();
    const threshold = await protocolKit.getThreshold();
    const relayerWallet = new ethers.Wallet(config.safe.relayerPrivateKey);
    const relayerAddress = relayerWallet.address;
    
    console.log('✅ Safe initialized');
    console.log(`   Owners: ${owners.join(', ')}`);
    console.log(`   Threshold: ${threshold}`);
    console.log(`   Relayer: ${relayerAddress}`);
    console.log(`   Is Relayer Owner: ${owners.some(owner => owner.toLowerCase() === relayerAddress.toLowerCase())}\n`);

    // Build Polymarket buy transaction data
    console.log('📝 Building Polymarket buy transaction...');
    const fpmmInterface = new ethers.utils.Interface([
      'function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy) external returns (uint256 outcomeTokensBought)',
    ]);

    const buyData = fpmmInterface.encodeFunctionData('buy', [
      amountWei,
      outcomeIndex,
      '0', // minOutcomeTokensToBuy
    ]);

    console.log(`✅ Transaction data built (${buyData.length} bytes)\n`);

    // Create Safe transaction
    console.log('🔨 Creating Safe transaction...');
    const checksummedAddress = ethers.utils.getAddress(polymarketAddress);
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: checksummedAddress,
        value: '0',
        data: buyData,
      }],
    });

    const txHash = await protocolKit.getTransactionHash(safeTransaction);
    console.log(`✅ Safe transaction created`);
    console.log(`   Transaction Hash: ${txHash}\n`);

    // Simulate with Tenderly
    console.log('🚀 Simulating transaction with Tenderly...');
    console.log('   This may take a few seconds...\n');
    
    const simulationResult = await simulateSafeTransaction(
      safeTransaction,
      protocolKit,
      safeAddress,
      checksummedAddress,
      buyData,
      '0'
    );

    // Check results
    console.log('📊 Simulation Results:');
    console.log('─'.repeat(60));
    
    if (simulationResult.transaction) {
      console.log(`   Status: ${simulationResult.transaction.status ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`   Gas Used: ${simulationResult.transaction.gas_used || 'N/A'}`);
      
      if (simulationResult.transaction.error_message) {
        console.log(`   Error: ${simulationResult.transaction.error_message}`);
      }
    }

    if (simulationResult.simulation) {
      console.log(`   Simulation ID: ${simulationResult.simulation.id || 'N/A'}`);
      console.log(`   Simulation Status: ${simulationResult.simulation.status ? '✅ SUCCESS' : '❌ FAILED'}`);
      
      if (simulationResult.simulation.error_message) {
        console.log(`   Simulation Error: ${simulationResult.simulation.error_message}`);
      }
    }

    const error = extractTenderlyError(simulationResult);
    if (error) {
      console.log(`\n❌ Simulation Error Detected:`);
      console.log(`   ${error}`);
      
      // Check for GS013 specifically
      if (error.includes('GS013') || error.includes('Not enough valid signatures')) {
        console.log('\n🔍 GS013 Error Analysis:');
        console.log('   This error means "Not enough valid signatures"');
        console.log('   Possible causes:');
        console.log('   1. Relayer is not an owner of the Safe');
        console.log('   2. Threshold is greater than 1 and only one signature provided');
        console.log('   3. Signature format is incorrect');
        console.log('   4. Transaction hash calculation is wrong');
      }
    } else {
      console.log('\n✅ Simulation successful! Transaction should execute without GS013 error.');
    }

    console.log('\n📄 Full Response:');
    console.log(JSON.stringify(simulationResult, null, 2));

  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message || error);
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run the test
testTenderlySimulation()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

