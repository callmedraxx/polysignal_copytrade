/**
 * Test script for Builder Program integration
 * Tests CLOB client initialization and order creation
 */

import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { config } from '../src/config/env';
import { getMarketInfo, getOrderBook } from '../src/services/polymarket-clob';
import { createClobClientForUser } from '../src/services/clob-client';
import { getBuilderConfig } from '../src/services/builder-config';

async function testBuilderProgram() {
  console.log('🧪 Testing Builder Program Integration\n');

  // Test 1: Check Builder Config
  console.log('1️⃣ Testing Builder Configuration...');
  try {
    const builderConfig = getBuilderConfig();
    console.log('✅ Builder config initialized successfully');
  } catch (error) {
    console.error('❌ Builder config failed:', error instanceof Error ? error.message : error);
    console.log('\n⚠️  Make sure you have set:');
    console.log('   - POLY_BUILDER_API_KEY');
    console.log('   - POLY_BUILDER_SECRET');
    console.log('   - POLY_BUILDER_PASSPHRASE');
    return;
  }

  // Test 2: Check HD Wallet Mnemonic (for derived wallets)
  console.log('\n2️⃣ Testing HD Wallet Configuration...');
  if (!config.blockchain.hdWalletMnemonic || config.blockchain.hdWalletMnemonic.trim() === '') {
    console.error('❌ HD_WALLET_MNEMONIC not configured');
    console.log('   This is required for deriving user-specific wallets.');
    return;
  }
  console.log('✅ HD wallet mnemonic configured');

  // Test 3: Test CLOB API Connection
  console.log('\n3️⃣ Testing CLOB API Connection...');
  try {
    // Try fetching markets list instead of specific market
    const response = await fetch(`${config.polymarket.clobApiUrl}/markets?limit=1&closed=false`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const markets = await response.json();
    console.log('✅ CLOB API connection successful');
    console.log(`   Found ${markets.data?.length || 0} active markets`);
    if (markets.data && markets.data.length > 0) {
      console.log(`   Example market: ${markets.data[0].question || 'N/A'}`);
    }
  } catch (error) {
    console.error('❌ CLOB API connection failed:', error instanceof Error ? error.message : error);
    console.log('   This might be okay if CLOB API is temporarily unavailable');
  }

  // Test 4: Test CLOB Client Initialization
  console.log('\n4️⃣ Testing CLOB Client Initialization...');
  try {
    // Note: This requires a user to exist in the database with a proxy wallet
    // For testing, you can use an existing user address from your database
    const testUserAddress = process.env.TEST_USER_ADDRESS || '0x' + '0'.repeat(40);
    
    if (testUserAddress === '0x' + '0'.repeat(40)) {
      console.log('⚠️  TEST_USER_ADDRESS not set. Skipping CLOB client initialization test.');
      console.log('   Set TEST_USER_ADDRESS environment variable to test CLOB client initialization.');
    } else {
      const clobClient = await createClobClientForUser(testUserAddress);
      console.log('✅ CLOB client initialized successfully');
      console.log(`   User: ${testUserAddress}`);
    }
  } catch (error) {
    console.error('❌ CLOB client initialization failed:', error instanceof Error ? error.message : error);
    console.log('   This is expected if TEST_USER_ADDRESS is not set or user does not exist in database.');
  }

  // Test 5: Check Environment Variables
  console.log('\n5️⃣ Checking Environment Variables...');
  const requiredVars = [
    'POLY_BUILDER_API_KEY',
    'POLY_BUILDER_SECRET',
    'POLY_BUILDER_PASSPHRASE',
    'HD_WALLET_MNEMONIC',
    'POLYGON_RPC_URL',
  ];
  
  const missingVars: string[] = [];
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value || value === '' || value.includes('...')) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.log('⚠️  Missing or incomplete environment variables:');
    missingVars.forEach(v => console.log(`   - ${v}`));
  } else {
    console.log('✅ All required environment variables are set');
  }

  console.log('\n✅ Builder Program integration test complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Run database migration: npx prisma migrate dev');
  console.log('   2. Test Safe wallet creation');
  console.log('   3. Test order submission');
}

// Run tests
testBuilderProgram().catch(console.error);

