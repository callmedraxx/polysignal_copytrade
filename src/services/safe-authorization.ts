import { ethers } from 'ethers';
import { config } from '../config/env';
import { getSafeInstance } from './wallet';

export interface AuthorizationTransaction {
  to: string;
  value: string;
  data: string;
  safeTxGas?: string;
  baseGas?: string;
  gasPrice?: string;
  gasToken?: string;
  refundReceiver?: string;
  nonce?: number;
}

/**
 * Create an authorization transaction for copy trading
 * This adds the relayer as an owner of the Safe wallet, allowing it to execute trades
 * 
 * Note: User will sign this transaction in the frontend using Protocol Kit
 */
export async function createAuthorizationTransaction(
  safeAddress: string,
  relayerAddress: string
): Promise<AuthorizationTransaction> {
  try {
    // Safe contract ABI for addOwnerWithThreshold
    // This adds the relayer as an owner with threshold 1
    // Threshold 1 means only 1 signature needed (either user or relayer can sign)
    const safeAbi = [
      'function addOwnerWithThreshold(address owner, uint256 _threshold) external'
    ];
    
    const safeInterface = new ethers.utils.Interface(safeAbi);
    
    // Normalize addresses
    const normalizedSafeAddress = ethers.utils.getAddress(safeAddress);
    const normalizedRelayerAddress = ethers.utils.getAddress(relayerAddress);
    
    // Create transaction data to add relayer as owner
    // Threshold stays at 1 (user + relayer = 2 owners, but threshold 1 means either can sign)
    // This allows relayer to execute transactions without user signature
    const threshold = 1;
    
    const transactionData = safeInterface.encodeFunctionData('addOwnerWithThreshold', [
      normalizedRelayerAddress,
      threshold,
    ]);

    console.log(`📝 Creating authorization transaction:`);
    console.log(`   Safe: ${normalizedSafeAddress}`);
    console.log(`   Adding relayer as owner: ${normalizedRelayerAddress}`);
    console.log(`   Threshold: ${threshold}`);

    return {
      to: normalizedSafeAddress,
      value: '0',
      data: transactionData,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: ethers.constants.AddressZero,
      refundReceiver: ethers.constants.AddressZero,
    };
  } catch (error) {
    console.error('Error creating authorization transaction:', error);
    throw new Error(
      `Failed to create authorization transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Submit authorization transaction to Safe Transaction Service
 */
export async function submitAuthorizationTransaction(
  safeAddress: string,
  signedTransaction: any
): Promise<string> {
  try {
    const txServiceUrl = config.safe.transactionServiceUrl;
    const url = `${txServiceUrl}/api/v1/safes/${safeAddress}/multisig-transactions/`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signedTransaction),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Safe Transaction Service error: ${JSON.stringify(error)}`);
    }

    const result = await response.json();
    return result.safeTxHash || result.txHash;
  } catch (error) {
    console.error('Error submitting authorization transaction:', error);
    throw error;
  }
}

/**
 * Get transaction status from Safe Transaction Service
 */
export async function getTransactionStatus(
  safeTxHash: string
): Promise<{
  txHash?: string;
  isExecuted: boolean;
  isSuccessful?: boolean;
  confirmations: number;
}> {
  try {
    const txServiceUrl = config.safe.transactionServiceUrl;
    const url = `${txServiceUrl}/api/v1/multisig-transactions/${safeTxHash}/`;

    console.log(`🔍 Checking transaction status: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Safe Transaction Service error (${response.status}): ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    
    return {
      txHash: data.txHash,
      isExecuted: data.isExecuted || false,
      isSuccessful: data.isSuccessful,
      confirmations: data.confirmations?.length || 0,
    };
  } catch (error: any) {
    console.error('Error getting transaction status:', error);
    
    // Provide helpful error message for DNS/network errors
    if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo')) {
      throw new Error(
        `Cannot reach Safe Transaction Service at ${config.safe.transactionServiceUrl}. ` +
        `Please check your network connection and verify SAFE_TRANSACTION_SERVICE_URL in your .env file. ` +
        `For Polygon, use: https://safe-transaction.polygon.gnosis.io`
      );
    }
    
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      throw new Error(
        `Safe Transaction Service request timed out. The service may be slow or unreachable. ` +
        `URL: ${config.safe.transactionServiceUrl}`
      );
    }
    
    throw error;
  }
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransactionConfirmation(
  safeTxHash: string,
  timeout: number = 60000
): Promise<{
  txHash: string;
  isSuccessful: boolean;
}> {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds

  while (Date.now() - startTime < timeout) {
    try {
      const status = await getTransactionStatus(safeTxHash);
      
      if (status.isExecuted && status.txHash) {
        return {
          txHash: status.txHash,
          isSuccessful: status.isSuccessful ?? true,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Error polling transaction status:', error);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
}

/**
 * Execute a signed Safe transaction from the backend
 * This function reconstructs the transaction from the signed data and executes it
 * using the Safe SDK with the owner's private key
 * 
 * @param safeAddress The Safe wallet address
 * @param ownerPrivateKey Private key of the Safe owner (must be an owner of the Safe)
 * @param signedTransaction The signed transaction data from frontend
 * @returns Transaction receipt
 */
export async function executeSignedSafeTransaction(
  safeAddress: string,
  ownerPrivateKey: string,
  signedTransaction: any
): Promise<ethers.ContractReceipt> {
  try {
    const { getSafeInstance } = await import('./wallet');
    const protocolKit = await getSafeInstance(safeAddress, ownerPrivateKey);

    // Reconstruct the Safe transaction from signed data
    // The signedTransaction should contain the transaction data and signatures
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: signedTransaction.to || signedTransaction.signedTx?.to,
        value: signedTransaction.value || signedTransaction.signedTx?.value || '0',
        data: signedTransaction.data || signedTransaction.signedTx?.data || '0x',
      }],
    });

    // Add the signature from the frontend
    if (signedTransaction.signatures || signedTransaction.signedTx?.signatures) {
      const signatures = signedTransaction.signatures || signedTransaction.signedTx.signatures;
      
      // Add signatures to the transaction
      // Protocol Kit v6 uses addSignature method
      if (protocolKit.addSignature) {
        for (const [signer, signature] of Object.entries(signatures)) {
          await protocolKit.addSignature(safeTransaction, signature as string);
        }
      } else {
        // Fallback: merge signatures
        safeTransaction.signatures = {
          ...safeTransaction.signatures,
          ...signatures,
        };
      }
    }

    // Execute the transaction
    console.log('⏳ Executing signed Safe transaction from backend...');
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    const receipt = await txResponse.wait();
    
    console.log(`✅ Transaction executed successfully: ${receipt.transactionHash}`);
    return receipt;
  } catch (error: any) {
    console.error('Error executing signed Safe transaction:', error);
    
    // Provide helpful error messages
    if (error.message?.includes('GS013')) {
      throw new Error(
        'GS013: Not enough valid signatures. ' +
        'This Safe requires multiple signatures or the transaction is invalid. ' +
        'Please ensure the Safe has threshold 1, or use the propose/confirm flow for multi-sig Safes.'
      );
    }
    
    throw new Error(
      `Failed to execute Safe transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

