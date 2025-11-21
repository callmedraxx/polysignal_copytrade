import { ethers } from 'ethers';
import { config } from '../src/config/env';

const PROXY_WALLET_ADDRESS = '0x53ef5df1861fe4fc44cefd831293378eaf14c3c9';

// Polygon has TWO USDC tokens:
// 1. Native USDC (newer, official)
const USDC_NATIVE = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// 2. Bridged USDC.e (older, bridged from Ethereum)
const USDC_BRIDGED = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

const USDC_DECIMALS = 6;

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

async function checkUSDCBalance(contractAddress: string, label: string) {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
    
    // Get token info
    const [balance, decimals, symbol, name] = await Promise.all([
      contract.balanceOf(PROXY_WALLET_ADDRESS),
      contract.decimals(),
      contract.symbol(),
      contract.name(),
    ]);
    
    const formattedBalance = ethers.utils.formatUnits(balance, decimals);
    
    return {
      contractAddress,
      label,
      symbol,
      name,
      balance: balance.toString(),
      formattedBalance,
      decimals: decimals.toString(),
    };
  } catch (error: any) {
    return {
      contractAddress,
      label,
      error: error.message,
    };
  }
}

async function checkAllTokenBalances() {
  console.log('\n🔍 Checking ALL USDC Token Balances...');
  console.log('=' .repeat(70));
  console.log(`Proxy Wallet: ${PROXY_WALLET_ADDRESS}`);
  console.log('-'.repeat(70));
  
  // Check Native USDC
  console.log('\n1️⃣ Checking Native USDC (Official Polygon USDC)...');
  const nativeUSDC = await checkUSDCBalance(USDC_NATIVE, 'Native USDC');
  if (nativeUSDC.error) {
    console.log(`   ❌ Error: ${nativeUSDC.error}`);
  } else {
    console.log(`   Contract: ${nativeUSDC.contractAddress}`);
    console.log(`   Name: ${nativeUSDC.name}`);
    console.log(`   Symbol: ${nativeUSDC.symbol}`);
    console.log(`   Raw Balance: ${nativeUSDC.balance}`);
    console.log(`   Formatted Balance: ${nativeUSDC.formattedBalance} ${nativeUSDC.symbol}`);
    if (parseFloat(nativeUSDC.formattedBalance) > 0) {
      console.log(`   ✅ BALANCE FOUND: ${nativeUSDC.formattedBalance} ${nativeUSDC.symbol}`);
    } else {
      console.log(`   ⚠️  Balance: 0`);
    }
  }
  
  // Check Bridged USDC.e
  console.log('\n2️⃣ Checking Bridged USDC.e (Bridged from Ethereum)...');
  const bridgedUSDC = await checkUSDCBalance(USDC_BRIDGED, 'Bridged USDC.e');
  if (bridgedUSDC.error) {
    console.log(`   ❌ Error: ${bridgedUSDC.error}`);
  } else {
    console.log(`   Contract: ${bridgedUSDC.contractAddress}`);
    console.log(`   Name: ${bridgedUSDC.name}`);
    console.log(`   Symbol: ${bridgedUSDC.symbol}`);
    console.log(`   Raw Balance: ${bridgedUSDC.balance}`);
    console.log(`   Formatted Balance: ${bridgedUSDC.formattedBalance} ${bridgedUSDC.symbol}`);
    if (parseFloat(bridgedUSDC.formattedBalance) > 0) {
      console.log(`   ✅ BALANCE FOUND: ${bridgedUSDC.formattedBalance} ${bridgedUSDC.symbol}`);
    } else {
      console.log(`   ⚠️  Balance: 0`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log('=' .repeat(70));
  const nativeBalance = nativeUSDC.formattedBalance ? parseFloat(nativeUSDC.formattedBalance) : 0;
  const bridgedBalance = bridgedUSDC.formattedBalance ? parseFloat(bridgedUSDC.formattedBalance) : 0;
  
  if (nativeBalance > 0) {
    console.log(`✅ Native USDC Balance: ${nativeBalance} USDC`);
  } else {
    console.log(`⚠️  Native USDC Balance: 0`);
  }
  
  if (bridgedBalance > 0) {
    console.log(`✅ Bridged USDC.e Balance: ${bridgedBalance} USDC.e`);
  } else {
    console.log(`⚠️  Bridged USDC.e Balance: 0`);
  }
  
  const totalBalance = nativeBalance + bridgedBalance;
  if (totalBalance > 0) {
    console.log(`\n💰 TOTAL USDC BALANCE: ${totalBalance}`);
  } else {
    console.log(`\n⚠️  NO USDC FOUND in either contract`);
    console.log('\n🔍 Possible Issues:');
    console.log('   1. Transaction may not have been sent to Polygon network');
    console.log('   2. Transaction may not have been confirmed yet');
    console.log('   3. USDC may have been sent to a different address');
    console.log('   4. Bybit may have sent a different token');
    console.log('\n📝 Next Steps:');
    console.log('   1. Check PolygonScan: https://polygonscan.com/address/' + PROXY_WALLET_ADDRESS);
    console.log('   2. Verify the transaction hash from Bybit');
    console.log('   3. Check if transaction was sent to Polygon (not Ethereum)');
    console.log('   4. Verify the receiving address matches exactly');
  }
  
  return {
    nativeUSDC,
    bridgedUSDC,
    totalBalance,
  };
}

async function checkRecentTransactions() {
  console.log('\n🔍 Checking Recent Transactions...');
  console.log('=' .repeat(70));
  
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Get recent transactions (this is limited, but we can try)
    console.log('   📝 To check transactions, visit:');
    console.log(`   https://polygonscan.com/address/${PROXY_WALLET_ADDRESS}`);
    console.log('\n   Look for:');
    console.log('   - Incoming USDC transfers');
    console.log('   - Check both Native USDC and USDC.e tokens');
    console.log('   - Verify transaction status (Success/Failed)');
    
  } catch (error: any) {
    console.log(`   ⚠️  Could not fetch transaction history: ${error.message}`);
  }
}

async function main() {
  console.log('\n🚀 Comprehensive USDC Balance Check');
  console.log('=' .repeat(70));
  console.log('\n⚠️  IMPORTANT: Polygon has TWO USDC tokens:');
  console.log('   1. Native USDC: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
  console.log('   2. Bridged USDC.e: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
  console.log('\n   Your code currently checks ONLY Native USDC.');
  console.log('   If Bybit sent USDC.e, it won\'t show up!');
  
  const results = await checkAllTokenBalances();
  await checkRecentTransactions();
  
  console.log('\n' + '=' .repeat(70));
  console.log('✅ Check Complete!');
  console.log('=' .repeat(70));
  
  // If bridged USDC has balance, warn about code update needed
  const bridgedBalance = results.bridgedUSDC.formattedBalance 
    ? parseFloat(results.bridgedUSDC.formattedBalance) 
    : 0;
  
  if (bridgedBalance > 0) {
    console.log('\n⚠️  WARNING: Found USDC.e balance but your code only checks Native USDC!');
    console.log('   You may need to update your code to support both tokens.');
  }
}

main().catch(console.error);

