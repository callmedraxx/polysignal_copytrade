import { ethers } from 'ethers';
import { Interface } from 'ethers/lib/utils';
import { OperationType, SafeTransaction } from '@polymarket/builder-relayer-client';
import { createRelayerClientForUser, getExpectedSafeAddress, deriveWalletForUser } from './relayer-client';
import { getUserLogger } from '../utils/user-logger';
// Protocol Kit v6 - try to import, fallback to old SDK if not installed
let Safe: any;

try {
  const protocolKit = require('@safe-global/protocol-kit');
  Safe = protocolKit.default || protocolKit.Safe;
} catch (error) {
  console.error('⚠️ Protocol Kit not installed. Please run: npm install @safe-global/protocol-kit@^6.1.1 --legacy-peer-deps');
  throw new Error(
    'Protocol Kit is required but not installed. ' +
    'Please install it: npm install @safe-global/protocol-kit@^6.1.1 --legacy-peer-deps\n' +
    'If you encounter disk space issues, try: npm cache clean --force && npm install @safe-global/protocol-kit@^6.1.1 --legacy-peer-deps'
  );
}

import { config } from '../config/env';


// Polygon network configuration for Safe
const POLYGON_CHAIN_ID = 137;

// ERC20 approval interface for token approvals
const erc20Interface = new Interface([
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"},
      {"name": "_spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
]);

/**
 * Creates a USDC approval transaction for the Conditional Token Framework (CTF)
 * @param usdcAddress The USDC token address
 * @param ctfAddress The Conditional Token Framework address (spender)
 * @returns SafeTransaction for approval
 */
function createUSDCApprovalTransaction(
  usdcAddress: string,
  ctfAddress: string
): SafeTransaction {
  return {
    to: usdcAddress,
    operation: OperationType.Call,
    data: erc20Interface.encodeFunctionData("approve", [
      ctfAddress,
      ethers.constants.MaxUint256
    ]),
    value: "0"
  };
}

/**
 * Checks the current USDC allowance for CTF
 * @param safeAddress The Safe wallet address
 * @returns The current allowance amount (as BigNumber)
 */
export async function checkUSDCAllowance(safeAddress: string): Promise<ethers.BigNumber> {
  const usdcAddress = config.blockchain.usdcAddress;
  const ctfAddress = config.blockchain.ctfAddress;
  const rpcUrl = config.blockchain.polygonRpcUrl;
  
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const usdcContract = new ethers.Contract(usdcAddress, erc20Interface, provider);
  
  const allowance = await usdcContract.allowance(safeAddress, ctfAddress);
  return allowance;
}

/**
 * Revokes USDC approval for CTF (sets allowance to 0)
 * Uses the user's RelayerClient (derived wallet) for gasless execution
 * @param userAddress The user's Ethereum address
 * @param safeAddress The Safe wallet address
 * @returns Transaction hash if successful
 */
export async function revokeUSDCApproval(
  userAddress: string,
  safeAddress: string
): Promise<string> {
  const relayerClient = createRelayerClientForUser(userAddress);
  try {
    const usdcAddress = config.blockchain.usdcAddress;
    const ctfAddress = config.blockchain.ctfAddress;
    
    console.log(`🔒 Revoking USDC approval for CTF...`);
    console.log(`   Safe Address: ${safeAddress}`);
    
    // Create revoke transaction (approve with 0)
    const revokeTx: SafeTransaction = {
      to: usdcAddress,
      operation: OperationType.Call,
      data: erc20Interface.encodeFunctionData("approve", [ctfAddress, "0"]),
      value: "0"
    };
    
    // Execute via RelayerClient (gasless)
    const response = await relayerClient.execute([revokeTx], "Revoke USDC approval for CTF");
    
    const result = await response.wait();
    
    if (result && result.transactionHash) {
      console.log(`✅ USDC approval revoked!`);
      console.log(`   Transaction Hash: ${result.transactionHash}`);
      return result.transactionHash;
    }
    
    throw new Error('Revoke transaction completed but no transaction hash returned');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`⚠️ Failed to revoke USDC approval:`, errorMessage);
    throw new Error(`Failed to revoke USDC approval: ${errorMessage}`);
  }
}

/**
 * Approves USDC spending for the Conditional Token Framework (CTF)
 * This enables the Safe wallet to trade on Polymarket
 * 
 * ⚠️ SECURITY NOTE: This sets unlimited approval (MaxUint256)
 * - The CTF can spend ALL USDC in the Safe wallet
 * - This is limited by the actual USDC balance (not infinite)
 * - Standard practice in DeFi, but carries risk if CTF is compromised
 * - Users can revoke approval using revokeUSDCApproval() if needed
 * 
 * @param relayerClient The RelayerClient instance for the user
 * @param safeAddress The Safe wallet address (for logging)
 * @returns Transaction hash if successful, null if already approved or failed
 */
