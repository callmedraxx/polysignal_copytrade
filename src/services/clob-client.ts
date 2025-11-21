import { ClobClient } from "@polymarket/clob-client";
import { builderConfig } from './builder-config';
import { config } from '../config/env';
import { deriveWalletForUser } from './relayer-client';
import { prisma } from '../config/database';


const host = config.polymarket.clobApiUrl || 'https://clob.polymarket.com';
const chainId = 137; // Polygon mainnet

// Signature types (from @polymarket/order-utils):
// 0: EOA - signer must match maker
// 1: POLY_PROXY - for Polymarket Proxy wallets
// 2: POLY_GNOSIS_SAFE - for Polymarket Gnosis Safe wallets
// Since we're using Gnosis Safe wallets where the maker is the Safe (proxy wallet)
// but the signer is the derived wallet, we need POLY_GNOSIS_SAFE signature type
const SIGNATURE_TYPE = 2; // POLY_GNOSIS_SAFE

/**
 * Creates a CLOB client instance for a specific user
 * Each user gets their own client instance with:
 * - funder: The user's proxy wallet (Safe) address
 * - signer: The derived wallet private key for the user
 * - signatureType: 2 (POLY_GNOSIS_SAFE) - allows derived wallet to sign on behalf of Safe
 * 
 * This ensures each user session has their own isolated CLOB client instance
 * 
 * @param userAddress The Ethereum address of the user
 * @returns A configured ClobClient instance for the user
 */
export async function createClobClientForUser(userAddress: string): Promise<ClobClient> {
  // Normalize user address
  const normalizedUserAddress = userAddress.toLowerCase();
  
  // Get user from database to retrieve proxy wallet address
  const user = await prisma.user.findUnique({
    where: { address: normalizedUserAddress },
  });
  
  if (!user) {
    throw new Error(`User not found: ${normalizedUserAddress}`);
  }
  
  if (!user.proxyWallet) {
    throw new Error(`User ${normalizedUserAddress} does not have a proxy wallet. Please ensure the proxy wallet is created first.`);
  }
  
  const funder = user.proxyWallet.toLowerCase();
  console.log('funder', funder);
  
  // Derive wallet for this user (deterministic)
  const derivedWallet = deriveWalletForUser(normalizedUserAddress);
  console.log('derivedWallet', derivedWallet);
  //const signer = new Wallet(derivedWallet.privateKey);
  const signer = derivedWallet;
  console.log('signer', signer);
  
  console.log(`🔑 Creating CLOB client for user : ${normalizedUserAddress}`);
  console.log(`   Proxy wallet (funder/maker): ${funder}`);
  console.log(`   Derived wallet (signer): ${derivedWallet.address}`);
  console.log(`   Signature type: POLY_GNOSIS_SAFE (2) - allows signer to sign on behalf of Safe wallet`);
  console.log(`   ⚠️  For POLY_GNOSIS_SAFE: The derived wallet (${derivedWallet.address}) must be an owner of the Safe (${funder})`);
  console.log(`   ⚠️  The derived wallet may need to be registered with Polymarket before signing orders`);
  
  let creds;
  try {
    // Rate limit API key creation: 50 requests / 10s
    const { waitForRateLimit } = await import('./rate-limiter');
    await waitForRateLimit('clob-api-keys');
    
    // createOrDeriveApiKey() tries to CREATE first, then DERIVES if creation fails
    // The library logs errors internally when creation fails, but derivation usually succeeds
    // We suppress console errors temporarily to avoid noise from expected fallback behavior
    const originalError = console.error;
    let libraryErrorLogged = false;
    
    // Temporarily intercept console.error to detect if library logs an error
    console.error = (...args: any[]) => {
      const errorStr = JSON.stringify(args);
      if (errorStr.includes('[CLOB Client] request error') && 
          errorStr.includes('Could not create api key')) {
        libraryErrorLogged = true;
        // Don't log this - it's expected when falling back to derivation
        return;
      }
      originalError.apply(console, args);
    };
    
    try {
      creds = await new ClobClient(host, chainId, signer).createOrDeriveApiKey();
    } finally {
      // Restore original console.error
      console.error = originalError;
    }
    
    if (!creds) {
      throw new Error(
        `Failed to obtain API credentials for user ${normalizedUserAddress}. ` +
        `The derived wallet may need to be registered on Polymarket first. ` +
        `Please ensure the wallet has interacted with Polymarket or contact support.`
      );
    }
    
    // Log success message, noting if it was derived vs created
    if (libraryErrorLogged) {
      console.log(`✅ API credentials derived for user ${normalizedUserAddress} (creation failed, derivation succeeded)`);
    } else {
      console.log(`✅ API credentials created for user ${normalizedUserAddress}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Only log if credentials weren't actually obtained
    // (The library error was already suppressed above if derivation succeeded)
    if (!creds) {
      console.error(`❌ Failed to create/derive API credentials for user ${normalizedUserAddress}:`, errorMessage);
      
      // Check if it's the "Could not create api key" error
      const isApiKeyError = errorMessage.includes('Could not create api key') || 
                           (error instanceof Error && 'status' in error && (error as any).status === 400);
      
      if (isApiKeyError) {
        throw new Error(
          `Cannot create or derive API key for user ${normalizedUserAddress}. ` +
          `The derived wallet (${derivedWallet.address}) may not be registered on Polymarket. ` +
          `The wallet may need to make an initial deposit or transaction on Polymarket before API access is granted. ` +
          `Original error: ${errorMessage}`
        );
      }
      
      // Re-throw any other errors
      throw new Error(
        `Failed to obtain API credentials for user ${normalizedUserAddress}: ${errorMessage}`
      );
    }
  }
  
  // Create the actual CLOB client instance for this user
  const clobClient = new ClobClient(
    host,
    chainId,
    signer,
    creds,
    SIGNATURE_TYPE,
    funder,
    undefined,
    false,
    builderConfig
);
  console.log('clobClient', clobClient);
  
  return clobClient;
}