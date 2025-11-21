import { ethers } from "ethers";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { config } from "../config/env";
import { builderConfig } from "./builder-config";

const relayerUrl = process.env.POLYMARKET_RELAYER_URL || config.polymarket.relayerUrl;
const chainId = 137; // Polygon mainnet

// Create provider (shared across all instances)
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL || config.blockchain.polygonRpcUrl);

/**
 * Derives a deterministic wallet from user address using HD wallet derivation
 * This ensures each user gets a unique wallet for Safe deployment
 * @param userAddress The Ethereum address of the user
 * @returns A deterministic wallet derived from the user address
 */
export function deriveWalletForUser(userAddress: string): ethers.Wallet {
    const mnemonic = config.blockchain.hdWalletMnemonic;
    
    if (!mnemonic || mnemonic.trim() === '') {
        throw new Error(
            'HD_WALLET_MNEMONIC is not configured. ' +
            'Please set HD_WALLET_MNEMONIC in your .env file. ' +
            'You can generate one using: ethers.Wallet.createRandom().mnemonic.phrase'
        );
    }

    // Normalize user address to ensure consistent derivation
    const normalizedAddress = ethers.utils.getAddress(userAddress.toLowerCase());
    
    // Create a deterministic index from the user address
    // Use first 8 bytes of keccak256 hash as index (ensures uniqueness)
    const addressHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(normalizedAddress));
    const index = ethers.BigNumber.from(addressHash).mod(2147483647).toNumber(); // Max safe integer for derivation path
    
    // Derive wallet using BIP44 path: m/44'/60'/0'/0/{index}
    // 44' = BIP44, 60' = Ethereum, 0' = account, 0 = change, {index} = address index
    const derivationPath = `m/44'/60'/0'/0/${index}`;
    
    console.log(`🔑 Deriving wallet for user ${normalizedAddress}`);
    console.log(`   Derivation path: ${derivationPath}`);
    console.log(`   Index: ${index}`);
    
    const derivedWallet = ethers.Wallet.fromMnemonic(mnemonic, derivationPath);
    const connectedWallet = derivedWallet.connect(provider);
    
    console.log(`   Derived wallet address: ${connectedWallet.address}`);
    
    return connectedWallet;
}

/**
 * Gets the expected Safe address for a derived wallet
 * This uses Safe Protocol Kit to predict the Safe address that will be deployed
 * Note: The RelayerClient will deploy a Safe with default config (threshold: 1, owner: derivedWallet.address)
 * @param derivedWallet The derived wallet
 * @returns The predicted Safe address
 */
export async function getExpectedSafeAddress(derivedWallet: ethers.Wallet): Promise<string> {
    // Import Safe Protocol Kit dynamically
    const Safe = require('@safe-global/protocol-kit').default || require('@safe-global/protocol-kit').Safe;
    
    const rpcUrl = process.env.RPC_URL || config.blockchain.polygonRpcUrl;
    
    // Configure Safe with default settings (same as RelayerClient uses)
    const safeAccountConfig = {
        owners: [derivedWallet.address],
        threshold: 1,
    };
    
    const predictedSafe = {
        safeAccountConfig,
    };
    
    // Initialize Protocol Kit to predict Safe address
    const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: derivedWallet.privateKey,
        predictedSafe,
    });
    
    const safeAddress = await protocolKit.getAddress();
    
    // Verify it's not the singleton address
    const SAFE_SINGLETON_ADDRESS = '0x3E5c63644E683549055b9Be8653de26E0B4CD36E';
    if (safeAddress.toLowerCase() === SAFE_SINGLETON_ADDRESS.toLowerCase()) {
        throw new Error('Predicted Safe address is the singleton address. This should not happen.');
    }
    
    return safeAddress;
}

/**
 * Checks if a Safe is already deployed at the expected address
 * @param safeAddress The Safe address to check
 * @returns True if Safe is deployed, false otherwise
 */
export async function isSafeDeployed(safeAddress: string): Promise<boolean> {
    const code = await provider.getCode(safeAddress);
    return code !== '0x' && code !== '0x0';
}

/**
 * Creates a RelayerClient instance for a specific user
 * Each user gets a unique RelayerClient with a derived wallet
 * @param userAddress The Ethereum address of the user
 * @returns A RelayerClient instance configured for this user
 */
export function createRelayerClientForUser(userAddress: string): RelayClient {
    const derivedWallet = deriveWalletForUser(userAddress);
    
    
    console.log(`🚀 Creating RelayerClient for user: ${userAddress}`);
    console.log(`   Using derived wallet: ${derivedWallet.address}`);
    
    return new RelayClient(relayerUrl, chainId, derivedWallet, builderConfig);
}

// // Legacy export for backward compatibility (uses deployer wallet)
// // TODO: Remove this once all code is migrated to use createRelayerClientForUser
// const deployerWallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || '', provider);
// export const RelayerClient = new RelayClient(relayerUrl, chainId, deployerWallet, builderConfig);