async function approveUSDCForCTF(
  relayerClient: any,
  safeAddress: string
): Promise<string | null> {
  try {
    const usdcAddress = config.blockchain.usdcAddress;
    const ctfAddress = config.blockchain.ctfAddress;
    
    // Check current allowance first
    const currentAllowance = await checkUSDCAllowance(safeAddress);
    const maxUint256 = ethers.constants.MaxUint256;
    
    // If already has unlimited approval, skip
    // Check if allowance is effectively unlimited (>= half of MaxUint256 or >= a very large amount)
    const isUnlimited = currentAllowance.gte(maxUint256.div(2)) || 
                        currentAllowance.gte(ethers.BigNumber.from(10).pow(30)); // 1 billion USDC (effectively unlimited)
    
    if (isUnlimited) {
      console.log(`ℹ️ USDC already has unlimited approval for CTF. Current allowance: ${ethers.utils.formatUnits(currentAllowance, 6)} USDC`);
      console.log(`   Skipping approval transaction.`);
      return null;
    }
    
    // If allowance is > 0 but not unlimited, log it but still approve to unlimited
    if (currentAllowance.gt(0)) {
      console.log(`ℹ️ USDC has existing approval: ${ethers.utils.formatUnits(currentAllowance, 6)} USDC`);
      console.log(`   Upgrading to unlimited approval for better UX.`);
    }
    
    console.log(`💰 Approving USDC for CTF...`);
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   USDC Address: ${usdcAddress}`);
    console.log(`   CTF Address: ${ctfAddress}`);
    console.log(`   Current Allowance: ${ethers.utils.formatUnits(currentAllowance, 6)} USDC`);
    console.log(`   ⚠️ Setting to: Unlimited (MaxUint256)`);
    console.log(`   ⚠️ This allows CTF to spend ALL USDC in Safe wallet`);
    
    // Create approval transaction
    const approvalTx = createUSDCApprovalTransaction(usdcAddress, ctfAddress);
    
    // Execute via RelayerClient (gasless)
    const response = await relayerClient.execute([approvalTx], "Approve USDC for CTF");
    
    // Wait for transaction confirmation
    const result = await response.wait();
    
    if (result && result.transactionHash) {
      console.log(`✅ USDC approval completed!`);
      console.log(`   Transaction Hash: ${result.transactionHash}`);
      console.log(`   ⚠️ CTF can now spend all USDC in Safe wallet`);
      return result.transactionHash;
    }
    
    console.log(`⚠️ USDC approval completed but no transaction hash returned`);
    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's already approved (some tokens revert if already approved)
    if (errorMessage.includes('already approved') || errorMessage.includes('approval exists')) {
      console.log(`ℹ️ USDC already approved for CTF. Skipping.`);
      return null;
    }
    
    // Log error but don't throw - approval failure shouldn't block Safe deployment
    console.error(`⚠️ Failed to approve USDC for CTF:`, errorMessage);
    console.log(`   Safe deployment succeeded, but USDC approval failed.`);
    console.log(`   User can approve USDC manually later if needed.`);
    return null;
  }
}


/**
 * Adds owners to an existing Safe wallet
 * @param safeAddress The Safe wallet address
 * @param owners Array of owner addresses to add
 * @param derivedWalletPrivateKey Private key of the derived wallet (current owner)
 * @returns Transaction hash
 * @internal - Function kept for future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _addOwnersToSafe(
  safeAddress: string,
  owners: string[],
  derivedWalletPrivateKey: string
): Promise<string> {
  const rpcUrl = config.blockchain.polygonRpcUrl;
  
  // Initialize Protocol Kit with existing Safe
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: derivedWalletPrivateKey,
    safeAddress: ethers.utils.getAddress(safeAddress.toLowerCase()),
  });

  // Get current owners
  const currentOwners = await protocolKit.getOwners();
  console.log(`📋 Current Safe owners: ${currentOwners.join(', ')}`);

  // Filter out owners that already exist
  const newOwners = owners.filter(owner => {
    const normalizedOwner = ethers.utils.getAddress(owner.toLowerCase());
    return !currentOwners.some((existing: string) => 
      existing.toLowerCase() === normalizedOwner.toLowerCase()
    );
  });

  if (newOwners.length === 0) {
    console.log(`✅ All owners already exist in Safe. No changes needed.`);
    return '0x'; // No transaction needed
  }

  console.log(`➕ Adding new owners: ${newOwners.join(', ')}`);

  // Create addOwner transactions for each new owner (unused - kept for future use)
  const _transactions = newOwners.map(owner => ({
    to: safeAddress,
    value: '0',
    data: protocolKit.getContractManager().encode('addOwnerWithThreshold', [
      ethers.utils.getAddress(owner.toLowerCase()),
      currentOwners.length + 1, // New threshold (all owners must sign)
    ]),
  }));
  void _transactions; // Mark as intentionally unused

  // For multiple owners, we need to use a batch transaction
  // Actually, Safe requires us to add owners one by one and update threshold
  // Let's use the Safe SDK's addOwner method properly
  
  // Get the Safe contract interface
  const safeContract = protocolKit.getContractManager().safeContract;
  
  // Create transaction to add owner
  // We'll add owners sequentially, updating threshold each time
  let txHash = '';
  
  for (let i = 0; i < newOwners.length; i++) {
    const owner = ethers.utils.getAddress(newOwners[i].toLowerCase());
    const newThreshold = currentOwners.length + i + 1; // Increment threshold
    
    console.log(`   Adding owner ${i + 1}/${newOwners.length}: ${owner}`);
    console.log(`   New threshold: ${newThreshold}`);
    
    // Create addOwnerWithThreshold transaction
    const addOwnerTx = await protocolKit.createTransaction({
      safeTransactionData: {
        to: safeAddress,
        value: '0',
        data: safeContract.encode('addOwnerWithThreshold', [owner, newThreshold]),
      },
    });
    
    // Sign the transaction
    const signedTx = await protocolKit.signTransaction(addOwnerTx);
    
    // Execute via RelayerClient (gasless)
    const relayerClient = createRelayerClientForUser(owner); // Use any user address, we just need the client
    const response = await relayerClient.execute([{
      to: safeAddress,
      value: '0',
      data: signedTx.data,
      operation: 0, // Call operation
    }]);
    
    const result = await response.wait();
    txHash = result?.transactionHash || txHash;
    
    console.log(`   ✅ Owner added. Transaction: ${result?.transactionHash}`);
  }

  return txHash;
}

/**
 * Create a Safe proxy wallet using Polymarket Builder Program relayer (gasless)
 * Uses Polymarket's relayer at https://relayer-v2.polymarket.com/
 * Reference: https://docs.polymarket.com/developers/builders/relayer-client
 */
async function createProxyWalletViaRelayer(ownerAddress: string): Promise<string> {
  // Normalize owner address
  const normalizedOwnerAddress = ethers.utils.getAddress(ownerAddress.toLowerCase());
  const userLogger = getUserLogger(ownerAddress);
  
  console.log(`🚀 Creating Safe wallet via Polymarket relayer (gasless)...`);
  console.log(`   User address: ${normalizedOwnerAddress}`);
  console.log(`   Using HD wallet derivation for unique Safe deployment`);

  userLogger.info('SAFE_DEPLOYMENT', 'Initiating Safe wallet deployment via Polymarket relayer');

  // Derive wallet for this user
  const derivedWallet = deriveWalletForUser(normalizedOwnerAddress);
  
  // Create a RelayerClient instance dynamically for this user
  const relayerClient = createRelayerClientForUser(normalizedOwnerAddress);
  
  try {
    // Deploy Safe using the derived wallet
    // Note: If Safe is already deployed, relayer will return the existing Safe address
    const response = await relayerClient.deploy();
    
    // Wait for transaction confirmation
    const result = await response.wait();
    console.log('Deployment result:', result);

    if (!result) {
      throw new Error('Safe deployment failed - no result returned from relayer');
    }

    const safeAddress = result.proxyAddress;
    const transactionHash = result.transactionHash;

    if (!safeAddress) {
      throw new Error(`Safe deployment completed but no Safe address returned. Transaction: ${transactionHash}`);
    }

    // Verify the Safe is actually deployed on-chain
    // The relayer might report success but the deployment could have failed
    const rpcUrl = config.blockchain.polygonRpcUrl;
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const code = await provider.getCode(safeAddress);
    
    if (!code || code === '0x' || code === '0x0') {
      console.error(`❌ CRITICAL: Relayer reports Safe deployed, but it's NOT on-chain!`);
      console.error(`   Reported address: ${safeAddress}`);
      console.error(`   Transaction: ${transactionHash}`);
      console.error(`   State: ${result.state || 'UNKNOWN'}`);
      throw new Error(
        `Safe deployment verification failed: Relayer reports deployment at ${safeAddress}, ` +
        `but Safe is not deployed on-chain. Transaction: ${transactionHash}. ` +
        `This will cause "invalid signature" errors. Please check the transaction status.`
      );
    }

    console.log(`✅ Safe wallet deployed successfully via Polymarket relayer!`);
    console.log(`   Safe Address: ${safeAddress}`);
    console.log(`   Transaction Hash: ${transactionHash}`);
    console.log(`   State: ${result.state || 'CONFIRMED'}`);
    console.log(`   ✅ Verified: Safe is deployed on-chain`);

    // Add owners after deployment
    await ensureSafeOwners(safeAddress, normalizedOwnerAddress, derivedWallet.privateKey);

    // Approve USDC for CTF to enable trading
    await approveUSDCForCTF(relayerClient, safeAddress);

    return safeAddress;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Handle "safe already deployed" error gracefully
    if (errorMessage.includes('SAFE_DEPLOYED') || errorMessage.includes('safe already deployed')) {
      console.log(`ℹ️ Relayer reports Safe already deployed for this account.`);
      
      // IMPORTANT: The relayer uses its own Safe deployment configuration
      // The deployed address may NOT match our predicted address
      // We need to use the relayer's getExpectedSafe() method to get the actual address
      
      let actualSafeAddress: string | null = null;
      
      // Step 1: Try to get the Safe address from the relayer's getExpectedSafe() method
      // This is the address the relayer knows about and expects
      try {
        console.log(`   🔍 Querying relayer for expected Safe address...`);
        const relayerExpectedSafe = await (relayerClient as any).getExpectedSafe();
        console.log(`   📍 Relayer's expected Safe address: ${relayerExpectedSafe}`);
        
        // Verify this address is deployed on-chain
        const rpcUrl = config.blockchain.polygonRpcUrl;
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const code = await provider.getCode(relayerExpectedSafe);
        
        if (code !== '0x' && code !== '0x0') {
          actualSafeAddress = relayerExpectedSafe;
          console.log(`   ✅ Relayer's expected Safe address is deployed on-chain!`);
        } else {
          console.log(`   ⚠️  Relayer's expected Safe address is NOT deployed on-chain`);
          console.log(`   💡 This might indicate a mismatch between relayer state and on-chain state`);
        }
      } catch (relayerError) {
        const relayerErrorMessage = relayerError instanceof Error ? relayerError.message : 'Unknown error';
        console.log(`   ⚠️  Could not get expected Safe from relayer: ${relayerErrorMessage}`);
      }
      
      // Step 2: If relayer's expected Safe is not deployed, try to find it from transaction history
      if (!actualSafeAddress) {
        try {
          console.log(`   🔄 Querying relayer transactions for Safe deployment...`);
          const transactions = await relayerClient.getTransactions();
          
          // Find the most recent SAFE-CREATE transaction
          const safeCreateTx = transactions
            .filter((tx: any) => tx.type === 'SAFE-CREATE' || tx.type === 'SAFE_CREATE')
            .sort((a: any, b: any) => {
              // Sort by creation date, most recent first
              const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return dateB - dateA;
            })[0];
          
          if (safeCreateTx && safeCreateTx.proxyAddress) {
            actualSafeAddress = safeCreateTx.proxyAddress;
            console.log(`   ✅ Found Safe deployment transaction in relayer history`);
            console.log(`   ✅ Actual Safe address from relayer: ${actualSafeAddress}`);
            console.log(`   Transaction ID: ${safeCreateTx.transactionID || 'N/A'}`);
            console.log(`   Transaction Hash: ${safeCreateTx.transactionHash || 'N/A'}`);
            console.log(`   State: ${safeCreateTx.state || 'N/A'}`);
          } else {
            console.log(`   ⚠️  No SAFE-CREATE transaction found in relayer history`);
          }
        } catch (queryError) {
          const queryErrorMessage = queryError instanceof Error ? queryError.message : 'Unknown error';
          console.log(`   ⚠️  Could not query relayer transactions: ${queryErrorMessage}`);
        }
      }
      
      // Step 3: If still no address, try our own prediction as a last resort
      if (!actualSafeAddress) {
        try {
          console.log(`   💡 Trying our own Safe address prediction as fallback...`);
          const expectedSafeAddress = await getExpectedSafeAddress(derivedWallet);
          console.log(`   Predicted Safe address: ${expectedSafeAddress}`);
          
          // Check if predicted address is deployed
          const rpcUrl = config.blockchain.polygonRpcUrl;
          const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
          const code = await provider.getCode(expectedSafeAddress);
          
          if (code !== '0x' && code !== '0x0') {
            actualSafeAddress = expectedSafeAddress;
            console.log(`   ✅ Predicted address is deployed on-chain`);
          } else {
            console.log(`   ⚠️  Predicted address is NOT deployed on-chain`);
          }
        } catch (predictionError) {
          console.error(`   ❌ Could not determine Safe address: ${predictionError instanceof Error ? predictionError.message : 'Unknown error'}`);
        }
      }
      
      // Step 4: Check if error object contains the Safe address
      if (!actualSafeAddress && error instanceof Error && 'safeAddress' in error) {
        actualSafeAddress = (error as any).safeAddress;
        console.log(`   ✅ Found Safe address in error object: ${actualSafeAddress}`);
      }
      
      if (!actualSafeAddress) {
        throw new Error('Safe already deployed but could not determine address. Please check RelayerClient.');
      }
      
      // Verify the Safe is actually deployed on-chain at the actual address
      const rpcUrl = config.blockchain.polygonRpcUrl;
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const code = await provider.getCode(actualSafeAddress);
      
      if (!code || code === '0x' || code === '0x0') {
        console.error(`❌ CRITICAL: Relayer says Safe is deployed, but it's NOT on-chain!`);
        console.error(`   Address checked: ${actualSafeAddress}`);
        console.error(`   This will cause "invalid signature" errors when trading.`);
        throw new Error(
          `Safe deployment issue: Relayer reports "already deployed" but Safe is not on-chain at ${actualSafeAddress}. ` +
          `Please check the relayer status or try redeploying.`
        );
      }
      
      // Safe is actually deployed - proceed normally
      console.log(`✅ Verified: Safe is deployed on-chain at ${actualSafeAddress}`);
      
      // Verify that the derived wallet is an owner of this Safe
      try {
        const rpcUrl = config.blockchain.polygonRpcUrl;
        const protocolKit = await Safe.init({
          provider: rpcUrl,
          safeAddress: ethers.utils.getAddress(actualSafeAddress.toLowerCase()),
        });
        const owners = await protocolKit.getOwners();
        const derivedWalletAddress = derivedWallet.address.toLowerCase();
        const isOwner = owners.some((owner: string) => owner.toLowerCase() === derivedWalletAddress);
        
        if (isOwner) {
        } else {
          console.warn(`⚠️  WARNING: Derived wallet ${derivedWalletAddress} is NOT an owner of Safe ${actualSafeAddress}`);
          console.warn(`   Safe owners: ${owners.map((o: string) => o.toLowerCase()).join(', ')}`);
          console.warn(`   This might cause "invalid signature" errors. The Safe may have been deployed with different configuration.`);
        }
      } catch (ownerCheckError) {
        console.warn(`⚠️  Could not verify Safe owners: ${ownerCheckError instanceof Error ? ownerCheckError.message : 'Unknown error'}`);
      }
      
      // Verify owners and add if needed (but don't fail if this errors)
      await ensureSafeOwners(actualSafeAddress, normalizedOwnerAddress, derivedWallet.privateKey);
      
      // Skip USDC approval if Safe already exists - it should have been approved during initial deployment
      // Only approve if explicitly needed (e.g., user revoked approval)
      console.log(`ℹ️ Safe already exists. Skipping USDC approval (should already be approved from initial deployment).`);
      console.log(`   If approval is needed, it will be checked and set when trades are executed.`);
      
      return actualSafeAddress;
    }
    
    if (errorMessage.includes('HD_WALLET_MNEMONIC')) {
      throw new Error(errorMessage);
    }
    
    throw new Error(
      `Failed to deploy Safe wallet via Polymarket relayer: ${errorMessage}. ` +
      `Make sure POLY_BUILDER_API_KEY, POLY_BUILDER_SECRET, and POLY_BUILDER_PASSPHRASE are set correctly.`
    );
  }
}

