import { prisma } from '../config/database';
import { getUserBalance } from './balance';

export interface CopySignalConfigInput {
  signalCategories: string[];
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
  allocatedUSDCAmount: string; // Required: Amount of USDC to allocate to this config
}

export interface CopySignalConfigResponse {
  id: string;
  signalCategories: string[];
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
  allocatedUSDCAmount: string;
  usedUSDCAmount: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a copy signal configuration for a user
 */
export async function createCopySignalConfig(
  userId: string,
  input: CopySignalConfigInput
): Promise<CopySignalConfigResponse> {
  // Validate signal categories
  if (!input.signalCategories || input.signalCategories.length === 0) {
    throw new Error('At least one signal category must be specified');
  }

  // Validate at least one trade type is enabled
  if (!input.copyBuyTrades && !input.copySellTrades) {
    throw new Error('At least one trade type (buy or sell) must be enabled');
  }

  // Validate amount inputs
  if (input.amountType === 'fixed') {
    const buyAmount = parseFloat(input.buyAmount);
    if (isNaN(buyAmount) || buyAmount <= 0) {
      throw new Error('Buy amount must be a positive number');
    }
    // Only validate sellAmount if copySellTrades is enabled
    if (input.copySellTrades) {
      if (!input.sellAmount) {
        throw new Error('sellAmount is required when copySellTrades is true');
      }
      const sellAmount = parseFloat(input.sellAmount);
      if (isNaN(sellAmount) || sellAmount <= 0) {
        throw new Error('Sell amount must be a positive number');
      }
    }
  } else if (input.amountType === 'percentage' || input.amountType === 'percentageOfOriginal') {
    const buyPercent = parseFloat(input.buyAmount);
    if (isNaN(buyPercent) || buyPercent <= 0 || buyPercent > 100) {
      throw new Error('Buy percentage must be between 0 and 100');
    }
    // Only validate sellAmount if copySellTrades is enabled
    if (input.copySellTrades) {
      if (!input.sellAmount) {
        throw new Error('sellAmount is required when copySellTrades is true');
      }
      const sellPercent = parseFloat(input.sellAmount);
      if (isNaN(sellPercent) || sellPercent <= 0 || sellPercent > 100) {
        throw new Error('Sell percentage must be between 0 and 100');
      }
    }
  }

  // Validate allocatedUSDCAmount
  if (!input.allocatedUSDCAmount) {
    throw new Error('allocatedUSDCAmount is required');
  }
  const allocatedAmount = parseFloat(input.allocatedUSDCAmount);
  if (isNaN(allocatedAmount) || allocatedAmount <= 0) {
    throw new Error('allocatedUSDCAmount must be a positive number');
  }

  // Get user balance and validate allocation
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.proxyWallet) {
    throw new Error('User does not have a proxy wallet');
  }

  // Get user balance from proxy wallet
  const balanceResult = await getUserBalance(user.address);
  const userBalance = parseFloat(balanceResult.balance || '0');
  
  if (allocatedAmount > userBalance) {
    throw new Error(`allocatedUSDCAmount (${allocatedAmount}) exceeds user balance (${userBalance})`);
  }

  // Calculate remaining balance (balance - sum of all other config allocations)
  // Include both copy trading and copy signal configs
  const allTradingConfigs = await prisma.copyTradingConfig.findMany({
    where: { userId },
  });
  
  const allSignalConfigs = await prisma.copySignalConfig.findMany({
    where: { userId },
  });
  
  const totalAllocatedTrading = allTradingConfigs.reduce((sum, config) => {
    return sum + parseFloat(config.allocatedUSDCAmount || '0');
  }, 0);
  
  const totalAllocatedSignals = allSignalConfigs.reduce((sum, config) => {
    return sum + parseFloat(config.allocatedUSDCAmount || '0');
  }, 0);
  
  const totalAllocated = totalAllocatedTrading + totalAllocatedSignals;
  const remainingBalance = userBalance - totalAllocated;
  
