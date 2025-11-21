/**
 * Test script to verify balance via API endpoint
 * 
 * Usage:
 *   1. Get a JWT token by authenticating first
 *   2. Set JWT_TOKEN environment variable or pass as argument
 *   3. Run: npx tsx scripts/test-api-balance.ts [JWT_TOKEN]
 */

import { config } from '../src/config/env';

const PROXY_WALLET_ADDRESS = '0x53ef5df1861fe4fc44cefd831293378eaf14c3c9';
const API_URL = config.app.url || 'http://localhost:3000';
const API_PORT = config.port || 3001;
const BASE_URL = API_URL.includes('localhost') ? `http://localhost:${API_PORT}` : API_URL;

async function testApiBalance(jwtToken?: string) {
  console.log('\n🔍 Testing API Endpoint Balance Fetch...');
  console.log('=' .repeat(60));
  console.log(`API Base URL: ${BASE_URL}`);
  console.log(`Endpoint: ${BASE_URL}/api/deposit/balance`);
  console.log(`Proxy Wallet: ${PROXY_WALLET_ADDRESS}`);
  console.log('-'.repeat(60));

  // Get JWT token from args or env
  const token = jwtToken || process.env.JWT_TOKEN;
  
  if (!token) {
    console.log('\n⚠️  No JWT token provided');
    console.log('\nTo test the API endpoint, you need to:');
    console.log('1. Authenticate first to get a JWT token');
    console.log('2. Run: JWT_TOKEN=your_token npx tsx scripts/test-api-balance.ts');
    console.log('   OR: npx tsx scripts/test-api-balance.ts your_token');
    console.log('\nExample authentication flow:');
    console.log('  1. POST /api/auth/nonce with your wallet address');
    console.log('  2. Sign the message with your wallet');
    console.log('  3. POST /api/auth/verify with signature to get JWT token');
    return null;
  }

  try {
    console.log('\n📡 Making API request...');
    const response = await fetch(`${BASE_URL}/api/deposit/balance`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`\n❌ API Error:`);
      console.error(`   Status: ${response.status}`);
      console.error(`   Response: ${errorText}`);
      
      if (response.status === 401) {
        console.error('\n   ⚠️  Authentication failed. Token may be invalid or expired.');
      }
      return null;
    }

    const data = await response.json();
    
    console.log('\n✅ API Response:');
    console.log('   Balance:', data.balance, 'USDC');
    console.log('   Raw Balance:', data.balanceRaw);
    console.log('   Proxy Wallet:', data.proxyWallet);
    if (data.error) {
      console.log('   Error:', data.error);
    }

    // Verify the proxy wallet matches
    if (data.proxyWallet?.toLowerCase() === PROXY_WALLET_ADDRESS.toLowerCase()) {
      console.log('\n   ✅ Proxy wallet address matches!');
    } else {
      console.log('\n   ⚠️  Warning: Proxy wallet address does not match expected address');
      console.log(`   Expected: ${PROXY_WALLET_ADDRESS}`);
      console.log(`   Got: ${data.proxyWallet}`);
    }

    return data;
  } catch (error: any) {
    console.error('\n❌ Error calling API:');
    console.error('   Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   ⚠️  Cannot connect to server. Is the backend running?');
      console.error(`   Expected server at: ${BASE_URL}`);
    }
    return null;
  }
}

async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check Endpoint...');
  console.log('=' .repeat(60));
  
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Server is healthy');
      console.log('   Status:', data.status);
      console.log('   Timestamp:', data.timestamp);
      return true;
    } else {
      console.log('   ⚠️  Health check failed');
      return false;
    }
  } catch (error: any) {
    console.log('   ❌ Cannot reach server');
    console.log('   Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Starting API Balance Verification Test');
  console.log('=' .repeat(60));
  
  // Get JWT token from command line args
  const jwtToken = process.argv[2];
  
  // Test health check first
  const isHealthy = await testHealthCheck();
  
  if (!isHealthy) {
    console.log('\n⚠️  Server health check failed. Cannot proceed with balance test.');
    console.log('   Please ensure the backend server is running.');
    process.exit(1);
  }
  
  // Test API balance endpoint
  const result = await testApiBalance(jwtToken);
  
  if (result) {
    console.log('\n✅ API test completed successfully!');
    console.log('=' .repeat(60));
    console.log('\nSummary:');
    console.log(`   Balance: ${result.balance} USDC`);
    console.log(`   Raw: ${result.balanceRaw}`);
    console.log(`   Proxy Wallet: ${result.proxyWallet}`);
  } else {
    console.log('\n⚠️  API test could not be completed');
    console.log('   This is expected if no JWT token was provided');
  }
}

main().catch(console.error);

