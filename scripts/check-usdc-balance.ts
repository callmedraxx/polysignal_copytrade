#!/usr/bin/env tsx
/**
 * Script to check USDC balance breakdown for a Safe wallet
 * Shows which token (Native USDC vs USDC.e) to top up
 * 
 * Usage:
 *   tsx scripts/check-usdc-balance.ts <safe-address>
 *   tsx scripts/check-usdc-balance.ts <user-address> --user
 */

import { getUSDCBalanceBreakdown, getUserUSDCBalanceBreakdown, printBalanceBreakdown } from '../src/services/usdc-balance-checker';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage:');
  console.error('  tsx scripts/check-usdc-balance.ts <safe-address>');
  console.error('  tsx scripts/check-usdc-balance.ts <user-address> --user');
  console.error('');
  console.error('Examples:');
  console.error('  tsx scripts/check-usdc-balance.ts 0x1234...5678');
  console.error('  tsx scripts/check-usdc-balance.ts 0xabcd...ef01 --user');
  process.exit(1);
}

const address = args[0];
const isUserAddress = args.includes('--user');

async function main() {
  try {
    let breakdown;

    if (isUserAddress) {
      console.log(`🔍 Checking balance for user: ${address}`);
      breakdown = await getUserUSDCBalanceBreakdown(address);
      
      if (!breakdown) {
        console.error('❌ User or proxy wallet not found.');
        console.error('   Make sure the user has created a proxy wallet.');
        process.exit(1);
      }
    } else {
      console.log(`🔍 Checking balance for Safe wallet: ${address}`);
      breakdown = await getUSDCBalanceBreakdown(address);
    }

    printBalanceBreakdown(breakdown);

    // Additional helpful information
    console.log('📝 Notes:');
    console.log('  • Polymarket requires Native USDC (not USDC.e)');
    console.log('  • If you have USDC.e, use the swap endpoint to convert it');
    console.log('  • Always top up Native USDC for Polymarket trading');
    console.log('  • Native USDC address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    console.log('  • USDC.e address: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