/**
 * Ensures that the Safe has the correct owners (user + deployer)
 * @param safeAddress The Safe wallet address
 * @param userAddress The user's address
 * @param derivedWalletPrivateKey Private key of the derived wallet (current owner)
 */
async function ensureSafeOwners(
  safeAddress: string,
  userAddress: string,
  derivedWalletPrivateKey: string
): Promise<void> {
  try {
    // Verify it's not the singleton address
    const SAFE_SINGLETON_ADDRESS = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E';
    if (safeAddress.toLowerCase() === SAFE_SINGLETON_ADDRESS.toLowerCase()) {
      console.log(`⚠️ Address is Safe singleton, not a deployed proxy. Skipping owner addition.`);
      return;
    }
    
    const rpcUrl = config.blockchain.polygonRpcUrl;
    
    // Verify Safe is actually deployed (has code)
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const code = await provider.getCode(safeAddress);
    if (!code || code === '0x' || code === '0x0') {
      console.log(`⚠️ Safe not deployed at ${safeAddress}. Skipping owner addition.`);
      return;
    }
    
    // Initialize Protocol Kit with existing Safe
    const protocolKit = await Safe.init({
      provider: rpcUrl,
      signer: derivedWalletPrivateKey,
      safeAddress: ethers.utils.getAddress(safeAddress.toLowerCase()),
    });

    // Get current owners - wrap in try-catch in case Safe isn't properly initialized
    let currentOwners: string[];
    try {
      currentOwners = await protocolKit.getOwners();
      console.log(`📋 Current Safe owners: ${currentOwners.join(', ')}`);
    } catch (error: any) {
      console.log(`⚠️ Could not read Safe owners. Error: ${error.message}`);
      console.log(`   Safe may not be properly initialized. Skipping owner addition.`);
      return;
    }

    // Prepare owners list: user + deployer (if configured)
    const desiredOwners: string[] = [ethers.utils.getAddress(userAddress.toLowerCase())];
    
    // Add deployer as co-owner if configured
    const deployerPrivateKey = config.blockchain.deployerPrivateKey;
    if (deployerPrivateKey && deployerPrivateKey.trim() !== '' && deployerPrivateKey !== '0x...') {
      const deployerWallet = new ethers.Wallet(deployerPrivateKey);
      const deployerAddress = ethers.utils.getAddress(deployerWallet.address.toLowerCase());
      
      // Only add if different from user
      if (deployerAddress.toLowerCase() !== userAddress.toLowerCase()) {
        desiredOwners.push(deployerAddress);
      }
    }

    // Check which owners need to be added
    const ownersToAdd = desiredOwners.filter(owner => {
      const normalizedOwner = ethers.utils.getAddress(owner.toLowerCase());
      return !currentOwners.some((existing: string) => 
        existing.toLowerCase() === normalizedOwner.toLowerCase()
      );
    });

    if (ownersToAdd.length === 0) {
      console.log(`✅ Safe already has correct owners. No changes needed.`);
      return;
    }

    console.log(`➕ Adding owners to Safe: ${ownersToAdd.join(', ')}`);
    
    // Add owners via RelayerClient (gasless)
    // We'll use the Safe SDK to create the transaction, then execute via relayer
    const relayerClient = createRelayerClientForUser(userAddress);


    
    // For each owner to add, create an addOwner transaction
    for (const ownerToAdd of ownersToAdd) {
      const normalizedOwner = ethers.utils.getAddress(ownerToAdd.toLowerCase());
      const newThreshold = 1; // Keep threshold at 1 (single signature required)
      
      console.log(`   Adding owner: ${normalizedOwner}`);
      console.log(`   New threshold: ${newThreshold}`);
      
      try {
        // Get the Safe contract interface
        const contractManager = protocolKit.getContractManager();
        if (!contractManager || !contractManager.safeContract) {
          throw new Error('Safe contract manager not available');
        }
        
        const safeContract = contractManager.safeContract;
        
        // Create the addOwnerWithThreshold transaction data
        const addOwnerData = safeContract.encode('addOwnerWithThreshold', [
          normalizedOwner,
          newThreshold,
        ]);
        
        // Create Safe transaction using the correct format for Protocol Kit v6
        // Protocol Kit v6 expects 'transactions' (array), not 'safeTransactionData'
        const safeTransactionData = {
          to: safeAddress,
          value: '0',
          data: addOwnerData,
          operation: 0 as const, // Call operation
        };
        
        const safeTx = await protocolKit.createTransaction({
          transactions: [safeTransactionData], // Must be an array
        });
        
        // Sign transaction with derived wallet
        const signedTx = await protocolKit.signTransaction(safeTx);
        
        // Get the signed transaction data - Protocol Kit v6 stores it in signedTx.data
        // If that's not available, use the original encoded data
        let txData: string;
        
        if (signedTx && signedTx.data) {
          // Try to get data from signed transaction
          if (typeof signedTx.data === 'string') {
            txData = signedTx.data;
          } else if (signedTx.data.data && typeof signedTx.data.data === 'string') {
            txData = signedTx.data.data;
          } else {
            // Fallback to original encoded data
            txData = addOwnerData;
          }
        } else {
          // Fallback to original encoded data if signedTx doesn't have data
          txData = addOwnerData;
        }
        
        // Execute via RelayerClient
        const response = await relayerClient.execute([{
          to: safeAddress,
          value: '0',
          data: txData,
          operation: 0, // Call operation
        }]);
        
        const result = await response.wait();
        console.log(`   ✅ Owner added. Transaction: ${result?.transactionHash}`);
        
        // Update current owners list for next iteration
        currentOwners.push(normalizedOwner);
      } catch (txError) {
        console.error(`   ❌ Failed to add owner ${normalizedOwner}:`, txError instanceof Error ? txError.message : 'Unknown error');
        console.error(`   Error details:`, txError);
        // Re-throw to be caught by outer catch block
        throw txError;
      }
    }

    console.log(`✅ All owners added successfully!`);
  } catch (error) {
    console.error('⚠️ Error adding owners to Safe:', error);
    // Don't throw - owner addition is not critical for deployment
    console.log('   Safe deployment succeeded, but owner addition failed.');
    console.log('   Owners can be added later via manual transaction.');
  }
}

