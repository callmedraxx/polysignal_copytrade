# Unified Deposit Endpoint Flow

## `/api/deposit/unified` - How It Works

### Overview

The unified deposit endpoint (`GET /api/deposit/unified`) is a **comprehensive deposit information endpoint** that consolidates all deposit methods, addresses, instructions, and warnings into a single response. It's designed to help users understand all their deposit options and avoid common mistakes.

---

## Step-by-Step Flow

### 1. **JWT Token Authentication**
```
GET /api/deposit/unified
Headers: Authorization: Bearer <JWT_TOKEN>
```

- Same authentication flow as other endpoints
- Extracts user address from JWT token
- Verifies user exists and has proxy wallet

### 2. **User Lookup**
```typescript
const user = await getUserByAddress(userAddress);
const proxyWallet = user.proxyWallet; // Safe wallet on Polygon
```

- Looks up user in database using address from JWT
- Retrieves user's proxy wallet address (Safe wallet)
- If no proxy wallet → Returns 404 error

### 3. **Gather All Deposit Information**

The endpoint performs **multiple data gathering steps**:

#### a. **Get Supported Assets**
```typescript
const supportedAssets = await getSupportedAssets();
```
- Fetches all supported chains and tokens from Polymarket Bridge API
- Includes minimum deposit amounts, token addresses, etc.

#### b. **Get Bridge Deposit Addresses**
```typescript
const bridgeDepositData = await createDepositAddresses(userAddress);
```
- Calls Polymarket Bridge API to create deposit addresses
- Gets addresses for:
  - Ethereum (EVM)
  - Solana (SVM)
  - Bitcoin (BTC) - if supported
- Extracts addresses from response:
  - `evmDepositAddress` - for Ethereum deposits
  - `solanaDepositAddress` - for Solana deposits

### 4. **Build Deposit Options**

The endpoint creates **multiple deposit option objects**:

#### **Option 1: Direct Deposit (Polygon) - RECOMMENDED**
```typescript
{
  type: "direct",
  id: "direct-polygon",
  name: "Direct Deposit (Polygon)",
  recommended: true,
  network: {
    name: "Polygon",
    chainId: 137,
    displayName: "Polygon Mainnet"
  },
  depositAddress: proxyWallet, // User's Safe wallet
  token: {
    symbol: "USDC",
    name: "USDC.e",
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (bridged)
    decimals: 6
  },
  speed: "Instant (no bridge needed)",
  fees: "Polygon gas fees only (~$0.01)",
  instructions: [
    "Connect your wallet to Polygon Mainnet",
    "Send USDC.e to: [proxyWallet]",
    "Use token address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    "Funds will appear immediately"
  ],
  warnings: [
    "⚠️ Make sure you're on Polygon network, NOT Ethereum!",
    "⚠️ Send USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)"
  ],
  commonMistakes: [
    "❌ Sending from Ethereum to this address (wrong network!)",
    "❌ Sending Native USDC instead of USDC.e"
  ],
  explorerUrl: "https://polygonscan.com/address/[proxyWallet]"
}
```

#### **Option 2: Bridge Deposit (Ethereum)**
```typescript
{
  type: "bridge",
  id: "bridge-ethereum",
  name: "Bridge Deposit (Ethereum)",
  recommended: false,
  network: {
    name: "Ethereum",
    chainId: 1,
    displayName: "Ethereum Mainnet"
  },
  depositAddress: evmDepositAddress, // From Polymarket Bridge API
  token: {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum USDC
    decimals: 6
  },
  speed: "5-15 minutes (bridge processing time)",
  fees: "Ethereum gas fees + bridge fees",
  instructions: [
    "Connect your wallet to Ethereum Mainnet (NOT Polygon!)",
    "Send USDC to bridge deposit address: [evmDepositAddress]",
    "Wait 5-15 minutes for Polymarket Bridge to process",
    "Funds will arrive in your proxy wallet as USDC.e on Polygon"
  ],
  warnings: [
    "⚠️ CRITICAL: You must be on Ethereum Mainnet to use this address!",
    "⚠️ Do NOT send from Polygon to this address (won't work!)"
  ],
  explorerUrl: "https://etherscan.io/address/[evmDepositAddress]"
}
```

