import { ethers } from 'ethers';
import { config } from '../config/env';

const MATIC_ADDRESS = ethers.constants.AddressZero; // Native token

export interface GasBalanceInfo {
  relayerAddress: string; // Relayer wallet address (pays for gas)
  safeAddress?: string; // Kept for backward compatibility
  gasToken: {
    type: 'native' | 'erc20';
    address: string;
    name: string;
    balance: string; // Human-readable format
    balanceRaw: string; // Raw format
    isSufficient: boolean; // Whether balance is sufficient for typical transaction
    estimatedGasCost: string; // Estimated gas cost for a typical trade
  };
  recommendation: {
    needsTopUp: boolean;
    tokenToTopUp: string;
    amountToTopUp: string;
    reason: string;
  };
}

/**
 * Get gas balance information for the relayer wallet
 * IMPORTANT: Gas is paid by the relayer wallet (not the Safe wallet)
 * The relayer signs and sends transactions, so it needs MATIC for gas
 * 
 * @param relayerAddress Relayer wallet address (from SAFE_RELAYER_PRIVATE_KEY)
 * @returns Gas balance information with recommendations
 */
export async function getRelayerGasBalanceInfo(
  relayerAddress: string
): Promise<GasBalanceInfo> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(config.blockchain.polygonRpcUrl);
    
    // Get MATIC balance (native token) from relayer wallet
    // IMPORTANT: Gas is paid by the relayer, not the Safe wallet
    const maticBalance = await provider.getBalance(relayerAddress);
    const maticBalanceFormatted = ethers.utils.formatEther(maticBalance);
    
    // Estimate typical gas cost for a Polymarket trade
    // Typical Safe transaction on Polygon: ~200,000 gas
    // Average gas price: ~50 gwei
    // Cost = 200,000 * 50 gwei = 0.01 MATIC
    const estimatedGasLimit = ethers.BigNumber.from('200000'); // Typical gas limit
    const estimatedGasPrice = ethers.BigNumber.from('50000000000'); // 50 gwei
    const estimatedGasCost = estimatedGasLimit.mul(estimatedGasPrice);
    const estimatedGasCostFormatted = ethers.utils.formatEther(estimatedGasCost);
    
    // Consider sufficient if balance > 3x estimated cost (safety margin)
    const minimumRequired = estimatedGasCost.mul(3);
    const isSufficient = maticBalance.gte(minimumRequired);
    
    // Determine recommendation
    let needsTopUp = false;
    let amountToTopUp = '0';
    let reason = '';
    
    if (isSufficient) {
      reason = `Sufficient MATIC balance (${maticBalanceFormatted} MATIC) for gas fees. No top-up needed.`;
    } else {
      needsTopUp = true;
      // Recommend topping up 5x estimated cost for safety
      const recommendedAmount = estimatedGasCost.mul(5);
      amountToTopUp = ethers.utils.formatEther(recommendedAmount);
      reason = `Low MATIC balance (${maticBalanceFormatted} MATIC). Recommended to top up at least ${amountToTopUp} MATIC for gas fees.`;
    }

    return {
      relayerAddress,
      safeAddress: relayerAddress, // Kept for backward compatibility
      gasToken: {
        type: 'native',
        address: MATIC_ADDRESS,
        name: 'MATIC (Polygon Native Token)',
        balance: maticBalanceFormatted,
        balanceRaw: maticBalance.toString(),
        isSufficient,
        estimatedGasCost: estimatedGasCostFormatted,
      },
      recommendation: {
        needsTopUp,
        tokenToTopUp: 'MATIC',
        amountToTopUp,
        reason,
      },
    };
  } catch (error: any) {
    console.error('Error getting gas balance info:', error);
    throw new Error(
      `Failed to get gas balance info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get gas balance info for the relayer wallet
 * IMPORTANT: Gas is paid by the relayer wallet, not user Safe wallets
 * 
 * @returns Gas balance information for the relayer wallet
 */
export async function getRelayerGasBalanceInfoFromConfig(): Promise<GasBalanceInfo | null> {
  try {
    // Get relayer address from config
    if (!config.safe.relayerPrivateKey) {
      return null;
    }

    const relayerWallet = new ethers.Wallet(config.safe.relayerPrivateKey);
    const relayerAddress = relayerWallet.address;

    return await getRelayerGasBalanceInfo(relayerAddress);
  } catch (error: any) {
    console.error('Error getting relayer gas balance info:', error);
    throw new Error(
      `Failed to get relayer gas balance info: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get gas balance info for a user by their Ethereum address
 * NOTE: This actually returns the relayer wallet balance, not the user's Safe wallet
 * because gas is paid by the relayer, not the Safe wallet
 * 
 * @param userAddress User's Ethereum address (not used, kept for API compatibility)
 * @returns Gas balance information for the relayer wallet
 */
export async function getUserGasBalanceInfo(
  _userAddress: string
): Promise<GasBalanceInfo | null> {
  // Gas is paid by relayer, not user Safe wallets
  return await getRelayerGasBalanceInfoFromConfig();
}

/**
 * Print formatted gas balance info to console
 */
export function printGasBalanceInfo(info: GasBalanceInfo): void {
  console.log('\n⛽ Gas Balance Information');
  console.log('═'.repeat(60));
  console.log(`Relayer Wallet Address: ${info.relayerAddress || info.safeAddress}`);
  console.log('');
  console.log('📊 Gas Token:');
  console.log(`  Type: ${info.gasToken.type === 'native' ? 'Native (MATIC)' : 'ERC20'}`);
  console.log(`  Name: ${info.gasToken.name}`);
  console.log(`  Balance: ${info.gasToken.balance} ${info.gasToken.type === 'native' ? 'MATIC' : 'tokens'}`);
  console.log(`  Estimated Gas Cost: ~${info.gasToken.estimatedGasCost} MATIC per trade`);
  console.log(`  Status: ${info.gasToken.isSufficient ? '✅ Sufficient' : '⚠️  Low Balance'}`);
  console.log('');
  console.log('💡 Recommendation:');
  if (info.recommendation.needsTopUp) {
    console.log(`  ⚠️  Top Up Required`);
    console.log(`  Token: ${info.recommendation.tokenToTopUp}`);
    console.log(`  Amount: ${info.recommendation.amountToTopUp} ${info.recommendation.tokenToTopUp}`);
  } else {
    console.log(`  ✅ ${info.recommendation.reason}`);
  }
  console.log('');
  console.log('📝 Notes:');
  console.log('  • Gas is paid by the RELAYER wallet (not Safe wallets)');
  console.log('  • MATIC must be in the relayer wallet to execute transactions');
  console.log('  • Safe transactions typically cost ~0.01-0.05 MATIC');
  console.log('  • Keep at least 0.1 MATIC in relayer wallet for multiple transactions');
  console.log('  • Send MATIC to the relayer wallet address shown above');
  console.log('═'.repeat(60));
  console.log('');
}

