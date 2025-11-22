#!/usr/bin/env tsx
/**
 * Script to check USDC.e and Native USDC balances on Polygon for a proxy address
 * 
 * Usage:
 *   tsx scripts/check-proxy-usdc-balance.ts <proxy-address>
 */

import { ethers } from 'ethers';
import { config } from '../src/config/env';

// Polygon has TWO USDC tokens:
// 1. USDC.e (bridged USDC from Ethereum) - older
const USDC_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// 2. Native USDC (official Polygon USDC) - newer
const USDC_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

interface TokenBalance {
  contractAddress: string;
  label: string;
  symbol: string;
  name: string;
  balance: string;
  formattedBalance: string;
  decimals: number;
  error?: string;
}

async function checkUSDCBalance(
  contractAddress: string,
  address: string,
  label: string
): Promise<TokenBalance> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl || 'https://polygon-rpc.com';
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
    
    // Get token info
    const [balance, decimals, symbol, name] = await Promise.all([
      contract.balanceOf(address),
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
      decimals,
    };
  } catch (error: any) {
    return {
      contractAddress,
      label,
      symbol: 'N/A',
      name: 'N/A',
      balance: '0',
      formattedBalance: '0',
      decimals: 6,
      error: error.message,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/check-proxy-usdc-balance.ts <proxy-address>');
    console.error('');
    console.error('Example:');
    console.error('  tsx scripts/check-proxy-usdc-balance.ts 0xc7341f97032a56510720c302003d4b09ce6cfeef');
    process.exit(1);
  }

  const proxyAddress = args[0];
  
  // Validate address format
  if (!ethers.utils.isAddress(proxyAddress)) {
    console.error(`❌ Invalid address format: ${proxyAddress}`);
    process.exit(1);
  }

  console.log('\n🔍 Checking USDC Balances on Polygon');
  console.log('='.repeat(70));
  console.log(`Proxy Address: ${proxyAddress}`);
  console.log('-'.repeat(70));
  
  // Check USDC.e (bridged)
  console.log('\n1️⃣ Checking USDC.e (Bridged from Ethereum)...');
  const usdcE = await checkUSDCBalance(USDC_E, proxyAddress, 'USDC.e');
  if (usdcE.error) {
    console.log(`   ❌ Error: ${usdcE.error}`);
  } else {
    console.log(`   Contract: ${usdcE.contractAddress}`);
    console.log(`   Name: ${usdcE.name}`);
    console.log(`   Symbol: ${usdcE.symbol}`);
    console.log(`   Raw Balance: ${usdcE.balance}`);
    console.log(`   Formatted Balance: ${parseFloat(usdcE.formattedBalance).toLocaleString()} ${usdcE.symbol}`);
    if (parseFloat(usdcE.formattedBalance) > 0) {
      console.log(`   ✅ BALANCE: ${parseFloat(usdcE.formattedBalance).toLocaleString()} ${usdcE.symbol}`);
    } else {
      console.log(`   ⚠️  Balance: 0 ${usdcE.symbol}`);
    }
  }
  
  // Check Native USDC
  console.log('\n2️⃣ Checking Native USDC (Official Polygon USDC)...');
  const usdcNative = await checkUSDCBalance(USDC_NATIVE, proxyAddress, 'Native USDC');
  if (usdcNative.error) {
    console.log(`   ❌ Error: ${usdcNative.error}`);
  } else {
    console.log(`   Contract: ${usdcNative.contractAddress}`);
    console.log(`   Name: ${usdcNative.name}`);
    console.log(`   Symbol: ${usdcNative.symbol}`);
    console.log(`   Raw Balance: ${usdcNative.balance}`);
    console.log(`   Formatted Balance: ${parseFloat(usdcNative.formattedBalance).toLocaleString()} ${usdcNative.symbol}`);
    if (parseFloat(usdcNative.formattedBalance) > 0) {
      console.log(`   ✅ BALANCE: ${parseFloat(usdcNative.formattedBalance).toLocaleString()} ${usdcNative.symbol}`);
    } else {
      console.log(`   ⚠️  Balance: 0 ${usdcNative.symbol}`);
    }
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log('='.repeat(70));
  const usdcEBalance = usdcE.formattedBalance ? parseFloat(usdcE.formattedBalance) : 0;
  const usdcNativeBalance = usdcNative.formattedBalance ? parseFloat(usdcNative.formattedBalance) : 0;
  
  console.log(`USDC.e (Bridged):     ${usdcEBalance.toLocaleString()} USDC.e`);
  console.log(`Native USDC:          ${usdcNativeBalance.toLocaleString()} USDC`);
  console.log(`Total USDC Balance:   ${(usdcEBalance + usdcNativeBalance).toLocaleString()}`);
  
  if (usdcEBalance > 0 && usdcNativeBalance === 0) {
    console.log('\n⚠️  NOTE: You have USDC.e but no Native USDC.');
    console.log('   Polymarket typically requires Native USDC for trading.');
    console.log('   You may need to swap USDC.e to Native USDC.');
  } else if (usdcEBalance === 0 && usdcNativeBalance > 0) {
    console.log('\n✅ You have Native USDC which is compatible with Polymarket.');
  } else if (usdcEBalance > 0 && usdcNativeBalance > 0) {
    console.log('\n✅ You have both USDC.e and Native USDC.');
    console.log('   Native USDC is used for Polymarket trading.');
  } else {
    console.log('\n⚠️  No USDC balance found in either token.');
  }
  
  console.log('\n📝 View on PolygonScan:');
  console.log(`   https://polygonscan.com/address/${proxyAddress}`);
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
});