#### **Option 3: Bridge Deposit (Solana)**
```typescript
{
  type: "bridge",
  id: "bridge-solana",
  name: "Bridge Deposit (Solana)",
  description: "Send SOL or USDC from Solana. Polymarket Bridge will automatically bridge to Polygon. You can send either SOL (native Solana) or USDC on Solana.",
  recommended: false,
  network: {
    name: "Solana",
    chainId: 1151111081099710,
    displayName: "Solana Mainnet"
  },
  depositAddress: solanaDepositAddress, // From Polymarket Bridge API (SVM address)
  token: {
    symbol: "SOL or USDC",
    name: "SOL (native) or USDC on Solana",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint address on Solana
    decimals: 9 // SOL has 9 decimals, USDC has 6
  },
  speed: "5-15 minutes (bridge processing time)",
  fees: "Solana transaction fees + bridge fees",
  instructions: [
    "Connect your wallet to Solana Mainnet",
    "Send SOL or USDC to Solana address: [solanaDepositAddress]",
    "You can send either:",
    "  • SOL (native Solana token) - will be converted to USDC",
    "  • USDC on Solana (mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)",
    "Wait 5-15 minutes for bridge to complete"
  ]
}
```

### 5. **Build Additional Information**

#### **Recommendations**
```typescript
{
  forPolygonUsers: "If you're already on Polygon, use Direct Deposit...",
  forEthereumUsers: "If you're on Ethereum, use Bridge Deposit...",
  forOtherChainUsers: "For other chains, check supported assets..."
}
```

#### **Important Notes**
- Lists proxy wallet address (final destination)
- Explains difference between direct and bridge deposits
- Warns about network-specific addresses
- Lists common mistakes to avoid
- **Direct Deposit uses USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174)** - the same token used for balance checks

#### **Help Text**
- Step-by-step guide on choosing the right method
- Network-specific instructions
- What to expect after deposit

### 6. **Return Complete Response**

```json
{
  "userAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "proxyWallet": "0x56687bf447db6ffa42ffe2204a05edaa20f55839",
  "proxyWalletNetwork": {
    "name": "Polygon",
    "chainId": 137,
    "explorerUrl": "https://polygonscan.com/address/0x56687bf447db6ffa42ffe2204a05edaa20f55839"
  },
  "options": [
    {
      "type": "direct",
      "id": "direct-polygon",
      "name": "Direct Deposit (Polygon)",
      "recommended": true,
      "network": { ... },
      "depositAddress": "...",
      "token": { ... },
      "speed": "Instant",
      "instructions": [ ... ],
      "warnings": [ ... ],
      "commonMistakes": [ ... ]
    },
    {
      "type": "bridge",
      "id": "bridge-ethereum",
      "name": "Bridge Deposit (Ethereum)",
      "recommended": false,
      ...
    },
    {
      "type": "bridge",
      "id": "bridge-solana",
      "name": "Bridge Deposit (Solana)",
      "description": "Send SOL or USDC from Solana. Polymarket Bridge will automatically bridge to Polygon. You can send either SOL (native Solana) or USDC on Solana.",
      "network": {
        "name": "Solana",
        "chainId": 1151111081099710,
        "displayName": "Solana Mainnet"
      },
      "depositAddress": "GPqpiDArnhuYdEXX6gyYZY6g7wEcynLoh3bjuJU1ontF",
      "token": {
        "symbol": "SOL or USDC",
        "name": "SOL (native) or USDC on Solana",
        "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "decimals": 9
      },
      "speed": "5-15 minutes (bridge processing time)",
      "fees": "Solana transaction fees + bridge fees",
      "instructions": [
        "Connect your wallet to Solana Mainnet",
        "Send SOL or USDC to Solana address: GPqpiDArnhuYdEXX6gyYZY6g7wEcynLoh3bjuJU1ontF",
        "You can send either:",
        "  • SOL (native Solana token) - will be converted to USDC",
        "  • USDC on Solana (mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)",
        "Wait 5-15 minutes for Polymarket Bridge to process",
        "Funds will arrive in your proxy wallet as USDC.e on Polygon"
      ],
      "warnings": [
        "⚠️ CRITICAL: You must be on Solana Mainnet to use this address!",
        "⚠️ This is a Solana (SVM) address, NOT an Ethereum address",
        "⚠️ After sending, wait 5-15 minutes for bridge to complete",
        "⚠️ You can send SOL or USDC on Solana - both are supported"
      ],
      "explorerUrl": "https://solscan.io/account/GPqpiDArnhuYdEXX6gyYZY6g7wEcynLoh3bjuJU1ontF"
    }
  ],
  "supportedAssets": [
    {
      "chainId": "1",
      "chainName": "Ethereum",
      "token": {
        "symbol": "USDC",
        "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "decimals": 6
      },
      "minCheckoutUsd": 10
    },
    // ... more assets
  ],
  "recommendations": {
    "forPolygonUsers": "...",
    "forEthereumUsers": "...",
    "forSolanaUsers": "If you're on Solana, use Bridge Deposit (Solana). Send SOL or USDC to [solanaDepositAddress] on Solana Mainnet. The bridge takes 5-15 minutes.",
    "forOtherChainUsers": "..."
  },
  "importantNotes": [
    "✅ PROXY WALLET (Your Destination): 0x56687bf447db6ffa42ffe2204a05edaa20f55839",
    "📍 This is where ALL deposits ultimately arrive",
    ...
  ],
  "helpText": "HOW TO CHOOSE THE RIGHT DEPOSIT METHOD: ..."
}
```

