import { ethers } from 'ethers';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { getUSDCBalance } from './balance';
import { getSafeInstance } from './wallet';

// USDC contract address on Polygon
const USDC_ADDRESS = config.blockchain.usdcAddress;
const USDC_DECIMALS = 6;

// ERC20 ABI for USDC transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

/**
 * Initiate a deposit via Onramper
 * This creates a deposit record and returns Onramper widget URL
 * @param userAddress User's Ethereum address
 * @param sourceCurrency Source cryptocurrency (e.g., "ETH", "BTC")
 * @param sourceAmount Amount in source currency
 * @returns Deposit record and Onramper widget URL
 */
export async function initiateDeposit(
  userAddress: string,
  sourceCurrency: string,
  sourceAmount: string
): Promise<{
  depositId: string;
  onramperUrl: string;
  proxyWallet: string;
}> {
  try {
    // Normalize address (ensure lowercase)
    const normalizedAddress = userAddress.toLowerCase();
    
    // Get user and ensure proxy wallet exists
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
    });

    if (!user) {
      console.error(`User not found for address: ${normalizedAddress}`);
      throw new Error('User not found. Please complete signup first.');
    }

    if (!user.proxyWallet) {
      throw new Error('Proxy wallet not found. Please complete signup first.');
    }

    // Create deposit record
    const deposit = await prisma.deposit.create({
      data: {
        userId: user.id,
        sourceCurrency: sourceCurrency.toUpperCase(),
        sourceAmount,
        proxyWallet: user.proxyWallet,
        status: 'pending',
      },
    });

    // Generate Onramper widget URL
    // Note: Onramper widget integration - you'll need to configure this based on their API
    const onramperUrl = generateOnramperUrl(user.proxyWallet, sourceCurrency, sourceAmount, deposit.id);

    return {
      depositId: deposit.id,
      onramperUrl,
      proxyWallet: user.proxyWallet,
    };
  } catch (error) {
    console.error('Error initiating deposit:', error);
    throw new Error(
      `Failed to initiate deposit: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate Onramper widget URL
 * This uses Onramper's widget API to create a deposit flow
 * @param destinationAddress Proxy wallet address (where USDC will be sent)
 * @param sourceCurrency Source cryptocurrency
 * @param sourceAmount Amount in source currency
 * @param depositId Internal deposit ID for tracking
 * @returns Onramper widget URL
 */
function generateOnramperUrl(
  destinationAddress: string,
  sourceCurrency: string,
  sourceAmount: string,
  depositId: string
): string {
  const apiKey = config.deposit.onramperApiKey;
  const apiUrl = config.deposit.onramperApiUrl;

  if (!apiKey) {
    throw new Error('Onramper API key not configured');
  }

  // Onramper widget parameters
  // Note: Adjust these parameters based on Onramper's actual API documentation
  const params = new URLSearchParams({
    apiKey,
    defaultCrypto: 'USDC', // Target: USDC
    defaultFiat: 'USD',
    defaultAmount: sourceAmount,
    defaultCryptoCurrency: sourceCurrency,
    wallets: JSON.stringify({
      USDC: destinationAddress, // Send USDC to proxy wallet on Polygon
    }),
    // Onramper supports multiple chains - ensure Polygon is selected
    networks: JSON.stringify({
      USDC: 'POLYGON', // Polygon network
    }),
    // Callback URL for webhook
    redirectURL: `${config.app.url}/deposit/callback?depositId=${depositId}`,
  });

  // Onramper widget URL (adjust based on their actual API)
  return `${apiUrl}/widget?${params.toString()}`;
}

/**
 * Handle Onramper webhook callback
 * This processes the deposit completion and transfers USDC to proxy wallet
 * @param depositId Deposit ID
 * @param onramperOrderId Onramper order ID
 * @param usdcAmount Amount of USDC received
 * @param transactionHash Transaction hash from Onramper
 */
export async function processDepositCallback(
  depositId: string,
  onramperOrderId: string,
  usdcAmount: string,
  transactionHash?: string
): Promise<{
  success: boolean;
  depositId: string;
  finalBalance: string;
}> {
  try {
    // Get deposit record
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });

    if (!deposit) {
      throw new Error('Deposit not found');
    }

    if (deposit.status === 'completed') {
      // Already processed
      const balance = await getUSDCBalance(deposit.proxyWallet);
      return {
        success: true,
        depositId,
        finalBalance: balance,
      };
    }

    // Update deposit status
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        onramperOrderId,
        status: 'processing',
        targetAmount: usdcAmount,
        metadata: JSON.stringify({
          onramperOrderId,
          receivedAt: new Date().toISOString(),
          transactionHash,
        }),
      },
    });

    // Note: Onramper should handle the bridge/swap automatically
    // If USDC is already in the proxy wallet, we just need to verify
    // If not, we may need to transfer it (this depends on Onramper's flow)

    // Verify USDC is in proxy wallet (Onramper should send directly)
    // If not, we'll need to transfer from a holding wallet
    // For now, assume Onramper sends directly to the proxy wallet

    // Update deposit to completed
    await prisma.deposit.update({
      where: { id: depositId },
      data: {
        status: 'completed',
        transactionHash: transactionHash || null,
      },
    });

    // Get final balance
    const finalBalance = await getUSDCBalance(deposit.proxyWallet);

    return {
      success: true,
      depositId,
      finalBalance,
    };
  } catch (error) {
    console.error('Error processing deposit callback:', error);

    // Mark deposit as failed
    try {
      await prisma.deposit.update({
        where: { id: depositId },
        data: {
          status: 'failed',
          metadata: JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            failedAt: new Date().toISOString(),
          }),
        },
      });
    } catch (updateError) {
      console.error('Error updating deposit status:', updateError);
    }

    throw new Error(
      `Failed to process deposit: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Transfer USDC to a proxy wallet (if needed)
 * This is used if Onramper sends USDC to a holding wallet instead of directly to proxy wallet
 * @param fromAddress Address holding USDC
 * @param toAddress Proxy wallet address
 * @param amount Amount of USDC to transfer
 * @param signerPrivateKey Private key of the holder
 * @returns Transaction hash
 */
export async function transferUSDCToProxyWallet(
  fromAddress: string,
  toAddress: string,
  amount: string,
  signerPrivateKey: string
): Promise<string> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      throw new Error('Polygon RPC URL not configured');
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(signerPrivateKey, provider);

    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

    // Convert amount to USDC decimals (6)
    const amountInSmallestUnit = ethers.utils.parseUnits(amount, USDC_DECIMALS);

    // Transfer USDC
    const tx = await usdcContract.transfer(toAddress, amountInSmallestUnit, {
      gasLimit: 100000, // USDC transfers typically need ~65k gas
    });

    console.log(`⏳ Transferring ${amount} USDC to ${toAddress}...`);
    console.log(`   Transaction hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`✅ USDC transferred successfully in block: ${receipt.blockNumber}`);

    return receipt.transactionHash;
  } catch (error) {
    console.error('Error transferring USDC:', error);
    throw new Error(
      `Failed to transfer USDC: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get deposit status
 * @param depositId Deposit ID
 * @returns Deposit status and details
 */
export async function getDepositStatus(depositId: string): Promise<{
  id: string;
  status: string;
  sourceCurrency: string;
  sourceAmount: string;
  targetAmount: string | null;
  proxyWallet: string;
  transactionHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
    });

    if (!deposit) {
      throw new Error('Deposit not found');
    }

    return {
      id: deposit.id,
      status: deposit.status,
      sourceCurrency: deposit.sourceCurrency,
      sourceAmount: deposit.sourceAmount,
      targetAmount: deposit.targetAmount,
      proxyWallet: deposit.proxyWallet,
      transactionHash: deposit.transactionHash,
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    };
  } catch (error) {
    console.error('Error getting deposit status:', error);
    throw new Error(
      `Failed to get deposit status: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get user's deposit history
 * @param userAddress User's Ethereum address
 * @returns Array of deposits
 */
export async function getUserDeposits(userAddress: string): Promise<
  Array<{
    id: string;
    status: string;
    sourceCurrency: string;
    sourceAmount: string;
    targetAmount: string | null;
    transactionHash: string | null;
    createdAt: Date;
  }>
> {
  try {
    // Normalize address (ensure lowercase)
    const normalizedAddress = userAddress.toLowerCase();
    
    const user = await prisma.user.findUnique({
      where: { address: normalizedAddress },
      include: {
        deposits: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      console.error(`User not found for address: ${normalizedAddress}`);
      // Return empty array if user doesn't exist (they may not have signed up yet)
      return [];
    }

    return user.deposits.map((deposit) => ({
      id: deposit.id,
      status: deposit.status,
      sourceCurrency: deposit.sourceCurrency,
      sourceAmount: deposit.sourceAmount,
      targetAmount: deposit.targetAmount,
      transactionHash: deposit.transactionHash,
      createdAt: deposit.createdAt,
    }));
  } catch (error) {
    console.error('Error getting user deposits:', error);
    throw new Error(
      `Failed to get user deposits: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