/**
 * Create a Safe proxy wallet on Polygon for a user using Polymarket Builder Program relayer (gasless)
 * Uses HD wallet derivation to create unique Safe wallets for each user
 * Automatically adds user and deployer as owners after deployment
 * @param ownerAddress The Ethereum address that will own the Safe
 * @returns The address of the created Safe wallet
 */
export async function createProxyWallet(ownerAddress: string): Promise<string> {
  // Check if builder credentials are configured
  const useRelayer = 
    config.polymarket.builder.apiKey && 
    config.polymarket.builder.secret && 
    config.polymarket.builder.passphrase;
  
  if (!useRelayer) {
    throw new Error(
      'Polymarket builder credentials not configured. ' +
      'Please set POLY_BUILDER_API_KEY, POLY_BUILDER_SECRET, and POLY_BUILDER_PASSPHRASE in your .env file. ' +
      'Direct deployment fallback has been removed. Only gasless deployment via Polymarket relayer is supported.'
    );
  }

  console.log('🎯 Using Polymarket relayer for gasless Safe deployment...');
  return await createProxyWalletViaRelayer(ownerAddress);
}

/**
 * Get Safe instance for an existing Safe wallet
 * Useful for executing transactions on behalf of users
 * @param safeAddress The address of the Safe wallet
 * @param signerPrivateKey Private key of the Safe owner (must be an owner)
 * @returns Safe Protocol Kit instance
 */