---

## Key Features

### ✅ **Comprehensive Information**
- All deposit methods in one response
- Network-specific addresses
- Token addresses and decimals
- Speed and fee information

### ✅ **User Guidance**
- Step-by-step instructions for each method
- Warnings about common mistakes
- Network-specific recommendations
- Help text explaining how to choose

### ✅ **Error Prevention**
- Clearly shows which network each address is on
- Warns against sending from wrong network
- Explains difference between direct and bridge
- Lists common mistakes to avoid

### ✅ **Complete Reference**
- Supported assets list
- Minimum deposit amounts
- Explorer URLs for verification
- Example transactions

### ✅ **Important: Direct Deposit Uses USDC.e**
- **Token Address**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (USDC.e)
- **Same Token**: This is the same USDC.e token used for balance checks
- **Not Native USDC**: Direct deposit uses USDC.e (bridged), not Native USDC
- **Why**: Balance endpoint checks USDC.e, so deposits should use the same token for consistency

---

## Frontend Usage

```typescript
// Get all deposit information
const response = await fetch('https://poly.dev.api.polysignal.io/api/deposit/unified', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();

// Display options to user
data.options.forEach(option => {
  if (option.recommended) {
    // Show as recommended option
    console.log(`⭐ ${option.name} - ${option.description}`);
  } else {
    console.log(`${option.name} - ${option.description}`);
  }
  
  // Show network info
  console.log(`Network: ${option.network.displayName} (Chain ID: ${option.network.chainId})`);
  
  // Show deposit address
  console.log(`Send to: ${option.depositAddress}`);
  
  // Show warnings
  option.warnings?.forEach(warning => {
    console.warn(warning);
  });
  
  // Show instructions
  option.instructions.forEach(step => {
    console.log(`  ${step}`);
  });
});

// Show recommendations based on user's network
if (userNetwork === 'Polygon') {
  console.log(data.recommendations.forPolygonUsers);
} else if (userNetwork === 'Ethereum') {
  console.log(data.recommendations.forEthereumUsers);
}

// Show important notes
data.importantNotes.forEach(note => {
  console.log(note);
});
```

---

## Comparison: `/create-addresses` vs `/unified`

| Feature | `/create-addresses` | `/unified` |
|---------|---------------------|------------|
| **Purpose** | Generate bridge deposit addresses | Get all deposit info + instructions |
| **Method** | POST | GET |
| **Returns** | Just deposit addresses | Complete deposit guide |
| **Includes** | Bridge addresses only | Direct + Bridge + Instructions + Warnings |
| **Use Case** | When you just need addresses | When you need full deposit UI |
| **Complexity** | Simple | Comprehensive |

---

## Summary

The unified endpoint is a **one-stop-shop** for all deposit information:

1. **Identifies User**: From JWT token → Gets proxy wallet
2. **Gathers Data**: 
   - Supported assets from Polymarket
   - Bridge deposit addresses from Polymarket Bridge API
3. **Builds Options**: Creates detailed option objects for each deposit method
4. **Adds Guidance**: Instructions, warnings, recommendations, help text
5. **Returns Everything**: Complete deposit information in one response

**Best for**: Frontend deposit UI that needs to show all options with clear guidance

**Alternative**: Use `/create-addresses` if you only need the bridge addresses without all the extra information