  if (allocatedAmount > remainingBalance) {
    throw new Error(`allocatedUSDCAmount (${allocatedAmount}) exceeds remaining balance (${remainingBalance}). Total already allocated: ${totalAllocated}`);
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

  // Create configuration
  const config = await prisma.copySignalConfig.create({
    data: {
      userId,
      signalCategories: JSON.stringify(input.signalCategories),
      copyBuyTrades: input.copyBuyTrades,
      copySellTrades: input.copySellTrades,
      amountType: input.amountType,
      buyAmount: input.buyAmount,
      // sellAmount is required in schema, so use a default value if copySellTrades is false
      sellAmount: input.copySellTrades ? input.sellAmount : (input.sellAmount || '0'),
      minBuyAmount: input.minBuyAmount,
      maxBuyAmount: input.maxBuyAmount,
      minSellAmount: input.minSellAmount,
      maxSellAmount: input.maxSellAmount,
      marketCategories: input.marketCategories ? JSON.stringify(input.marketCategories) : null,
      enabled: false, // Must be explicitly enabled
      authorized: false, // Must be authorized separately
      allocatedUSDCAmount: input.allocatedUSDCAmount,
      usedUSDCAmount: '0', // Start with zero usage
    },
  });

  return {
    id: config.id,
    signalCategories: JSON.parse(config.signalCategories),
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
    allocatedUSDCAmount: config.allocatedUSDCAmount,
    usedUSDCAmount: config.usedUSDCAmount || '0',
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Get all copy signal configurations for a user
 */
export async function getUserCopySignalConfigs(userId: string): Promise<CopySignalConfigResponse[]> {
  const configs = await prisma.copySignalConfig.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return configs.map((config) => ({
    id: config.id,
    signalCategories: JSON.parse(config.signalCategories),
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
    allocatedUSDCAmount: config.allocatedUSDCAmount,
    usedUSDCAmount: config.usedUSDCAmount || '0',
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }));
}

/**
 * Get a specific copy signal configuration
 */
export async function getCopySignalConfig(
  configId: string,
  userId: string
): Promise<CopySignalConfigResponse | null> {
  const config = await prisma.copySignalConfig.findFirst({
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
    signalCategories: JSON.parse(config.signalCategories),
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
    allocatedUSDCAmount: config.allocatedUSDCAmount,
    usedUSDCAmount: config.usedUSDCAmount || '0',
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

/**
 * Update copy signal configuration
 */
export async function updateCopySignalConfig(
  configId: string,
  userId: string,
  updates: Partial<CopySignalConfigInput>
): Promise<CopySignalConfigResponse> {
  // Verify ownership
  const existingConfig = await prisma.copySignalConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!existingConfig) {
    throw new Error('Copy signal configuration not found');
  }

  // Build update data
  const updateData: any = {};

  if (updates.signalCategories !== undefined) {
    if (updates.signalCategories.length === 0) {
      throw new Error('At least one signal category must be specified');
    }
    updateData.signalCategories = JSON.stringify(updates.signalCategories);
  }
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
  if (updates.allocatedUSDCAmount !== undefined) {
    // Validate allocatedUSDCAmount if being updated
    const allocatedAmount = parseFloat(updates.allocatedUSDCAmount);
    if (isNaN(allocatedAmount) || allocatedAmount <= 0) {
      throw new Error('allocatedUSDCAmount must be a positive number');
    }

    // Get user balance and validate allocation
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user || !user.proxyWallet) {
      throw new Error('User not found or does not have a proxy wallet');
    }

    const balanceResult = await getUserBalance(user.address);
    const userBalance = parseFloat(balanceResult.balance || '0');
    
    if (allocatedAmount > userBalance) {
      throw new Error(`allocatedUSDCAmount (${allocatedAmount}) exceeds user balance (${userBalance})`);
    }

    // Calculate remaining balance (balance - sum of all other config allocations, excluding current config)
    const allTradingConfigs = await prisma.copyTradingConfig.findMany({
      where: { userId },
    });
    
    const allSignalConfigs = await prisma.copySignalConfig.findMany({
      where: { userId },
    });
    
    const totalAllocatedTrading = allTradingConfigs.reduce((sum, config) => {
      return sum + parseFloat(config.allocatedUSDCAmount || '0');
    }, 0);
    
    const totalAllocatedSignals = allSignalConfigs
      .filter(config => config.id !== configId)
      .reduce((sum, config) => {
        return sum + parseFloat(config.allocatedUSDCAmount || '0');
      }, 0);
    
    const totalAllocated = totalAllocatedTrading + totalAllocatedSignals;
    const remainingBalance = userBalance - totalAllocated;
    
    if (allocatedAmount > remainingBalance) {
      throw new Error(`allocatedUSDCAmount (${allocatedAmount}) exceeds remaining balance (${remainingBalance}). Total already allocated: ${totalAllocated}`);
    }

    updateData.allocatedUSDCAmount = updates.allocatedUSDCAmount;
  }

  // Validate at least one trade type is enabled
  const finalCopyBuyTrades = updateData.copyBuyTrades ?? existingConfig.copyBuyTrades;
  const finalCopySellTrades = updateData.copySellTrades ?? existingConfig.copySellTrades;
  if (!finalCopyBuyTrades && !finalCopySellTrades) {
    throw new Error('At least one trade type (buy or sell) must be enabled');
  }

  const updatedConfig = await prisma.copySignalConfig.update({
    where: { id: configId },
    data: updateData,
  });

  return {
    id: updatedConfig.id,
    signalCategories: JSON.parse(updatedConfig.signalCategories),
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
    allocatedUSDCAmount: updatedConfig.allocatedUSDCAmount,
    usedUSDCAmount: updatedConfig.usedUSDCAmount || '0',
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Enable copy signals (requires authorization)
 */
export async function enableCopySignals(
  configId: string,
  userId: string
): Promise<CopySignalConfigResponse> {
  const config = await prisma.copySignalConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy signal configuration not found');
  }

  if (!config.authorized) {
    throw new Error('Copy signals must be authorized before they can be enabled');
  }

  const updatedConfig = await prisma.copySignalConfig.update({
    where: { id: configId },
    data: { enabled: true },
  });

  return {
    id: updatedConfig.id,
    signalCategories: JSON.parse(updatedConfig.signalCategories),
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
    allocatedUSDCAmount: updatedConfig.allocatedUSDCAmount,
    usedUSDCAmount: updatedConfig.usedUSDCAmount || '0',
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Disable copy signals
 */
export async function disableCopySignals(
  configId: string,
  userId: string
): Promise<CopySignalConfigResponse> {
  const config = await prisma.copySignalConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    // Check if config exists but belongs to different user
    const configExists = await prisma.copySignalConfig.findUnique({
      where: { id: configId },
    });
    
    if (configExists) {
      throw new Error('Copy signal configuration not found or access denied');
    }
    
    // Check if this is actually a copy trading config (wrong endpoint)
    const copyTradingConfig = await prisma.copyTradingConfig.findUnique({
      where: { id: configId },
    });
    
    if (copyTradingConfig) {
      throw new Error('This is a copy trading configuration, not a copy signal configuration. Use /copytrading/config/{configId}/disable instead.');
    }
    
    throw new Error('Copy signal configuration not found');
  }

  const updatedConfig = await prisma.copySignalConfig.update({
    where: { id: configId },
    data: { enabled: false },
  });

  return {
    id: updatedConfig.id,
    signalCategories: JSON.parse(updatedConfig.signalCategories),
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
    allocatedUSDCAmount: updatedConfig.allocatedUSDCAmount,
    usedUSDCAmount: updatedConfig.usedUSDCAmount || '0',
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Authorize copy signals (one-time authorization)
 */
export async function authorizeCopySignals(
  configId: string,
  userId: string
): Promise<CopySignalConfigResponse> {
  const config = await prisma.copySignalConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy signal configuration not found');
  }

  const updatedConfig = await prisma.copySignalConfig.update({
    where: { id: configId },
    data: { authorized: true },
  });

  return {
    id: updatedConfig.id,
    signalCategories: JSON.parse(updatedConfig.signalCategories),
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
    allocatedUSDCAmount: updatedConfig.allocatedUSDCAmount,
    usedUSDCAmount: updatedConfig.usedUSDCAmount || '0',
    createdAt: updatedConfig.createdAt,
    updatedAt: updatedConfig.updatedAt,
  };
}

/**
 * Delete copy signal configuration
 */
export async function deleteCopySignalConfig(
  configId: string,
  userId: string
): Promise<void> {
  const config = await prisma.copySignalConfig.findFirst({
    where: {
      id: configId,
      userId,
    },
  });

  if (!config) {
    throw new Error('Copy signal configuration not found');
  }

  await prisma.copySignalConfig.delete({
    where: { id: configId },
  });
}

