import { ethers } from 'ethers';
import { config } from '../src/config/env';
import { getUSDCBalance, getUSDCBalanceRaw } from '../src/services/balance';

const PROXY_WALLET_ADDRESS = '0x53ef5df1861fe4fc44cefd831293378eaf14c3c9';
const USDC_ADDRESS = config.blockchain.usdcAddress || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
const USDC_DECIMALS = 6;

/**
 * Test balance fetching programmatically (direct blockchain query)
 */
async function testProgrammaticBalance() {
  console.log('\n🔍 Testing Programmatic Balance Fetch...');
  console.log('=' .repeat(60));
  console.log(`Proxy Wallet: ${PROXY_WALLET_ADDRESS}`);
  console.log(`USDC Contract: ${USDC_ADDRESS}`);
  console.log(`RPC URL: ${config.blockchain.polygonRpcUrl || 'Using default'}`);
  console.log('-'.repeat(60));

  try {
    const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

    // Verify network
    console.log('\n📡 Checking network connection...');
    const network = await provider.getNetwork();
    console.log(`   Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 137) {
      console.warn(`   ⚠️ Warning: Expected Polygon (137), got chain ID ${network.chainId}`);
    }

    // Check if address is a contract
    console.log('\n🔍 Checking if address is a contract...');
    const code = await provider.getCode(PROXY_WALLET_ADDRESS);
    const isContract = code !== '0x' && code !== '0x0';
    console.log(`   Is Contract: ${isContract ? 'Yes' : 'No'}`);
    if (isContract) {
      console.log(`   Code length: ${code.length} characters`);
    }

    // Get USDC balance using direct contract call
    console.log('\n💰 Fetching USDC balance directly from contract...');
    const usdcAbi = [
      'function balanceOf(address account) external view returns (uint256)',
      'function decimals() external view returns (uint8)',
    ];
    
    const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);
    
    // Verify USDC contract
    const contractDecimals = await usdcContract.decimals();
    console.log(`   USDC Decimals: ${contractDecimals}`);
    
    if (contractDecimals !== USDC_DECIMALS) {
      console.warn(`   ⚠️ Warning: Expected ${USDC_DECIMALS} decimals, got ${contractDecimals}`);
    }

    // Get balance
    const balanceRaw = await usdcContract.balanceOf(PROXY_WALLET_ADDRESS);
    const balanceFormatted = ethers.utils.formatUnits(balanceRaw, USDC_DECIMALS);
    
    console.log('\n✅ Balance Results:');
    console.log('   Raw Balance:', balanceRaw.toString());
    console.log('   Formatted Balance:', balanceFormatted, 'USDC');
    
    return {
      raw: balanceRaw.toString(),
      formatted: balanceFormatted,
      decimals: contractDecimals,
    };
  } catch (error: any) {
    console.error('\n❌ Error fetching balance programmatically:');
    console.error('   Error:', error.message);
    console.error('   Code:', error.code);
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    throw error;
  }
}

/**
 * Test balance using the service functions (same as API uses)
 */
async function testServiceBalance() {
  console.log('\n🔍 Testing Service Function Balance Fetch...');
  console.log('=' .repeat(60));
  
  try {
    const balance = await getUSDCBalance(PROXY_WALLET_ADDRESS);
    const balanceRaw = await getUSDCBalanceRaw(PROXY_WALLET_ADDRESS);
    
    console.log('\n✅ Service Function Results:');
    console.log('   Raw Balance:', balanceRaw);
    console.log('   Formatted Balance:', balance, 'USDC');
    
    return {
      raw: balanceRaw,
      formatted: balance,
    };
  } catch (error: any) {
    console.error('\n❌ Error fetching balance via service:');
    console.error('   Error:', error.message);
    throw error;
  }
}

/**
 * Test API endpoint (if server is running)
 */
async function testApiBalance() {
  console.log('\n🔍 Testing API Endpoint Balance Fetch...');
  console.log('=' .repeat(60));
  
  const apiUrl = config.app.url || 'http://localhost:3000';
  const endpoint = `${apiUrl}/api/deposit/balance`;
  
  console.log(`   API URL: ${endpoint}`);
  console.log('   ⚠️ Note: This requires authentication and the server to be running');
  console.log('   ⚠️ Note: You need to provide a valid JWT token');
  
  // We can't actually test this without auth, but we can show what the request would look like
  console.log('\n📝 To test API endpoint manually:');
  console.log(`   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" ${endpoint}`);
  console.log(`   Or use: GET ${endpoint} with Bearer token in headers`);
  
  return null;
}

/**
 * Compare results
 */
function compareResults(programmatic: any, service: any) {
  console.log('\n📊 Comparison Results:');
  console.log('=' .repeat(60));
  
  if (!programmatic || !service) {
    console.log('   ⚠️ Cannot compare - missing results');
    return;
  }
  
  const programmaticRaw = programmatic.raw;
  const serviceRaw = service.raw;
  
  const programmaticFormatted = parseFloat(programmatic.formatted);
  const serviceFormatted = parseFloat(service.formatted);
  
  console.log('\n   Programmatic Result:');
  console.log(`      Raw: ${programmaticRaw}`);
  console.log(`      Formatted: ${programmaticFormatted} USDC`);
  
  console.log('\n   Service Function Result:');
  console.log(`      Raw: ${serviceRaw}`);
  console.log(`      Formatted: ${serviceFormatted} USDC`);
  
  const rawMatch = programmaticRaw === serviceRaw;
  const formattedMatch = Math.abs(programmaticFormatted - serviceFormatted) < 0.000001;
  
  console.log('\n   Comparison:');
  console.log(`      Raw Match: ${rawMatch ? '✅ YES' : '❌ NO'}`);
  console.log(`      Formatted Match: ${formattedMatch ? '✅ YES' : '❌ NO'}`);
  
  if (rawMatch && formattedMatch) {
    console.log('\n   ✅ SUCCESS: All results match! Code is working correctly.');
  } else {
    console.log('\n   ⚠️ WARNING: Results do not match. There may be an issue.');
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('\n🚀 Starting Balance Verification Test');
  console.log('=' .repeat(60));
  
  let programmaticResult: any = null;
  let serviceResult: any = null;
  
  try {
    // Test programmatic balance
    programmaticResult = await testProgrammaticBalance();
    
    // Test service balance
    serviceResult = await testServiceBalance();
    
    // Compare results
    compareResults(programmaticResult, serviceResult);
    
    // Show API info
    await testApiBalance();
    
    console.log('\n✅ Test completed successfully!');
    console.log('=' .repeat(60));
    
  } catch (error: any) {
    console.error('\n❌ Test failed with error:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);

