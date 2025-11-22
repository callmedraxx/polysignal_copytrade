import { getUserByAddress } from "./auth";
import { createDepositAddresses } from "./bridge-deposit";
import { getSupportedAssets } from "./bridge-assets";
import { logger } from "../utils/logger";

export interface DepositOption {
  type: "direct" | "bridge";
  id: string;
  name: string;
  description: string;
  recommended: boolean;
  network: {
    name: string;
    chainId: number;
    displayName: string;
  };
  depositAddress: string;
  token: {
    symbol: string;
    address: string;
    name: string;
    decimals: number;
  };
  speed: string;
  fees: string;
  instructions: string[];
  warnings?: string[];
  example?: {
    network: string;
    token: string;
    amount: string;
    from: string;
    to: string;
  };
  commonMistakes?: string[];
  explorerUrl?: string;
}

export interface UnifiedDepositResponse {
  userAddress: string;
  proxyWallet: string;
  proxyWalletNetwork: {
    name: string;
    chainId: number;
    explorerUrl: string;
  };
  options: DepositOption[];
  supportedAssets: Array<{
    chainId: string;
    chainName: string;
    token: {
      symbol: string;
      name: string;
      address: string;
      decimals: number;
    };
    minCheckoutUsd: number;
  }>;
  recommendations: {
    forPolygonUsers: string;
    forEthereumUsers: string;
    forSolanaUsers?: string;
    forOtherChainUsers: string;
  };
  importantNotes: string[];
  helpText: string;
}

/**
 * Get unified deposit options with clear instructions
 * This endpoint helps users understand all deposit methods and avoid confusion
 */
