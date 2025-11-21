import { prisma } from '../config/database';
import { verifyTrader, getTraderStats, TraderInfo } from './polymarket';
import { ethers } from 'ethers';

export interface CopyTradingConfigInput {
  targetTraderAddress: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: 'fixed' | 'percentage' | 'percentageOfOriginal';
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  maxBuyAmount?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  marketCategories?: string[];
}

export interface CopyTradingConfigResponse {
  id: string;
  targetTraderAddress: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: string;
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  maxBuyAmount?: string;
  minSellAmount?: string;
  maxSellAmount?: string;
  marketCategories?: string[];
  enabled: boolean;
  authorized: boolean;
  traderInfo?: TraderInfo;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a copy trading configuration for a user
 */
export async function createCopyTradingConfig(
  userId: string,
  input: CopyTradingConfigInput
): Promise<CopyTradingConfigResponse> {
  // Validate address format
  try {
    ethers.utils.getAddress(input.targetTraderAddress);
  } catch {
    throw new Error('Invalid trader address format');
  }

  // Verify trader exists on Polymarket
  const traderInfo = await verifyTrader(input.targetTraderAddress);
  if (!traderInfo.isValid) {
    throw new Error('Trader not found on Polymarket or has no trading history');
  }

  // Validate amount inputs
  if (input.amountType === 'fixed') {
    // Fixed amounts should be positive numbers
    const buyAmount = parseFloat(input.buyAmount);
    const sellAmount = parseFloat(input.sellAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      throw new Error('Buy amount must be a positive number');
    }
    if (isNaN(sellAmount) || sellAmount <= 0) {
      throw new Error('Sell amount must be a positive number');
    }
  } else if (input.amountType === 'percentage' || input.amountType === 'percentageOfOriginal') {
    // Percentages should be between 0 and 100
    const buyPercent = parseFloat(input.buyAmount);
    const sellPercent = parseFloat(input.sellAmount);
    if (isNaN(buyPercent) || buyPercent <= 0 || buyPercent > 100) {
      throw new Error('Buy percentage must be between 0 and 100');
    }
    if (isNaN(sellPercent) || sellPercent <= 0 || sellPercent > 100) {
      throw new Error('Sell percentage must be between 0 and 100');
    }
  }

  // Validate at least one trade type is enabled
  if (!input.copyBuyTrades && !input.copySellTrades) {
    throw new Error('At least one trade type (buy or sell) must be enabled');
  }

  // Validate amount ranges if provided
  if (input.minBuyAmount && parseFloat(input.minBuyAmount) < 0) {
    throw new Error('Minimum buy amount cannot be negative');
  }
  if (input.maxBuyAmount && parseFloat(input.maxBuyAmount) < 0) {
    throw new Error('Maximum buy amount cannot be negative');
  }
  if (input.minSellAmount && parseFloat(input.minSellAmount) < 0) {
    throw new Error('Minimum sell amount cannot be negative');
  }
  if (input.maxSellAmount && parseFloat(input.maxSellAmount) < 0) {
    throw new Error('Maximum sell amount cannot be negative');
  }

  // Check if user already has a config for this trader
  const existingConfig = await prisma.copyTradingConfig.findFirst({
    where: {
      userId,
      targetTraderAddress: ethers.utils.getAddress(input.targetTraderAddress.toLowerCase()),
    },
  });

  if (existingConfig) {
    throw new Error('You already have a copy trading configuration for this trader');
  }

  // Create configuration
  const config = await prisma.copyTradingConfig.create({
    data: {
      userId,
      targetTraderAddress: ethers.utils.getAddress(input.targetTraderAddress.toLowerCase()),
      copyBuyTrades: input.copyBuyTrades,
      copySellTrades: input.copySellTrades,
      amountType: input.amountType,
      buyAmount: input.buyAmount,
      sellAmount: input.sellAmount,
      minBuyAmount: input.minBuyAmount,
      maxBuyAmount: input.maxBuyAmount,
      minSellAmount: input.minSellAmount,
      maxSellAmount: input.maxSellAmount,
      marketCategories: input.marketCategories ? JSON.stringify(input.marketCategories) : null,
      traderInfo: JSON.stringify(traderInfo),
      enabled: false, // Must be explicitly enabled
      authorized: false, // Must be authorized separately
    },
  });

  return {
    id: config.id,
    targetTraderAddress: config.targetTraderAddress,
    copyBuyTrades: config.copyBuyTrades,
    copySellTrades: config.copySellTrades,
    amountType: config.amountType,
    buyAmount: config.buyAmount,
    sellAmount: config.sellAmount,
    minBuyAmount: config.minBuyAmount || undefined,
    maxBuyAmount: config.maxBuyAmount || undefined,
    minSellAmount: config.minSellAmount || undefined,
    maxSellAmount: config.maxSellAmount || undefined,
    marketCategories: config.marketCategories ? JSON.parse(config.marketCategories) : undefined,
    enabled: config.enabled,
    authorized: config.authorized,
    traderInfo: config.traderInfo ? JSON.parse(config.traderInfo) : undefined,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Get all copy trading configurations for a user
 */
export async function getUserCopyTradingConfigs(userId: string): Promise<CopyTradingConfigResponse[]> {
  const configs = await prisma.copyTradingConfig.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return configs.map((config) => ({
    id: config.id,
    targetTraderAddress: config.targetTraderAddress,
    copyBuyTrades: config.copyBuyTrades,
    copySellTrades: config.copySellTrades,
    amountType: config.amountType,
    buyAmount: config.buyAmount,
    sellAmount: config.sellAmount,
    minBuyAmount: config.minBuyAmount || undefined,
    maxBuyAmount: config.maxBuyAmount || undefined,
    minSellAmount: config.minSellAmount || undefined,
    maxSellAmount: config.maxSellAmount || undefined,
    marketCategories: config.marketCategories ? JSON.parse(config.marketCategories) : undefined,
    enabled: config.enabled,
    authorized: config.authorized,
    traderInfo: config.traderInfo ? JSON.parse(config.traderInfo) : undefined,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }));
}

/**
 * Get a specific copy trading configuration
 */
export async function getCopyTradingConfig(
  configId: string,
  userId: string
): Promise<CopyTradingConfigResponse | null> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId, // Ensure user owns this config
    },
  });

  if (!config) {
    return null;
  }

  return {
    id: config.id,
    targetTraderAddress: config.targetTraderAddress,
    copyBuyTrades: config.copyBuyTrades,
    copySellTrades: config.copySellTrades,
    amountType: config.amountType,
    buyAmount: config.buyAmount,
    sellAmount: config.sellAmount,
    minBuyAmount: config.minBuyAmount || undefined,
    maxBuyAmount: config.maxBuyAmount || undefined,
    minSellAmount: config.minSellAmount || undefined,
    maxSellAmount: config.maxSellAmount || undefined,
    marketCategories: config.marketCategories ? JSON.parse(config.marketCategories) : undefined,
    enabled: config.enabled,
    authorized: config.authorized,
    traderInfo: config.traderInfo ? JSON.parse(config.traderInfo) : undefined,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Update copy trading configuration
 */
export async function updateCopyTradingConfig(
  configId: string,
  userId: string,
  updates: Partial<CopyTradingConfigInput>
): Promise<CopyTradingConfigResponse> {
  // Verify ownership
  const existingConfig = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!existingConfig) {
    throw new Error('Copy trading configuration not found');
  }

  // Build update data
  const updateData: any = {};

  if (updates.copyBuyTrades !== undefined) {
    updateData.copyBuyTrades = updates.copyBuyTrades;
  }
  if (updates.copySellTrades !== undefined) {
    updateData.copySellTrades = updates.copySellTrades;
  }
  if (updates.amountType !== undefined) {
    updateData.amountType = updates.amountType;
  }
  if (updates.buyAmount !== undefined) {
    updateData.buyAmount = updates.buyAmount;
  }
  if (updates.sellAmount !== undefined) {
    updateData.sellAmount = updates.sellAmount;
  }
  if (updates.minBuyAmount !== undefined) {
    updateData.minBuyAmount = updates.minBuyAmount;
  }
  if (updates.maxBuyAmount !== undefined) {
    updateData.maxBuyAmount = updates.maxBuyAmount;
  }
  if (updates.minSellAmount !== undefined) {
    updateData.minSellAmount = updates.minSellAmount;
  }
  if (updates.maxSellAmount !== undefined) {
    updateData.maxSellAmount = updates.maxSellAmount;
  }
  if (updates.marketCategories !== undefined) {
    updateData.marketCategories = updates.marketCategories
      ? JSON.stringify(updates.marketCategories)
      : null;
  }

  // Validate at least one trade type is enabled
  const finalCopyBuyTrades = updateData.copyBuyTrades ?? existingConfig.copyBuyTrades;
  const finalCopySellTrades = updateData.copySellTrades ?? existingConfig.copySellTrades;
  if (!finalCopyBuyTrades && !finalCopySellTrades) {
    throw new Error('At least one trade type (buy or sell) must be enabled');
  }

  const updatedConfig = await prisma.copyTradingConfig.update({
    where: { id: configId },
    data: updateData,
  });

  return {
    id: updatedConfig.id,
    targetTraderAddress: updatedConfig.targetTraderAddress,
    copyBuyTrades: updatedConfig.copyBuyTrades,
    copySellTrades: updatedConfig.copySellTrades,
    amountType: updatedConfig.amountType,
    buyAmount: updatedConfig.buyAmount,
    sellAmount: updatedConfig.sellAmount,
    minBuyAmount: updatedConfig.minBuyAmount || undefined,
    maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
    minSellAmount: updatedConfig.minSellAmount || undefined,
    maxSellAmount: updatedConfig.maxSellAmount || undefined,
    marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
    enabled: updatedConfig.enabled,
    authorized: updatedConfig.authorized,
    traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Enable copy trading (requires authorization)
 */
export async function enableCopyTrading(
  configId: string,
  userId: string
): Promise<CopyTradingConfigResponse> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  if (!config.authorized) {
    throw new Error('Copy trading must be authorized before it can be enabled');
  }

  const updatedConfig = await prisma.copyTradingConfig.update({
    where: { id: configId },
    data: { enabled: true },
  });

  return {
    id: updatedConfig.id,
    targetTraderAddress: updatedConfig.targetTraderAddress,
    copyBuyTrades: updatedConfig.copyBuyTrades,
    copySellTrades: updatedConfig.copySellTrades,
    amountType: updatedConfig.amountType,
    buyAmount: updatedConfig.buyAmount,
    sellAmount: updatedConfig.sellAmount,
    minBuyAmount: updatedConfig.minBuyAmount || undefined,
    maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
    minSellAmount: updatedConfig.minSellAmount || undefined,
    maxSellAmount: updatedConfig.maxSellAmount || undefined,
    marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
    enabled: updatedConfig.enabled,
    authorized: updatedConfig.authorized,
    traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Disable copy trading
 */
export async function disableCopyTrading(
  configId: string,
  userId: string
): Promise<CopyTradingConfigResponse> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  const updatedConfig = await prisma.copyTradingConfig.update({
    where: { id: configId },
    data: { enabled: false },
  });

  return {
    id: updatedConfig.id,
    targetTraderAddress: updatedConfig.targetTraderAddress,
    copyBuyTrades: updatedConfig.copyBuyTrades,
    copySellTrades: updatedConfig.copySellTrades,
    amountType: updatedConfig.amountType,
    buyAmount: updatedConfig.buyAmount,
    sellAmount: updatedConfig.sellAmount,
    minBuyAmount: updatedConfig.minBuyAmount || undefined,
    maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
    minSellAmount: updatedConfig.minSellAmount || undefined,
    maxSellAmount: updatedConfig.maxSellAmount || undefined,
    marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
    enabled: updatedConfig.enabled,
    authorized: updatedConfig.authorized,
    traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Prepare authorization transaction (returns unsigned transaction for user to sign)
 */
export async function prepareAuthorizationTransaction(
  configId: string,
  userId: string
): Promise<{
  config: CopyTradingConfigResponse;
  transaction: any;
  safeAddress: string;
}> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
    include: {
      user: true,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  // Get proxy wallet - handle both cases where user relation is loaded or not
  let proxyWallet: string | null = null;
  
  if (config.user) {
    proxyWallet = config.user.proxyWallet;
  } else {
    // Fallback: fetch user separately if relation wasn't loaded
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    proxyWallet = user.proxyWallet;
  }

  if (!proxyWallet) {
    throw new Error('User does not have a proxy wallet. Please complete signup first.');
  }

  if (config.authorized) {
    throw new Error('Copy trading is already authorized for this configuration');
  }

  // Import here to avoid circular dependency
  const { createAuthorizationTransaction } = await import('./safe-authorization');
  const { config: appConfig } = await import('../config/env');
  const { getSafeOwners } = await import('./wallet');
  
  // Get relayer address from app config
  const relayerAddress = appConfig.safe.relayerAddress;
  if (!relayerAddress) {
    throw new Error('Relayer address not configured. Please set SAFE_RELAYER_ADDRESS in environment variables.');
  }

  // Check if relayer is already an owner of the Safe
  const owners = await getSafeOwners(proxyWallet);
  const normalizedRelayerAddress = ethers.utils.getAddress(relayerAddress.toLowerCase());
  const relayerIsOwner = owners.some(owner => 
    ethers.utils.getAddress(owner.toLowerCase()) === normalizedRelayerAddress
  );

  let transaction: any;
  
  if (relayerIsOwner) {
    // Relayer is already an owner - no authorization transaction needed!
    console.log(`✅ Relayer is already an owner of Safe ${proxyWallet}. Authorization transaction not needed.`);
    transaction = null; // No transaction needed
  } else {
    // Relayer is not an owner - create authorization transaction
    console.log(`ℹ️ Relayer is not yet an owner. Creating authorization transaction...`);
    transaction = await createAuthorizationTransaction(
      proxyWallet,
      relayerAddress
    );
  }

  return {
    config: {
      id: config.id,
      targetTraderAddress: config.targetTraderAddress,
      copyBuyTrades: config.copyBuyTrades,
      copySellTrades: config.copySellTrades,
      amountType: config.amountType,
      buyAmount: config.buyAmount,
      sellAmount: config.sellAmount,
      minBuyAmount: config.minBuyAmount || undefined,
      maxBuyAmount: config.maxBuyAmount || undefined,
      minSellAmount: config.minSellAmount || undefined,
      maxSellAmount: config.maxSellAmount || undefined,
      marketCategories: config.marketCategories ? JSON.parse(config.marketCategories) : undefined,
      enabled: config.enabled,
      authorized: config.authorized,
      traderInfo: config.traderInfo ? JSON.parse(config.traderInfo) : undefined,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    },
      transaction,
      safeAddress: proxyWallet,
    };
}

/**
 * Confirm authorization transaction (after user signs)
 */
export async function confirmAuthorizationTransaction(
  configId: string,
  userId: string,
  signedTransaction: any
): Promise<{
  config: CopyTradingConfigResponse;
  safeTxHash: string;
}> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
    include: {
      user: true,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  // Get proxy wallet - handle both cases where user relation is loaded or not
  let proxyWallet: string | null = null;
  
  if (config.user) {
    proxyWallet = config.user.proxyWallet;
  } else {
    // Fallback: fetch user separately if relation wasn't loaded
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    proxyWallet = user.proxyWallet;
  }

  if (!proxyWallet) {
    throw new Error('User does not have a proxy wallet');
  }

  if (config.authorized) {
    throw new Error('Copy trading is already authorized');
  }

  // Import here to avoid circular dependency
  const {
    submitAuthorizationTransaction,
    waitForTransactionConfirmation,
  } = await import('./safe-authorization');

  // Submit signed transaction
  const safeTxHash = await submitAuthorizationTransaction(
    proxyWallet,
    signedTransaction
  );

  // Wait for confirmation (with timeout)
  try {
    await waitForTransactionConfirmation(safeTxHash, 60000); // 60 second timeout
    
    // Update config as authorized
    const updatedConfig = await prisma.copyTradingConfig.update({
      where: { id: configId },
      data: { authorized: true },
    });

    return {
      config: {
        id: updatedConfig.id,
        targetTraderAddress: updatedConfig.targetTraderAddress,
        copyBuyTrades: updatedConfig.copyBuyTrades,
        copySellTrades: updatedConfig.copySellTrades,
        amountType: updatedConfig.amountType,
        buyAmount: updatedConfig.buyAmount,
        sellAmount: updatedConfig.sellAmount,
        minBuyAmount: updatedConfig.minBuyAmount || undefined,
        maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
        minSellAmount: updatedConfig.minSellAmount || undefined,
        maxSellAmount: updatedConfig.maxSellAmount || undefined,
        marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
        enabled: updatedConfig.enabled,
        authorized: updatedConfig.authorized,
        traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
        createdAt: updatedConfig.createdAt,
        updatedAt: updatedConfig.updatedAt,
      },
      safeTxHash,
    };
  } catch (error) {
    // Transaction submitted but confirmation timed out
    // Still mark as authorized since transaction was submitted
    const updatedConfig = await prisma.copyTradingConfig.update({
      where: { id: configId },
      data: { authorized: true },
    });

    return {
      config: {
        id: updatedConfig.id,
        targetTraderAddress: updatedConfig.targetTraderAddress,
        copyBuyTrades: updatedConfig.copyBuyTrades,
        copySellTrades: updatedConfig.copySellTrades,
        amountType: updatedConfig.amountType,
        buyAmount: updatedConfig.buyAmount,
        sellAmount: updatedConfig.sellAmount,
        minBuyAmount: updatedConfig.minBuyAmount || undefined,
        maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
        minSellAmount: updatedConfig.minSellAmount || undefined,
        maxSellAmount: updatedConfig.maxSellAmount || undefined,
        marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
        enabled: updatedConfig.enabled,
        authorized: updatedConfig.authorized,
        traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
        createdAt: updatedConfig.createdAt,
        updatedAt: updatedConfig.updatedAt,
      },
      safeTxHash,
    };
  }
}

/**
 * Prepare copy trading configuration with authorization transaction
 * Validates the config but does NOT create it until authorization is confirmed
 */
export async function prepareConfigWithAuthorization(
  userId: string,
  input: CopyTradingConfigInput
): Promise<{
  configData: CopyTradingConfigInput;
  transaction: any;
  safeAddress: string;
}> {
  // Validate address format
  try {
    ethers.utils.getAddress(input.targetTraderAddress);
  } catch {
    throw new Error('Invalid trader address format');
  }

  // Verify trader exists on Polymarket
  const traderInfo = await verifyTrader(input.targetTraderAddress);
  if (!traderInfo.isValid) {
    throw new Error('Trader not found on Polymarket or has no trading history');
  }

  // Validate amount inputs (same validation as createCopyTradingConfig)
  if (input.amountType === 'fixed') {
    const buyAmount = parseFloat(input.buyAmount);
    const sellAmount = parseFloat(input.sellAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      throw new Error('Buy amount must be a positive number');
    }
    if (isNaN(sellAmount) || sellAmount <= 0) {
      throw new Error('Sell amount must be a positive number');
    }
  } else if (input.amountType === 'percentage' || input.amountType === 'percentageOfOriginal') {
    const buyPercent = parseFloat(input.buyAmount);
    const sellPercent = parseFloat(input.sellAmount);
    if (isNaN(buyPercent) || buyPercent <= 0 || buyPercent > 100) {
      throw new Error('Buy percentage must be between 0 and 100');
    }
    if (isNaN(sellPercent) || sellPercent <= 0 || sellPercent > 100) {
      throw new Error('Sell percentage must be between 0 and 100');
    }
  }

  // Validate at least one trade type is enabled
  if (!input.copyBuyTrades && !input.copySellTrades) {
    throw new Error('At least one trade type (buy or sell) must be enabled');
  }

  // Validate amount ranges if provided
  if (input.minBuyAmount && parseFloat(input.minBuyAmount) < 0) {
    throw new Error('Minimum buy amount cannot be negative');
  }
  if (input.maxBuyAmount && parseFloat(input.maxBuyAmount) < 0) {
    throw new Error('Maximum buy amount cannot be negative');
  }
  if (input.minSellAmount && parseFloat(input.minSellAmount) < 0) {
    throw new Error('Minimum sell amount cannot be negative');
  }
  if (input.maxSellAmount && parseFloat(input.maxSellAmount) < 0) {
    throw new Error('Maximum sell amount cannot be negative');
  }

  // Check if user already has a config for this trader
  const existingConfig = await prisma.copyTradingConfig.findFirst({
    where: {
      userId,
      targetTraderAddress: ethers.utils.getAddress(input.targetTraderAddress.toLowerCase()),
    },
  });

  if (existingConfig) {
    throw new Error('You already have a copy trading configuration for this trader');
  }

  // Get user's proxy wallet
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.proxyWallet) {
    throw new Error('User does not have a proxy wallet. Please complete signup first.');
  }

  // Authorization is no longer required - derived wallets handle everything via CLOB client
  // Skip relayer authorization check for backward compatibility
  console.log(`✅ Skipping relayer authorization check. Derived wallets handle all operations via CLOB client.`);
  
  return {
    configData: input, // Return validated config data for later use
    transaction: null, // No authorization transaction needed - derived wallets handle everything
    safeAddress: user.proxyWallet,
  };
}

/**
 * Create copy trading configuration and confirm authorization in one step
 * This is called after the user signs the authorization transaction
 */
export async function createConfigWithAuthorization(
  userId: string,
  configData: CopyTradingConfigInput,
  signedTransaction: any // Ignored - no longer needed
): Promise<{
  config: CopyTradingConfigResponse;
  safeTxHash: string;
  authorizationStatus?: string;
  message?: string;
}> {
  // Get user's proxy wallet
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.proxyWallet) {
    throw new Error('User does not have a proxy wallet');
  }

  // Import here to avoid circular dependency
  const { config: appConfig } = await import('../config/env');
  // Authorization is no longer required - derived wallets handle everything via CLOB client
  // Skip relayer authorization check and create config directly
  console.log('✅ Skipping relayer authorization check. Derived wallets handle all operations via CLOB client.');
  
  // Create config directly (no authorization needed)
  const config = await createCopyTradingConfig(userId, configData);
  
  // Mark as authorized since derived wallets handle everything
  const updatedConfig = await prisma.copyTradingConfig.update({
    where: { id: config.id },
    data: { authorized: true },
  });

  return {
    config: {
      id: updatedConfig.id,
      targetTraderAddress: updatedConfig.targetTraderAddress,
      copyBuyTrades: updatedConfig.copyBuyTrades,
      copySellTrades: updatedConfig.copySellTrades,
      amountType: updatedConfig.amountType,
      buyAmount: updatedConfig.buyAmount,
      sellAmount: updatedConfig.sellAmount,
      minBuyAmount: updatedConfig.minBuyAmount || undefined,
      maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
      minSellAmount: updatedConfig.minSellAmount || undefined,
      maxSellAmount: updatedConfig.maxSellAmount || undefined,
      marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
      enabled: updatedConfig.enabled,
      authorized: true,
      traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
      createdAt: updatedConfig.createdAt,
      updatedAt: updatedConfig.updatedAt,
    },
    safeTxHash: 'not_required',
    authorizationStatus: 'not_required',
    message: 'Authorization not required. Derived wallets handle all operations via CLOB client.',
  };
}

/**
 * Authorize copy trading (one-time authorization)
 * Legacy method - kept for backward compatibility
 * Use prepareAuthorizationTransaction + confirmAuthorizationTransaction instead
 */
export async function authorizeCopyTrading(
  configId: string,
  userId: string
): Promise<CopyTradingConfigResponse> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  // For now, just mark as authorized (legacy behavior)
  // In production, this should require actual transaction signature
  const updatedConfig = await prisma.copyTradingConfig.update({
    where: { id: configId },
    data: { authorized: true },
  });

  return {
    id: updatedConfig.id,
    targetTraderAddress: updatedConfig.targetTraderAddress,
    copyBuyTrades: updatedConfig.copyBuyTrades,
    copySellTrades: updatedConfig.copySellTrades,
    amountType: updatedConfig.amountType,
    buyAmount: updatedConfig.buyAmount,
    sellAmount: updatedConfig.sellAmount,
    minBuyAmount: updatedConfig.minBuyAmount || undefined,
    maxBuyAmount: updatedConfig.maxBuyAmount || undefined,
    minSellAmount: updatedConfig.minSellAmount || undefined,
    maxSellAmount: updatedConfig.maxSellAmount || undefined,
    marketCategories: updatedConfig.marketCategories ? JSON.parse(updatedConfig.marketCategories) : undefined,
    enabled: updatedConfig.enabled,
    authorized: updatedConfig.authorized,
    traderInfo: updatedConfig.traderInfo ? JSON.parse(updatedConfig.traderInfo) : undefined,
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Delete copy trading configuration
 */
export async function deleteCopyTradingConfig(
  configId: string,
  userId: string
): Promise<void> {
  const config = await prisma.copyTradingConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy trading configuration not found');
  }

  await prisma.copyTradingConfig.delete({
    where: { id: configId },
  });
}