export async function getSafeInstance(
  safeAddress: string,
  signerPrivateKey: string
): Promise<any> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      throw new Error('Polygon RPC URL not configured');
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Verify Polygon network
    const network = await provider.getNetwork();
    if (network.chainId !== POLYGON_CHAIN_ID) {
      throw new Error(`Provider is not connected to Polygon. ChainId: ${network.chainId}, expected: ${POLYGON_CHAIN_ID}`);
    }

    // Configure on-chain analytics for tracking
    const onchainAnalytics = {
      project: 'PolySignal Copy Trading',
      platform: 'Backend',
    };

    // Initialize Protocol Kit with existing Safe address
    const protocolKit = await Safe.init({
      provider: rpcUrl,
      signer: signerPrivateKey,
      safeAddress: ethers.utils.getAddress(safeAddress.toLowerCase()),
      onchainAnalytics, // Enable on-chain tracking for analytics
    });
    
    console.log(`✅ Safe instance initialized for Polygon network (chainId: ${POLYGON_CHAIN_ID})`);

    return protocolKit;
  } catch (error) {
    throw new Error(
      `Failed to get Safe instance: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if an address is an owner of a Safe wallet
 * @param safeAddress The Safe wallet address
 * @param addressToCheck The address to check (e.g., deployer address)
 * @returns True if the address is an owner, false otherwise
 */
export async function isSafeOwner(
  safeAddress: string,
  addressToCheck: string
): Promise<boolean> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      throw new Error('Polygon RPC URL not configured');
    }

    // We can use any signer to read owners (read-only operation)
    // Use deployer key or create a read-only provider
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Safe contract ABI for getOwners
    const safeAbi = [
      'function getOwners() external view returns (address[] memory)'
    ];
    
    const safeContract = new ethers.Contract(
      ethers.utils.getAddress(safeAddress),
      safeAbi,
      provider
    );

    const owners = await safeContract.getOwners();
    const normalizedCheckAddress = ethers.utils.getAddress(addressToCheck.toLowerCase());
    
    return owners.some((owner: string) => 
      ethers.utils.getAddress(owner.toLowerCase()) === normalizedCheckAddress
    );
  } catch (error) {
    console.error('Error checking Safe owner:', error);
    throw new Error(
      `Failed to check if address is Safe owner: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get all owners of a Safe wallet
 * @param safeAddress The Safe wallet address
 * @returns Array of owner addresses
 */
export async function getSafeOwners(safeAddress: string): Promise<string[]> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      throw new Error('Polygon RPC URL not configured');
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Safe contract ABI for getOwners
    const safeAbi = [
      'function getOwners() external view returns (address[] memory)'
    ];
    
    const safeContract = new ethers.Contract(
      ethers.utils.getAddress(safeAddress),
      safeAbi,
      provider
    );

    const owners = await safeContract.getOwners();
    return owners.map((owner: string) => ethers.utils.getAddress(owner));
  } catch (error) {
    console.error('Error getting Safe owners:', error);
    throw new Error(
      `Failed to get Safe owners: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if deployer is an owner of a Safe wallet
 * @param safeAddress The Safe wallet address
 * @returns True if deployer is an owner, false otherwise
 */
export async function isDeployerSafeOwner(safeAddress: string): Promise<boolean> {
  try {
    const deployerPrivateKey = config.blockchain.deployerPrivateKey;
    if (!deployerPrivateKey) {
      return false;
    }

    const deployerWallet = new ethers.Wallet(deployerPrivateKey);
    const deployerAddress = deployerWallet.address;

    return await isSafeOwner(safeAddress, deployerAddress);
  } catch (error) {
    console.error('Error checking if deployer is Safe owner:', error);
    return false;
  }
}

/**
 * Predict Safe address for a user before deployment
 * Useful for checking if Safe already exists or showing user their future Safe address
 * @param ownerAddress The Ethereum address that will own the Safe
 * @returns The predicted Safe address (deterministic)
 */
export async function predictSafeAddress(ownerAddress: string): Promise<string> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      throw new Error('Polygon RPC URL not configured');
    }

    const deployerPrivateKey = config.blockchain.deployerPrivateKey;
    if (!deployerPrivateKey) {
      throw new Error('Deployer private key not configured');
    }

    const normalizedOwnerAddress = ethers.utils.getAddress(ownerAddress.toLowerCase());

    // Get relayer address from config (if configured) - same logic as createProxyWallet
    const relayerAddress = config.safe.relayerAddress;
    const owners: string[] = [normalizedOwnerAddress];

    // Add relayer as owner if configured (must match createProxyWallet logic)
    if (relayerAddress && relayerAddress.trim() !== '' && relayerAddress !== '0x...') {
      try {
        const normalizedRelayerAddress = ethers.utils.getAddress(relayerAddress.toLowerCase());
        
        // Ensure relayer is different from user
        if (normalizedRelayerAddress.toLowerCase() !== normalizedOwnerAddress.toLowerCase()) {
          owners.push(normalizedRelayerAddress);
        }
      } catch (error) {
        // Invalid relayer address - use user only
      }
    }

    const safeAccountConfig = {
      owners: owners,
      threshold: 1,
    };

    const predictedSafe = {
      safeAccountConfig,
    };

    // Configure on-chain analytics for tracking
    const onchainAnalytics = {
      project: 'PolySignal Copy Trading',
      platform: 'Backend',
    };

    // Initialize Protocol Kit to predict address
    const protocolKit = await Safe.init({
      provider: rpcUrl,
      signer: deployerPrivateKey,
      predictedSafe,
      onchainAnalytics, // Enable on-chain tracking for analytics
    });

    const predictedAddress = await protocolKit.getAddress();
    return predictedAddress;
  } catch (error) {
    throw new Error(
      `Failed to predict Safe address: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if a Safe wallet exists for a given address
 * @param safeAddress The Safe wallet address to check
 * @returns true if Safe exists, false otherwise
 */
export async function verifyProxyWallet(safeAddress: string): Promise<boolean> {
  try {
    const rpcUrl = config.blockchain.polygonRpcUrl;
    if (!rpcUrl) {
      return false;
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Verify Polygon network
    const network = await provider.getNetwork();
    if (network.chainId !== POLYGON_CHAIN_ID) {
      console.error(`❌ Provider is not connected to Polygon. ChainId: ${network.chainId}, expected: ${POLYGON_CHAIN_ID}`);
      return false;
    }
    
    const code = await provider.getCode(safeAddress);
    return code !== '0x' && code !== '0x0';
  } catch (error) {
    console.error('Error verifying Safe wallet:', error);
    return false;
  }
}

/**
 * Execute a transaction on a Safe wallet
 * Useful for copy trading - execute trades on behalf of users
 * @param safeAddress The Safe wallet address
 * @param ownerPrivateKey Private key of the Safe owner (must be an owner)
 * @param to Destination address
 * @param value Amount to send (in wei)
 * @param data Transaction data (optional)
 * @returns Transaction receipt
 */
export async function executeSafeTransaction(
  safeAddress: string,
  ownerPrivateKey: string,
  to: string,
  value: ethers.BigNumber = ethers.BigNumber.from(0),
  data: string = '0x'
): Promise<ethers.ContractReceipt | null> {
  try {
    const protocolKit = await getSafeInstance(safeAddress, ownerPrivateKey);

    // Create the transaction using Protocol Kit
    const safeTransaction = await protocolKit.createTransaction({
      transactions: [{
        to: ethers.utils.getAddress(to),
        value: value.toString(),
        data,
      }],
    });

    // Execute the transaction
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    const receipt = await txResponse.wait();

    return receipt || null;
  } catch (error) {
    console.error('Error executing Safe transaction:', error);
    throw new Error(
      `Failed to execute Safe transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Execute multiple transactions in a batch on a Safe wallet
 * Useful for executing multiple trades at once (gas efficient)
 * @param safeAddress The Safe wallet address
 * @param ownerPrivateKey Private key of the Safe owner
 * @param transactions Array of transactions to execute
 * @returns Transaction receipt
 */
export async function executeSafeBatchTransaction(
  safeAddress: string,
  ownerPrivateKey: string,
  transactions: Array<{
    to: string;
    value?: ethers.BigNumber | string | number;
    data?: string;
  }>
): Promise<ethers.ContractReceipt | null> {
  try {
    const protocolKit = await getSafeInstance(safeAddress, ownerPrivateKey);

    // Create batch transaction data
    const safeTransactionData = transactions.map((tx) => ({
      to: ethers.utils.getAddress(tx.to),
      value: tx.value ? (typeof tx.value === 'string' ? tx.value : tx.value.toString()) : '0',
      data: tx.data || '0x',
    }));

    // Create the batch transaction
    const safeTransaction = await protocolKit.createTransaction({
      transactions: safeTransactionData,
    });

    // Execute the batch transaction
    const txResponse = await protocolKit.executeTransaction(safeTransaction);
    const receipt = await txResponse.wait();

    return receipt || null;
  } catch (error) {
    console.error('Error executing Safe batch transaction:', error);
    throw new Error(
      `Failed to execute Safe batch transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Export unused function to mark it as intentionally kept for future use
export { _addOwnersToSafe };