export async function getUnifiedDepositOptions(
  userAddress: string
): Promise<UnifiedDepositResponse> {
  try {
    const user = await getUserByAddress(userAddress);
    
    if (!user) {
      throw new Error(`User not found: ${userAddress}`);
    }
    
    if (!user.proxyWallet) {
      throw new Error(`User ${userAddress} does not have a proxy wallet. Please complete signup first.`);
    }
    
    const proxyWallet = user.proxyWallet;
    
    // Get supported assets
    const supportedAssets = await getSupportedAssets();
    
    // Get bridge deposit addresses
    let bridgeDepositData = null;
    try {
      bridgeDepositData = await createDepositAddresses(userAddress);
    } catch (error) {
      logger.warn("Could not fetch bridge deposit addresses", {
        userAddress,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
    
    // Extract deposit addresses from bridge response
    const evmDepositAddress = typeof bridgeDepositData?.address === "string"
      ? bridgeDepositData.address
      : bridgeDepositData?.address?.evm || null;
    
    const solanaDepositAddress = typeof bridgeDepositData?.address === 'object' && bridgeDepositData?.address ? bridgeDepositData.address.svm || null : null;
    // const bitcoinDepositAddress = typeof bridgeDepositData?.address === 'object' && bridgeDepositData?.address ? bridgeDepositData.address.btc || null : null;
    
    // Build deposit options
    const options: DepositOption[] = [];
    
    // Option 1: Direct Deposit (Polygon) - RECOMMENDED
    options.push({
      type: "direct",
      id: "direct-polygon",
      name: "Direct Deposit (Polygon)",
      description: "Send USDC.e directly to your proxy wallet on Polygon. Fastest and simplest method.",
      recommended: true,
      network: {
        name: "Polygon",
        chainId: 137,
        displayName: "Polygon Mainnet",
      },
      depositAddress: proxyWallet,
      token: {
        symbol: "USDC",
        name: "USDC.e",
        address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (bridged)
        decimals: 6,
      },
      speed: "Instant (no bridge needed)",
      fees: "Polygon gas fees only (~$0.01)",
      instructions: [
        "Connect your wallet to Polygon Mainnet",
        `Send USDC.e to: ${proxyWallet}`,
        "Use token address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
        "Funds will appear immediately (no bridge wait time)",
        "Minimum deposit: $2 USD",
      ],
      warnings: [
        "⚠️ Make sure you're on Polygon network, NOT Ethereum!",
        "⚠️ Send USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)",
        "⚠️ Do NOT send to bridge deposit address - send directly here!",
      ],
      example: {
        network: "Polygon Mainnet",
        token: "USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)",
        amount: "100 USDC",
        from: "Your wallet on Polygon",
        to: proxyWallet,
      },
      commonMistakes: [
        "❌ Sending from Ethereum to this address (wrong network!)",
        "❌ Sending Native USDC instead of USDC.e",
        "❌ Sending to bridge deposit address instead of proxy wallet",
      ],
      explorerUrl: `https://polygonscan.com/address/${proxyWallet}`,
    });
    
    // Option 2: Bridge Deposit (Ethereum) - For Ethereum users
    if (evmDepositAddress) {
      options.push({
        type: "bridge",
        id: "bridge-ethereum",
        name: "Bridge Deposit (Ethereum)",
        description: "Send USDC from Ethereum mainnet. Polymarket Bridge will automatically bridge to Polygon.",
        recommended: false,
        network: {
          name: "Ethereum",
          chainId: 1,
          displayName: "Ethereum Mainnet",
        },
        depositAddress: evmDepositAddress,
        token: {
          symbol: "USDC",
          name: "USD Coin",
          address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          decimals: 6,
        },
        speed: "5-15 minutes (bridge processing time)",
        fees: "Ethereum gas fees + bridge fees",
        instructions: [
          "Connect your wallet to Ethereum Mainnet (NOT Polygon!)",
          `Send USDC to bridge deposit address: ${evmDepositAddress}`,
          "Use token address: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          "Wait 5-15 minutes for Polymarket Bridge to process",
          "Funds will arrive in your proxy wallet as USDC.e on Polygon",
          "Minimum deposit: $10 USD",
        ],
        warnings: [
          "⚠️ CRITICAL: You must be on Ethereum Mainnet to use this address!",
          "⚠️ Do NOT send from Polygon to this address (won't work!)",
          "⚠️ This address is ONLY for Ethereum deposits",
          "⚠️ After sending, wait 5-15 minutes for bridge to complete",
        ],
        example: {
          network: "Ethereum Mainnet",
          token: "USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)",
          amount: "100 USDC",
          from: "Your wallet on Ethereum",
          to: evmDepositAddress,
        },
        commonMistakes: [
          "❌ Sending from Polygon to this address (wrong network!)",
          "❌ Sending directly to proxy wallet from Ethereum (bypasses bridge)",
          "❌ Using this address on Polygon network",
        ],
        explorerUrl: `https://etherscan.io/address/${evmDepositAddress}`,
      });
    }
    
    // Option 3: Bridge Deposit (Solana) - For Solana users
    if (solanaDepositAddress) {
      options.push({
        type: "bridge",
        id: "bridge-solana",
        name: "Bridge Deposit (Solana)",
        description: "Send SOL or USDC from Solana. Polymarket Bridge will automatically bridge to Polygon. You can send either SOL (native Solana) or USDC on Solana.",
        recommended: false,
        network: {
          name: "Solana",
          chainId: 1151111081099710,
          displayName: "Solana Mainnet",
        },
        depositAddress: solanaDepositAddress,
        token: {
          symbol: "SOL or USDC",
          name: "SOL (native) or USDC on Solana",
          address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint address on Solana
          decimals: 9, // SOL has 9 decimals, USDC has 6, but we'll use 9 for SOL
        },
        speed: "5-15 minutes (bridge processing time)",
        fees: "Solana transaction fees + bridge fees",
        instructions: [
          "Connect your wallet to Solana Mainnet",
          `Send SOL or USDC to Solana address: ${solanaDepositAddress}`,
          "You can send either:",
          "  • SOL (native Solana token) - will be converted to USDC",
          "  • USDC on Solana (mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)",
          "Wait 5-15 minutes for Polymarket Bridge to process",
          "Funds will arrive in your proxy wallet as USDC.e on Polygon",
          "Minimum deposit: $10 USD",
        ],
        warnings: [
          "⚠️ CRITICAL: You must be on Solana Mainnet to use this address!",
          "⚠️ This is a Solana (SVM) address, NOT an Ethereum address",
          "⚠️ After sending, wait 5-15 minutes for bridge to complete",
          "⚠️ You can send SOL or USDC on Solana - both are supported",
        ],
        example: {
          network: "Solana Mainnet",
          token: "SOL or USDC on Solana",
          amount: "100 USDC or 1 SOL",
          from: "Your wallet on Solana",
          to: solanaDepositAddress,
        },
        commonMistakes: [
          "❌ Sending from Ethereum or Polygon to this Solana address (wrong network!)",
          "❌ Using this address on a non-Solana network",
          "❌ Confusing this with Ethereum deposit address",
        ],
        explorerUrl: `https://solscan.io/account/${solanaDepositAddress}`,
      });
    }
    
    // Build recommendations
    const recommendations = {
      forPolygonUsers: `If you're already on Polygon, use Direct Deposit (recommended). Send USDC.e directly to ${proxyWallet} on Polygon. No bridge needed - funds appear instantly!`,
      forEthereumUsers: `If you're on Ethereum, use Bridge Deposit (Ethereum). Send USDC to ${evmDepositAddress} on Ethereum Mainnet. The bridge takes 5-15 minutes.`,
      forSolanaUsers: solanaDepositAddress ? `If you're on Solana, use Bridge Deposit (Solana). Send SOL or USDC to ${solanaDepositAddress} on Solana Mainnet. The bridge takes 5-15 minutes.` : undefined,
      forOtherChainUsers: `For other chains, check supported assets below and use the appropriate bridge deposit address. All deposits are automatically bridged to Polygon.`,
    };
    
    // Build important notes
    const importantNotes = [
      `✅ PROXY WALLET (Your Destination): ${proxyWallet} (on Polygon)`,
      "📍 This is where ALL deposits ultimately arrive, regardless of source chain",
      "",
      "🔍 UNDERSTANDING DEPOSIT ADDRESSES:",
      `   - Direct Deposit: ${proxyWallet} (Polygon) - Send USDC.e directly here if you're on Polygon`,
      evmDepositAddress ? `   - Bridge Deposit (Ethereum): ${evmDepositAddress} (Ethereum) - Send here ONLY if you're on Ethereum` : "",
      solanaDepositAddress ? `   - Bridge Deposit (Solana): ${solanaDepositAddress} (Solana) - Send SOL or USDC here if you're on Solana` : "",
      "",
      "⚠️ CRITICAL: Each deposit address is on a SPECIFIC network!",
      "   - Direct deposit address = Polygon network (Chain ID: 137)",
      "   - Bridge deposit addresses = Source chain network (Ethereum = Chain ID: 1, Solana = SVM, etc.)",
      "",
      "❌ COMMON MISTAKE: Sending from Polygon to Ethereum deposit address",
      "   → This won't work! You must send FROM the same network as the deposit address",
      "",
      "✅ CORRECT USAGE:",
      "   - On Polygon? → Use Direct Deposit (send USDC.e to proxy wallet)",
      "   - On Ethereum? → Use Bridge Deposit Ethereum (send USDC to bridge address)",
      "   - On Solana? → Use Bridge Deposit Solana (send SOL or USDC to Solana bridge address)",
    ].filter(Boolean);
    
    const helpText = `
HOW TO CHOOSE THE RIGHT DEPOSIT METHOD:

1. CHECK YOUR CURRENT NETWORK
   - Are you on Polygon? → Use Direct Deposit ✅
   - Are you on Ethereum? → Use Bridge Deposit (Ethereum)
   - Are you on Solana? → Use Bridge Deposit (Solana) - Send SOL or USDC on Solana

2. DIRECT DEPOSIT (Recommended for Polygon users)
   - Network: Polygon Mainnet (Chain ID: 137)
   - Send to: Your proxy wallet (${proxyWallet})
   - Token: USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)
   - Speed: Instant ⚡
   - ✅ Best choice if you're already on Polygon!

3. BRIDGE DEPOSIT (For cross-chain users)
   - Network: Source chain (Ethereum, Solana, etc.)
   - Send to: Bridge deposit address (specific to each chain)
   - Token: Native token on source chain (USDC on Ethereum, SOL or USDC on Solana)
   - Speed: 5-15 minutes (bridge processing)
   - ✅ Use this if you're on a different chain
   - ✅ For Solana: You can send SOL (native) or USDC on Solana - both work!

4. NETWORK MATTERS!
   - Each deposit address is on a specific network
   - You MUST send FROM the same network as the deposit address
   - Sending from the wrong network will NOT work

5. AFTER DEPOSIT
   - Direct deposits: Funds appear immediately
   - Bridge deposits: Wait 5-15 minutes, then check your proxy wallet
   - All funds arrive in: ${proxyWallet} (on Polygon)
   - Balance is checked using USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)

STILL CONFUSED?
- If you're on Polygon: Use Direct Deposit (send USDC.e to proxy wallet - recommended)
- If you're on Ethereum: Use Bridge Deposit (Ethereum) - send USDC
- If you're on Solana: Use Bridge Deposit (Solana) - send SOL or USDC on Solana
- When in doubt: Check which network your wallet is connected to!
    `.trim();
    
    return {
      userAddress,
      proxyWallet,
      proxyWalletNetwork: {
        name: "Polygon",
        chainId: 137,
        explorerUrl: `https://polygonscan.com/address/${proxyWallet}`,
      },
      options,
      supportedAssets: supportedAssets.map(asset => ({
        chainId: asset.chainId,
        chainName: asset.chainName,
        token: {
          symbol: asset.token.symbol,
          name: asset.token.name,
          address: asset.token.address,
          decimals: asset.token.decimals,
        },
        minCheckoutUsd: asset.minCheckoutUsd,
      })),
      recommendations,
      importantNotes,
      helpText,
    };
  } catch (error) {
    logger.error("Error getting unified deposit options", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

