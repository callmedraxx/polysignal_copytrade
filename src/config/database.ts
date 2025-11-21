import { PrismaClient, User, Deposit } from '@prisma/client';
import { isProduction } from './env';
import { randomUUID } from 'crypto';

// In-memory database for development/testing
interface InMemoryUser {
  id: string;
  address: string;
  username: string | null;
  nonce: string | null;
  proxyWallet: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryDeposit {
  id: string;
  userId: string;
  onramperOrderId: string | null;
  sourceCurrency: string;
  sourceAmount: string;
  targetAmount: string | null;
  status: string;
  transactionHash: string | null;
  proxyWallet: string;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory copy trading models
interface InMemoryCopyTradingConfig {
  id: string;
  userId: string;
  targetTraderAddress: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: string;
  buyAmount: string;
  sellAmount: string;
  minBuyAmount: string | null;
  maxBuyAmount: string | null;
  minSellAmount: string | null;
  maxSellAmount: string | null;
  marketCategories: string | null;
  enabled: boolean;
  authorized: boolean;
  slippageTolerance: string;
  maxRetries: number;
  traderInfo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryCopiedTrade {
  id: string;
  configId: string;
  originalTrader: string;
  originalTxHash: string;
  marketId: string;
  marketQuestion: string | null;
  outcomeIndex: number;
  tradeType: string;
  originalAmount: string;
  originalPrice: string | null;
  originalShares: string | null;
  copiedTxHash: string | null;
  copiedAmount: string;
  copiedPrice: string | null;
  copiedShares: string | null;
  status: string;
  errorMessage: string | null;
  outcome: string | null;
  pnl: string | null;
  resolvedAt: Date | null;
  resolutionPrice: string | null;
  executedAt: Date | null;
  createdAt: Date;
}

// In-memory copy signal models
interface InMemoryCopySignalConfig {
  id: string;
  userId: string;
  signalCategories: string;
  copyBuyTrades: boolean;
  copySellTrades: boolean;
  amountType: string;
  buyAmount: string;
  sellAmount: string;
  minBuyAmount: string | null;
  maxBuyAmount: string | null;
  minSellAmount: string | null;
  maxSellAmount: string | null;
  marketCategories: string | null;
  enabled: boolean;
  authorized: boolean;
  slippageTolerance: string;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
}

interface InMemoryCopiedSignal {
  id: string;
  configId: string;
  signalId: string;
  category: string;
  originalTxHash: string | null;
  marketId: string;
  marketQuestion: string | null;
  outcomeIndex: number;
  tradeType: string;
  originalAmount: string;
  originalPrice: string | null;
  originalShares: string | null;
  orderId: string | null;
  orderStatus: string | null;
  copiedTxHash: string | null;
  copiedAmount: string;
  copiedPrice: string | null;
  copiedShares: string | null;
  status: string;
  errorMessage: string | null;
  submittedAt: Date | null;
  settledAt: Date | null;
  outcome: string | null;
  pnl: string | null;
  resolvedAt: Date | null;
  resolutionPrice: string | null;
  currentPrice: string | null;
  currentValue: string | null;
  unrealizedPnl: string | null;
  costBasis: string | null;
  lastPriceUpdate: Date | null;
  failureReason: string | null;
  failureCategory: string | null;
  redemptionStatus: string | null;
  redemptionTxHash: string | null;
  redeemedAt: Date | null;
  redemptionError: string | null;
  executedAt: Date | null;
  createdAt: Date;
}

const inMemoryUsers: Map<string, InMemoryUser> = new Map();
const inMemoryUsersByUsername: Map<string, InMemoryUser> = new Map();
const inMemoryDeposits: Map<string, InMemoryDeposit> = new Map();
const inMemoryDepositsByUserId: Map<string, string[]> = new Map(); // userId -> depositIds[]
const inMemoryDepositsByOrderId: Map<string, string> = new Map(); // onramperOrderId -> depositId
const inMemoryCopyTradingConfigs: Map<string, InMemoryCopyTradingConfig> = new Map();
const inMemoryCopyTradingConfigsByUserId: Map<string, string[]> = new Map(); // userId -> configIds[]
const inMemoryCopyTradingConfigsByTrader: Map<string, string[]> = new Map(); // traderAddress -> configIds[]
const inMemoryCopiedTrades: Map<string, InMemoryCopiedTrade> = new Map();
const inMemoryCopiedTradesByConfigId: Map<string, string[]> = new Map(); // configId -> tradeIds[]
const inMemoryCopySignalConfigs: Map<string, InMemoryCopySignalConfig> = new Map();
const inMemoryCopySignalConfigsByUserId: Map<string, string[]> = new Map(); // userId -> configIds[]
const inMemoryCopiedSignals: Map<string, InMemoryCopiedSignal> = new Map();
const inMemoryCopiedSignalsByConfigId: Map<string, string[]> = new Map(); // configId -> signalIds[]

// Create in-memory Prisma client mock
function createInMemoryPrisma() {
  return {
    $connect: async () => {},
    $disconnect: async () => {},
    user: {
      async upsert(args: {
        where: { address: string };
        update: { nonce?: string; proxyWallet?: string; username?: string };
        create: { address: string; nonce: string; proxyWallet?: string; username?: string };
      }): Promise<User> {
        const address = args.where.address.toLowerCase();
        const existing = inMemoryUsers.get(address);
        
        if (existing) {
          if (args.update.nonce !== undefined) {
            existing.nonce = args.update.nonce;
          }
          if (args.update.proxyWallet !== undefined) {
            existing.proxyWallet = args.update.proxyWallet;
          }
          if (args.update.username !== undefined) {
            // Remove old username mapping if exists
            if (existing.username) {
              inMemoryUsersByUsername.delete(existing.username.toLowerCase());
            }
            // Add new username mapping
            if (args.update.username) {
              existing.username = args.update.username;
              inMemoryUsersByUsername.set(args.update.username.toLowerCase(), existing);
            } else {
              existing.username = null;
            }
          }
          existing.updatedAt = new Date();
          return existing as User;
        } else {
          const newUser: InMemoryUser = {
            id: randomUUID(),
            address: args.create.address.toLowerCase(),
            username: args.create.username || null,
            nonce: args.create.nonce,
            proxyWallet: args.create.proxyWallet || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          inMemoryUsers.set(address, newUser);
          if (newUser.username) {
            inMemoryUsersByUsername.set(newUser.username.toLowerCase(), newUser);
          }
          return newUser as User;
        }
      },
      async findUnique(args: { 
        where: { address?: string; username?: string; id?: string };
        include?: { deposits?: boolean };
      }): Promise<User | null> {
        let user: InMemoryUser | undefined;
        
        if (args.where.address) {
          const address = args.where.address.toLowerCase();
          user = inMemoryUsers.get(address);
        } else if (args.where.username) {
          const username = args.where.username.toLowerCase();
          user = inMemoryUsersByUsername.get(username);
        } else if (args.where.id) {
          user = Array.from(inMemoryUsers.values()).find((u) => u.id === args.where.id);
        }

        if (!user) {
          return null;
        }

        // If include deposits, add deposits relation
        if (args.include?.deposits) {
          const depositIds = inMemoryDepositsByUserId.get(user.id) || [];
          const deposits = depositIds
            .map((id) => inMemoryDeposits.get(id))
            .filter((d): d is InMemoryDeposit => d !== undefined);
          return { ...user, deposits } as User;
        }

        return user as User;
      },
      async findFirst(args: { 
        where: { username?: string } 
      }): Promise<User | null> {
        if (args.where.username) {
          const username = args.where.username.toLowerCase();
          const user = inMemoryUsersByUsername.get(username);
          return user ? (user as User) : null;
        }
        return null;
      },
      async findMany(args?: {
        where?: { 
          address?: string;
          proxyWallet?: { not: null } | null;
        };
        select?: {
          address?: boolean;
          proxyWallet?: boolean;
        };
      }): Promise<User[]> {
        let users: InMemoryUser[] = Array.from(inMemoryUsers.values());
        
        // Filter by proxyWallet if specified
        if (args?.where?.proxyWallet) {
          if (args.where.proxyWallet.not === null) {
            // Find users where proxyWallet is NOT null
            users = users.filter((u) => u.proxyWallet !== null);
          }
        }
        
        // Apply select if specified
        if (args?.select) {
          return users.map((user) => {
            const selected: any = {};
            if (args.select!.address) selected.address = user.address;
            if (args.select!.proxyWallet) selected.proxyWallet = user.proxyWallet;
            return selected as User;
          });
        }
        
        return users as User[];
      },
      async update(args: {
        where: { address?: string; username?: string };
        data: { nonce?: string | null; proxyWallet?: string | null; username?: string | null };
      }): Promise<User> {
        let user: InMemoryUser | undefined;
        
        if (args.where.address) {
          const address = args.where.address.toLowerCase();
          user = inMemoryUsers.get(address);
        } else if (args.where.username) {
          const username = args.where.username.toLowerCase();
          user = inMemoryUsersByUsername.get(username);
        }
        
        if (!user) {
          throw new Error('User not found');
        }
        
        if (args.data.nonce !== undefined) {
          user.nonce = args.data.nonce;
        }
        if (args.data.proxyWallet !== undefined) {
          user.proxyWallet = args.data.proxyWallet;
        }
        if (args.data.username !== undefined) {
          // Remove old username mapping if exists
          if (user.username) {
            inMemoryUsersByUsername.delete(user.username.toLowerCase());
          }
          // Add new username mapping
          if (args.data.username) {
            user.username = args.data.username;
            inMemoryUsersByUsername.set(args.data.username.toLowerCase(), user);
          } else {
            user.username = null;
          }
        }
        user.updatedAt = new Date();
        return user as User;
      },
    },
    deposit: {
      async create(args: {
        data: {
          userId: string;
          sourceCurrency: string;
          sourceAmount: string;
          proxyWallet: string;
          status?: string;
          onramperOrderId?: string | null;
          targetAmount?: string | null;
          transactionHash?: string | null;
          metadata?: string | null;
        };
      }): Promise<Deposit> {
        const deposit: InMemoryDeposit = {
          id: randomUUID(),
          userId: args.data.userId,
          onramperOrderId: args.data.onramperOrderId || null,
          sourceCurrency: args.data.sourceCurrency,
          sourceAmount: args.data.sourceAmount,
          targetAmount: args.data.targetAmount || null,
          status: args.data.status || 'pending',
          transactionHash: args.data.transactionHash || null,
          proxyWallet: args.data.proxyWallet,
          metadata: args.data.metadata || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        inMemoryDeposits.set(deposit.id, deposit);

        // Update user's deposit list
        const userDeposits = inMemoryDepositsByUserId.get(args.data.userId) || [];
        userDeposits.push(deposit.id);
        inMemoryDepositsByUserId.set(args.data.userId, userDeposits);

        // Map order ID if provided
        if (deposit.onramperOrderId) {
          inMemoryDepositsByOrderId.set(deposit.onramperOrderId, deposit.id);
        }

        return deposit as Deposit;
      },
      async findUnique(args: {
        where: { id?: string; onramperOrderId?: string };
      }): Promise<Deposit | null> {
        if (args.where.id) {
          const deposit = inMemoryDeposits.get(args.where.id);
          return deposit ? (deposit as Deposit) : null;
        }
        if (args.where.onramperOrderId) {
          const depositId = inMemoryDepositsByOrderId.get(args.where.onramperOrderId);
          if (depositId) {
            const deposit = inMemoryDeposits.get(depositId);
            return deposit ? (deposit as Deposit) : null;
          }
        }
        return null;
      },
      async update(args: {
        where: { id: string };
        data: {
          onramperOrderId?: string | null;
          targetAmount?: string | null;
          status?: string;
          transactionHash?: string | null;
          metadata?: string | null;
        };
      }): Promise<Deposit> {
        const deposit = inMemoryDeposits.get(args.where.id);
        if (!deposit) {
          throw new Error('Deposit not found');
        }

        if (args.data.onramperOrderId !== undefined) {
          // Remove old order ID mapping if exists
          if (deposit.onramperOrderId) {
            inMemoryDepositsByOrderId.delete(deposit.onramperOrderId);
          }
          // Add new order ID mapping
          if (args.data.onramperOrderId) {
            deposit.onramperOrderId = args.data.onramperOrderId;
            inMemoryDepositsByOrderId.set(args.data.onramperOrderId, deposit.id);
          } else {
            deposit.onramperOrderId = null;
          }
        }
        if (args.data.targetAmount !== undefined) {
          deposit.targetAmount = args.data.targetAmount;
        }
        if (args.data.status !== undefined) {
          deposit.status = args.data.status;
        }
        if (args.data.transactionHash !== undefined) {
          deposit.transactionHash = args.data.transactionHash;
        }
        if (args.data.metadata !== undefined) {
          deposit.metadata = args.data.metadata;
        }
        deposit.updatedAt = new Date();

        return deposit as Deposit;
      },
      async findMany(args?: {
        where?: { userId?: string };
        orderBy?: { createdAt: 'asc' | 'desc' };
      }): Promise<Deposit[]> {
        let deposits: InMemoryDeposit[] = [];

        if (args?.where?.userId) {
          const depositIds = inMemoryDepositsByUserId.get(args.where.userId) || [];
          deposits = depositIds
            .map((id) => inMemoryDeposits.get(id))
            .filter((d): d is InMemoryDeposit => d !== undefined);
        } else {
          deposits = Array.from(inMemoryDeposits.values());
        }

        // Sort if orderBy is specified
        if (args?.orderBy) {
          deposits.sort((a, b) => {
            const comparison = a.createdAt.getTime() - b.createdAt.getTime();
            return args.orderBy!.createdAt === 'desc' ? -comparison : comparison;
          });
        }

        return deposits as Deposit[];
      },
    },
    copyTradingConfig: {
      async create(args: {
        data: {
          userId: string;
          targetTraderAddress: string;
          copyBuyTrades: boolean;
          copySellTrades: boolean;
          amountType: string;
          buyAmount: string;
          sellAmount: string;
          minBuyAmount?: string | null;
          maxBuyAmount?: string | null;
          minSellAmount?: string | null;
          maxSellAmount?: string | null;
          marketCategories?: string | null;
          enabled?: boolean;
          authorized?: boolean;
          traderInfo?: string | null;
        };
      }): Promise<any> {
        // Enforce uniqueness: each user can only have one config per trader
        const normalizedTraderAddress = args.data.targetTraderAddress.toLowerCase();
        const userConfigs = inMemoryCopyTradingConfigsByUserId.get(args.data.userId) || [];
        const existingConfig = userConfigs.find((configId) => {
          const config = inMemoryCopyTradingConfigs.get(configId);
          return config && config.targetTraderAddress === normalizedTraderAddress;
        });
        
        if (existingConfig) {
          throw new Error('You already have a copy trading configuration for this trader');
        }

        const config: InMemoryCopyTradingConfig = {
          id: randomUUID(),
          userId: args.data.userId,
          targetTraderAddress: args.data.targetTraderAddress.toLowerCase(),
          copyBuyTrades: args.data.copyBuyTrades,
          copySellTrades: args.data.copySellTrades,
          amountType: args.data.amountType,
          buyAmount: args.data.buyAmount,
          sellAmount: args.data.sellAmount,
          minBuyAmount: args.data.minBuyAmount || null,
          maxBuyAmount: args.data.maxBuyAmount || null,
          minSellAmount: args.data.minSellAmount || null,
          maxSellAmount: args.data.maxSellAmount || null,
          marketCategories: args.data.marketCategories || null,
          enabled: args.data.enabled ?? false,
          authorized: args.data.authorized ?? false,
          slippageTolerance: args.data.slippageTolerance || '0.05',
          maxRetries: args.data.maxRetries ?? 3,
          traderInfo: args.data.traderInfo || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        inMemoryCopyTradingConfigs.set(config.id, config);

        // Update user's config list (reuse the variable from uniqueness check)
        userConfigs.push(config.id);
        inMemoryCopyTradingConfigsByUserId.set(args.data.userId, userConfigs);

        // Update trader's config list (for tracking which users are copying this trader)
        const traderConfigs = inMemoryCopyTradingConfigsByTrader.get(config.targetTraderAddress) || [];
        traderConfigs.push(config.id);
        inMemoryCopyTradingConfigsByTrader.set(config.targetTraderAddress, traderConfigs);

        return config;
      },
      async findFirst(args: {
        where: {
          userId?: string;
          targetTraderAddress?: string;
          id?: string;
        };
      }): Promise<any | null> {
        if (args.where.id) {
          return inMemoryCopyTradingConfigs.get(args.where.id) || null;
        }
        if (args.where.userId && args.where.targetTraderAddress) {
          const userConfigs = inMemoryCopyTradingConfigsByUserId.get(args.where.userId) || [];
          const traderAddress = args.where.targetTraderAddress.toLowerCase();
          for (const configId of userConfigs) {
            const config = inMemoryCopyTradingConfigs.get(configId);
            if (config && config.targetTraderAddress === traderAddress) {
              return config;
            }
          }
        }
        return null;
      },
      async findMany(args?: {
        where?: { userId?: string };
        orderBy?: { createdAt: 'asc' | 'desc' };
      }): Promise<any[]> {
        let configs: InMemoryCopyTradingConfig[] = [];

        if (args?.where?.userId) {
          const configIds = inMemoryCopyTradingConfigsByUserId.get(args.where.userId) || [];
          configs = configIds
            .map((id) => inMemoryCopyTradingConfigs.get(id))
            .filter((c): c is InMemoryCopyTradingConfig => c !== undefined);
        } else {
          configs = Array.from(inMemoryCopyTradingConfigs.values());
        }

        // Sort if orderBy is specified
        if (args?.orderBy) {
          configs.sort((a, b) => {
            const comparison = a.createdAt.getTime() - b.createdAt.getTime();
            return args.orderBy!.createdAt === 'desc' ? -comparison : comparison;
          });
        }

        return configs;
      },
      async findUnique(args: {
        where: { id: string };
        include?: {
          user?: boolean;
        };
      }): Promise<any | null> {
        const config = inMemoryCopyTradingConfigs.get(args.where.id);
        if (!config) {
          return null;
        }

        // If include user is requested, fetch the user by userId
        if (args.include?.user) {
          // Users are stored by address, so we need to find by id
          const user = Array.from(inMemoryUsers.values()).find((u) => u.id === config.userId);
          return user ? { ...config, user } : config;
        }

        return config;
      },
      async update(args: {
        where: { id: string };
        data: {
          copyBuyTrades?: boolean;
          copySellTrades?: boolean;
          amountType?: string;
          buyAmount?: string;
          sellAmount?: string;
          minBuyAmount?: string | null;
          maxBuyAmount?: string | null;
          minSellAmount?: string | null;
          maxSellAmount?: string | null;
          marketCategories?: string | null;
          enabled?: boolean;
          authorized?: boolean;
          slippageTolerance?: string;
          maxRetries?: number;
          traderInfo?: string | null;
        };
      }): Promise<any> {
        const config = inMemoryCopyTradingConfigs.get(args.where.id);
        if (!config) {
          throw new Error('CopyTradingConfig not found');
        }

        if (args.data.copyBuyTrades !== undefined) {
          config.copyBuyTrades = args.data.copyBuyTrades;
        }
        if (args.data.copySellTrades !== undefined) {
          config.copySellTrades = args.data.copySellTrades;
        }
        if (args.data.amountType !== undefined) {
          config.amountType = args.data.amountType;
        }
        if (args.data.buyAmount !== undefined) {
          config.buyAmount = args.data.buyAmount;
        }
        if (args.data.sellAmount !== undefined) {
          config.sellAmount = args.data.sellAmount;
        }
        if (args.data.minBuyAmount !== undefined) {
          config.minBuyAmount = args.data.minBuyAmount;
        }
        if (args.data.maxBuyAmount !== undefined) {
          config.maxBuyAmount = args.data.maxBuyAmount;
        }
        if (args.data.minSellAmount !== undefined) {
          config.minSellAmount = args.data.minSellAmount;
        }
        if (args.data.maxSellAmount !== undefined) {
          config.maxSellAmount = args.data.maxSellAmount;
        }
        if (args.data.marketCategories !== undefined) {
          config.marketCategories = args.data.marketCategories;
        }
        if (args.data.enabled !== undefined) {
          config.enabled = args.data.enabled;
        }
        if (args.data.authorized !== undefined) {
          config.authorized = args.data.authorized;
        }
        if (args.data.slippageTolerance !== undefined) {
          config.slippageTolerance = args.data.slippageTolerance;
        }
        if (args.data.maxRetries !== undefined) {
          config.maxRetries = args.data.maxRetries;
        }
        if (args.data.traderInfo !== undefined) {
          config.traderInfo = args.data.traderInfo;
        }
        config.updatedAt = new Date();

        return config;
      },
      async delete(args: {
        where: { id: string };
      }): Promise<any> {
        const config = inMemoryCopyTradingConfigs.get(args.where.id);
        if (!config) {
          throw new Error('CopyTradingConfig not found');
        }

        // Remove from user's config list
        const userConfigs = inMemoryCopyTradingConfigsByUserId.get(config.userId) || [];
        const updatedUserConfigs = userConfigs.filter((id) => id !== config.id);
        inMemoryCopyTradingConfigsByUserId.set(config.userId, updatedUserConfigs);

        // Remove from trader's config list
        const traderConfigs = inMemoryCopyTradingConfigsByTrader.get(config.targetTraderAddress) || [];
        const updatedTraderConfigs = traderConfigs.filter((id) => id !== config.id);
        if (updatedTraderConfigs.length > 0) {
          inMemoryCopyTradingConfigsByTrader.set(config.targetTraderAddress, updatedTraderConfigs);
        } else {
          inMemoryCopyTradingConfigsByTrader.delete(config.targetTraderAddress);
        }

        inMemoryCopyTradingConfigs.delete(config.id);
        return config;
      },
    },
    copiedTrade: {
      async create(args: {
        data: {
          configId: string;
          originalTrader: string;
          originalTxHash: string;
          marketId: string;
          marketQuestion?: string | null;
          outcomeIndex: number;
          tradeType: string;
          originalAmount: string;
          originalPrice?: string | null;
          originalShares?: string | null;
          copiedAmount: string;
          copiedPrice?: string | null;
          copiedShares?: string | null;
          copiedTxHash?: string | null;
          status?: string;
          errorMessage?: string | null;
          outcome?: string | null;
          pnl?: string | null;
          resolvedAt?: Date | null;
          resolutionPrice?: string | null;
          executedAt?: Date | null;
        };
      }): Promise<any> {
        const trade: InMemoryCopiedTrade = {
          id: randomUUID(),
          configId: args.data.configId,
          originalTrader: args.data.originalTrader,
          originalTxHash: args.data.originalTxHash,
          marketId: args.data.marketId,
          marketQuestion: args.data.marketQuestion || null,
          outcomeIndex: args.data.outcomeIndex,
          tradeType: args.data.tradeType,
          originalAmount: args.data.originalAmount,
          originalPrice: args.data.originalPrice || null,
          originalShares: args.data.originalShares || null,
          copiedAmount: args.data.copiedAmount,
          copiedPrice: args.data.copiedPrice || null,
          copiedShares: args.data.copiedShares || null,
          copiedTxHash: args.data.copiedTxHash || null,
          status: args.data.status || 'pending',
          errorMessage: args.data.errorMessage || null,
          outcome: args.data.outcome || null,
          pnl: args.data.pnl || null,
          resolvedAt: args.data.resolvedAt || null,
          resolutionPrice: args.data.resolutionPrice || null,
          executedAt: args.data.executedAt || null,
          createdAt: new Date(),
        };

        inMemoryCopiedTrades.set(trade.id, trade);

        // Update config's trade list
        const configTrades = inMemoryCopiedTradesByConfigId.get(args.data.configId) || [];
        configTrades.push(trade.id);
        inMemoryCopiedTradesByConfigId.set(args.data.configId, configTrades);

        return trade;
      },
      async findUnique(args: {
        where: { id: string };
        include?: {
          config?: {
            include?: {
              user?: boolean;
            };
          };
        };
      }): Promise<any | null> {
        const trade = inMemoryCopiedTrades.get(args.where.id);
        if (!trade) {
          return null;
        }

        // If include config is requested, fetch the config
        if (args.include?.config) {
          const config = inMemoryCopyTradingConfigs.get(trade.configId);
          if (!config) {
            return trade;
          }

          // If include user is requested, fetch the user by userId
          if (args.include.config.include?.user) {
            // Users are stored by address, so we need to find by id
            const user = Array.from(inMemoryUsers.values()).find((u) => u.id === config.userId);
            return {
              ...trade,
              config: user ? { ...config, user } : config,
            };
          }

          return {
            ...trade,
            config,
          };
        }

        return trade;
      },
      async findMany(args?: {
        where?: { configId?: string; status?: string };
        orderBy?: { createdAt: 'asc' | 'desc' };
      }): Promise<any[]> {
        let trades: InMemoryCopiedTrade[] = [];

        if (args?.where?.configId) {
          const tradeIds = inMemoryCopiedTradesByConfigId.get(args.where.configId) || [];
          trades = tradeIds
            .map((id) => inMemoryCopiedTrades.get(id))
            .filter((t): t is InMemoryCopiedTrade => t !== undefined);
        } else {
          trades = Array.from(inMemoryCopiedTrades.values());
        }

        // Filter by status if specified
        if (args?.where?.status) {
          trades = trades.filter((t) => t.status === args.where!.status);
        }

        // Sort if orderBy is specified
        if (args?.orderBy) {
          trades.sort((a, b) => {
            const comparison = a.createdAt.getTime() - b.createdAt.getTime();
            return args.orderBy!.createdAt === 'desc' ? -comparison : comparison;
          });
        }

        return trades;
      },
      async update(args: {
        where: { id: string };
        data: {
          copiedTxHash?: string | null;
          copiedAmount?: string;
          copiedPrice?: string | null;
          copiedShares?: string | null;
          status?: string;
          errorMessage?: string | null;
          outcome?: string | null;
          pnl?: string | null;
          resolvedAt?: Date | null;
          resolutionPrice?: string | null;
          executedAt?: Date | null;
        };
      }): Promise<any> {
        const trade = inMemoryCopiedTrades.get(args.where.id);
        if (!trade) {
          throw new Error('CopiedTrade not found');
        }

        if (args.data.copiedTxHash !== undefined) {
          trade.copiedTxHash = args.data.copiedTxHash;
        }
        if (args.data.copiedAmount !== undefined) {
          trade.copiedAmount = args.data.copiedAmount;
        }
        if (args.data.copiedPrice !== undefined) {
          trade.copiedPrice = args.data.copiedPrice;
        }
        if (args.data.copiedShares !== undefined) {
          trade.copiedShares = args.data.copiedShares;
        }
        if (args.data.status !== undefined) {
          trade.status = args.data.status;
        }
        if (args.data.errorMessage !== undefined) {
          trade.errorMessage = args.data.errorMessage;
        }
        if (args.data.outcome !== undefined) {
          trade.outcome = args.data.outcome;
        }
        if (args.data.pnl !== undefined) {
          trade.pnl = args.data.pnl;
        }
        if (args.data.resolvedAt !== undefined) {
          trade.resolvedAt = args.data.resolvedAt;
        }
        if (args.data.resolutionPrice !== undefined) {
          trade.resolutionPrice = args.data.resolutionPrice;
        }
        if (args.data.executedAt !== undefined) {
          trade.executedAt = args.data.executedAt;
        }

        return trade;
      },
      async count(args?: {
        where?: {
          configId?: string;
          status?: string;
          outcome?: string;
        };
      }): Promise<number> {
        let trades: InMemoryCopiedTrade[] = Array.from(inMemoryCopiedTrades.values());

        if (args?.where) {
          if (args.where.configId) {
            trades = trades.filter((t) => t.configId === args.where!.configId);
          }
          if (args.where.status) {
            trades = trades.filter((t) => t.status === args.where!.status);
          }
          if (args.where.outcome) {
            trades = trades.filter((t) => t.outcome === args.where!.outcome);
          }
        }

        return trades.length;
      },
    },
    copySignalConfig: {
      async create(args: {
        data: {
          userId: string;
          signalCategories: string;
          copyBuyTrades: boolean;
          copySellTrades: boolean;
          amountType: string;
          buyAmount: string;
          sellAmount: string;
          minBuyAmount?: string | null;
          maxBuyAmount?: string | null;
          minSellAmount?: string | null;
          maxSellAmount?: string | null;
          marketCategories?: string | null;
          enabled?: boolean;
          authorized?: boolean;
          slippageTolerance?: string;
          maxRetries?: number;
        };
      }): Promise<any> {
        const config: InMemoryCopySignalConfig = {
          id: randomUUID(),
          userId: args.data.userId,
          signalCategories: args.data.signalCategories,
          copyBuyTrades: args.data.copyBuyTrades,
          copySellTrades: args.data.copySellTrades,
          amountType: args.data.amountType,
          buyAmount: args.data.buyAmount,
          sellAmount: args.data.sellAmount,
          minBuyAmount: args.data.minBuyAmount || null,
          maxBuyAmount: args.data.maxBuyAmount || null,
          minSellAmount: args.data.minSellAmount || null,
          maxSellAmount: args.data.maxSellAmount || null,
          marketCategories: args.data.marketCategories || null,
          enabled: args.data.enabled ?? false,
          authorized: args.data.authorized ?? false,
          slippageTolerance: args.data.slippageTolerance || '0.05',
          maxRetries: args.data.maxRetries ?? 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        inMemoryCopySignalConfigs.set(config.id, config);

        const userConfigs = inMemoryCopySignalConfigsByUserId.get(args.data.userId) || [];
        userConfigs.push(config.id);
        inMemoryCopySignalConfigsByUserId.set(args.data.userId, userConfigs);

        return config;
      },
      async findMany(args?: {
        where?: {
          userId?: string;
          enabled?: boolean;
          authorized?: boolean;
        };
        orderBy?: { createdAt: 'asc' | 'desc' };
      }): Promise<any[]> {
        let configs: InMemoryCopySignalConfig[] = Array.from(inMemoryCopySignalConfigs.values());

        if (args?.where) {
          if (args.where.userId) {
            const userConfigIds = inMemoryCopySignalConfigsByUserId.get(args.where.userId) || [];
            configs = userConfigIds
              .map((id) => inMemoryCopySignalConfigs.get(id))
              .filter((c): c is InMemoryCopySignalConfig => c !== undefined);
          }
          if (args.where.enabled !== undefined) {
            configs = configs.filter((c) => c.enabled === args.where!.enabled);
          }
          if (args.where.authorized !== undefined) {
            configs = configs.filter((c) => c.authorized === args.where!.authorized);
          }
        }

        if (args?.orderBy) {
          configs.sort((a, b) => {
            const aTime = a.createdAt.getTime();
            const bTime = b.createdAt.getTime();
            return args.orderBy!.createdAt === 'desc' ? bTime - aTime : aTime - bTime;
          });
        }

        return configs;
      },
      async findFirst(args: {
        where: {
          id?: string;
          userId?: string;
        };
        include?: {
          user?: boolean;
        };
      }): Promise<any | null> {
        let config: InMemoryCopySignalConfig | undefined;

        if (args.where.id) {
          config = inMemoryCopySignalConfigs.get(args.where.id);
        } else if (args.where.userId) {
          const userConfigIds = inMemoryCopySignalConfigsByUserId.get(args.where.userId) || [];
          if (userConfigIds.length > 0) {
            config = inMemoryCopySignalConfigs.get(userConfigIds[0]);
          }
        }

        if (!config) {
          return null;
        }

        if (args.include?.user) {
          const user = inMemoryUsers.get(config.userId);
          return { ...config, user: user || null };
        }

        return config;
      },
      async findUnique(args: {
        where: { id: string };
        include?: {
          user?: boolean;
        };
      }): Promise<any | null> {
        const config = inMemoryCopySignalConfigs.get(args.where.id);
        if (!config) {
          return null;
        }

        if (args.include?.user) {
          const user = inMemoryUsers.get(config.userId);
          return { ...config, user: user || null };
        }

        return config;
      },
      async update(args: {
        where: { id: string };
        data: {
          enabled?: boolean;
          authorized?: boolean;
          copyBuyTrades?: boolean;
          copySellTrades?: boolean;
          amountType?: string;
          buyAmount?: string;
          sellAmount?: string;
          minBuyAmount?: string | null;
          maxBuyAmount?: string | null;
          minSellAmount?: string | null;
          maxSellAmount?: string | null;
          marketCategories?: string | null;
          signalCategories?: string;
          slippageTolerance?: string;
          maxRetries?: number;
        };
      }): Promise<any> {
        const config = inMemoryCopySignalConfigs.get(args.where.id);
        if (!config) {
          throw new Error('CopySignalConfig not found');
        }

        if (args.data.enabled !== undefined) {
          config.enabled = args.data.enabled;
        }
        if (args.data.authorized !== undefined) {
          config.authorized = args.data.authorized;
        }
        if (args.data.copyBuyTrades !== undefined) {
          config.copyBuyTrades = args.data.copyBuyTrades;
        }
        if (args.data.copySellTrades !== undefined) {
          config.copySellTrades = args.data.copySellTrades;
        }
        if (args.data.amountType !== undefined) {
          config.amountType = args.data.amountType;
        }
        if (args.data.buyAmount !== undefined) {
          config.buyAmount = args.data.buyAmount;
        }
        if (args.data.sellAmount !== undefined) {
          config.sellAmount = args.data.sellAmount;
        }
        if (args.data.minBuyAmount !== undefined) {
          config.minBuyAmount = args.data.minBuyAmount;
        }
        if (args.data.maxBuyAmount !== undefined) {
          config.maxBuyAmount = args.data.maxBuyAmount;
        }
        if (args.data.minSellAmount !== undefined) {
          config.minSellAmount = args.data.minSellAmount;
        }
        if (args.data.maxSellAmount !== undefined) {
          config.maxSellAmount = args.data.maxSellAmount;
        }
        if (args.data.marketCategories !== undefined) {
          config.marketCategories = args.data.marketCategories;
        }
        if (args.data.signalCategories !== undefined) {
          config.signalCategories = args.data.signalCategories;
        }
        if (args.data.slippageTolerance !== undefined) {
          config.slippageTolerance = args.data.slippageTolerance;
        }
        if (args.data.maxRetries !== undefined) {
          config.maxRetries = args.data.maxRetries;
        }

        config.updatedAt = new Date();
        return config;
      },
      async delete(args: {
        where: { id: string };
      }): Promise<any> {
        const config = inMemoryCopySignalConfigs.get(args.where.id);
        if (!config) {
          throw new Error('CopySignalConfig not found');
        }

        const userConfigs = inMemoryCopySignalConfigsByUserId.get(config.userId) || [];
        const updatedUserConfigs = userConfigs.filter((id) => id !== config.id);
        inMemoryCopySignalConfigsByUserId.set(config.userId, updatedUserConfigs);

        inMemoryCopySignalConfigs.delete(config.id);
        return config;
      },
    },
    copiedSignal: {
      async create(args: {
        data: {
          configId: string;
          signalId: string;
          category: string;
          originalTxHash?: string | null;
          marketId: string;
          marketQuestion?: string | null;
          outcomeIndex: number;
          tradeType: string;
          originalAmount: string;
          originalPrice?: string | null;
          originalShares?: string | null;
          copiedAmount: string;
          status?: string;
        };
      }): Promise<any> {
        const signal: InMemoryCopiedSignal = {
          id: randomUUID(),
          configId: args.data.configId,
          signalId: args.data.signalId,
          category: args.data.category,
          originalTxHash: args.data.originalTxHash || null,
          marketId: args.data.marketId,
          marketQuestion: args.data.marketQuestion || null,
          outcomeIndex: args.data.outcomeIndex,
          tradeType: args.data.tradeType,
          originalAmount: args.data.originalAmount,
          originalPrice: args.data.originalPrice || null,
          originalShares: args.data.originalShares || null,
          orderId: null,
          orderStatus: null,
          copiedTxHash: null,
          copiedAmount: args.data.copiedAmount,
          copiedPrice: null,
          copiedShares: null,
          status: args.data.status || 'pending',
          errorMessage: null,
          submittedAt: null,
          settledAt: null,
          outcome: null,
          pnl: null,
          resolvedAt: null,
          resolutionPrice: null,
          currentPrice: null,
          currentValue: null,
          unrealizedPnl: null,
          costBasis: null,
          lastPriceUpdate: null,
          failureReason: null,
          failureCategory: null,
          redemptionStatus: null,
          redemptionTxHash: null,
          redeemedAt: null,
          redemptionError: null,
          executedAt: null,
          createdAt: new Date(),
        };

        inMemoryCopiedSignals.set(signal.id, signal);

        const configSignals = inMemoryCopiedSignalsByConfigId.get(args.data.configId) || [];
        configSignals.push(signal.id);
        inMemoryCopiedSignalsByConfigId.set(args.data.configId, configSignals);

        return signal;
      },
      async findUnique(args: {
        where: { id: string };
        include?: {
          config?: {
            include?: {
              user?: boolean;
            };
          };
        };
      }): Promise<any | null> {
        const signal = inMemoryCopiedSignals.get(args.where.id);
        if (!signal) {
          return null;
        }

        if (args.include?.config) {
          const config = inMemoryCopySignalConfigs.get(signal.configId);
          if (config) {
            if (args.include.config.include?.user) {
              const user = inMemoryUsers.get(config.userId);
              return { ...signal, config: { ...config, user: user || null } };
            }
            return { ...signal, config };
          }
        }

        return signal;
      },
      async findMany(args?: {
        where?: {
          configId?: string;
          status?: string;
          category?: string;
          orderStatus?: string;
          redemptionStatus?: string | null;
        };
        orderBy?: { createdAt: 'asc' | 'desc' };
        take?: number;
        skip?: number;
        select?: {
          id?: boolean;
          signalId?: boolean;
        };
      }): Promise<any[]> {
        let signals: InMemoryCopiedSignal[] = Array.from(inMemoryCopiedSignals.values());

        if (args?.where) {
          if (args.where.configId) {
            const configSignalIds = inMemoryCopiedSignalsByConfigId.get(args.where.configId) || [];
            signals = configSignalIds
              .map((id) => inMemoryCopiedSignals.get(id))
              .filter((s): s is InMemoryCopiedSignal => s !== undefined);
          }
          if (args.where.status) {
            signals = signals.filter((s) => s.status === args.where!.status);
          }
          if (args.where.category) {
            signals = signals.filter((s) => s.category === args.where!.category);
          }
          if (args.where.orderStatus) {
            signals = signals.filter((s) => s.orderStatus === args.where!.orderStatus);
          }
          if (args.where.redemptionStatus !== undefined) {
            if (args.where.redemptionStatus === null) {
              signals = signals.filter((s) => s.redemptionStatus === null);
            } else {
              signals = signals.filter((s) => s.redemptionStatus === args.where!.redemptionStatus);
            }
          }
        }

        if (args?.orderBy) {
          signals.sort((a, b) => {
            const aTime = a.createdAt.getTime();
            const bTime = b.createdAt.getTime();
            return args.orderBy!.createdAt === 'desc' ? bTime - aTime : aTime - bTime;
          });
        }

        if (args?.skip) {
          signals = signals.slice(args.skip);
        }

        if (args?.take) {
          signals = signals.slice(0, args.take);
        }

        if (args?.select) {
          return signals.map((signal) => {
            const selected: any = {};
            if (args.select!.id) selected.id = signal.id;
            if (args.select!.signalId) selected.signalId = signal.signalId;
            return selected;
          });
        }

        return signals;
      },
      async update(args: {
        where: { id: string } | { orderId: string };
        data: {
          orderId?: string | null;
          orderStatus?: string | null;
          copiedTxHash?: string | null;
          copiedAmount?: string;
          copiedPrice?: string | null;
          copiedShares?: string | null;
          status?: string;
          errorMessage?: string | null;
          submittedAt?: Date | null;
          settledAt?: Date | null;
          outcome?: string | null;
          pnl?: string | null;
          resolvedAt?: Date | null;
          resolutionPrice?: string | null;
          executedAt?: Date | null;
          redemptionStatus?: string | null;
          redemptionTxHash?: string | null;
          redeemedAt?: Date | null;
          redemptionError?: string | null;
          failureReason?: string | null;
          failureCategory?: string | null;
        };
      }): Promise<any> {
        let signal: InMemoryCopiedSignal | undefined;

        if ('id' in args.where) {
          signal = inMemoryCopiedSignals.get(args.where.id);
        } else if ('orderId' in args.where) {
          signal = Array.from(inMemoryCopiedSignals.values()).find(
            (s) => s.orderId === args.where.orderId
          );
        }

        if (!signal) {
          throw new Error('CopiedSignal not found');
        }

        if (args.data.orderId !== undefined) {
          signal.orderId = args.data.orderId;
        }
        if (args.data.orderStatus !== undefined) {
          signal.orderStatus = args.data.orderStatus;
        }
        if (args.data.copiedTxHash !== undefined) {
          signal.copiedTxHash = args.data.copiedTxHash;
        }
        if (args.data.copiedAmount !== undefined) {
          signal.copiedAmount = args.data.copiedAmount;
        }
        if (args.data.copiedPrice !== undefined) {
          signal.copiedPrice = args.data.copiedPrice;
        }
        if (args.data.copiedShares !== undefined) {
          signal.copiedShares = args.data.copiedShares;
        }
        if (args.data.status !== undefined) {
          signal.status = args.data.status;
        }
        if (args.data.errorMessage !== undefined) {
          signal.errorMessage = args.data.errorMessage;
        }
        if (args.data.outcome !== undefined) {
          signal.outcome = args.data.outcome;
        }
        if (args.data.pnl !== undefined) {
          signal.pnl = args.data.pnl;
        }
        if (args.data.resolvedAt !== undefined) {
          signal.resolvedAt = args.data.resolvedAt;
        }
        if (args.data.resolutionPrice !== undefined) {
          signal.resolutionPrice = args.data.resolutionPrice;
        }
        if (args.data.executedAt !== undefined) {
          signal.executedAt = args.data.executedAt;
        }
        if (args.data.submittedAt !== undefined) {
          signal.submittedAt = args.data.submittedAt;
        }
        if (args.data.settledAt !== undefined) {
          signal.settledAt = args.data.settledAt;
        }
        if (args.data.redemptionStatus !== undefined) {
          signal.redemptionStatus = args.data.redemptionStatus;
        }
        if (args.data.redemptionTxHash !== undefined) {
          signal.redemptionTxHash = args.data.redemptionTxHash;
        }
        if (args.data.redeemedAt !== undefined) {
          signal.redeemedAt = args.data.redeemedAt;
        }
        if (args.data.redemptionError !== undefined) {
          signal.redemptionError = args.data.redemptionError;
        }
        if (args.data.failureReason !== undefined) {
          signal.failureReason = args.data.failureReason;
        }
        if (args.data.failureCategory !== undefined) {
          signal.failureCategory = args.data.failureCategory;
        }

        return signal;
      },
      async updateMany(args: {
        where: { orderId: string };
        data: {
          orderStatus?: string;
          copiedTxHash?: string;
          status?: string;
          settledAt?: Date;
        };
      }): Promise<{ count: number }> {
        const signals = Array.from(inMemoryCopiedSignals.values()).filter(
          (s) => s.orderId === args.where.orderId
        );

        for (const signal of signals) {
          if (args.data.orderStatus !== undefined) {
            signal.orderStatus = args.data.orderStatus;
          }
          if (args.data.copiedTxHash !== undefined) {
            signal.copiedTxHash = args.data.copiedTxHash;
          }
          if (args.data.status !== undefined) {
            signal.status = args.data.status;
          }
        }

        return { count: signals.length };
      },
      async count(args?: {
        where?: {
          configId?: string;
          status?: string;
          category?: string;
          orderStatus?: string;
        };
      }): Promise<number> {
        let signals: InMemoryCopiedSignal[] = Array.from(inMemoryCopiedSignals.values());

        if (args?.where) {
          if (args.where.configId) {
            const configSignalIds = inMemoryCopiedSignalsByConfigId.get(args.where.configId) || [];
            signals = configSignalIds
              .map((id) => inMemoryCopiedSignals.get(id))
              .filter((s): s is InMemoryCopiedSignal => s !== undefined);
          }
          if (args.where.status) {
            signals = signals.filter((s) => s.status === args.where!.status);
          }
          if (args.where.category) {
            signals = signals.filter((s) => s.category === args.where!.category);
          }
          if (args.where.orderStatus) {
            signals = signals.filter((s) => s.orderStatus === args.where!.orderStatus);
          }
        }

        return signals.length;
      },
    },
  } as unknown as PrismaClient;
}

export const prisma = isProduction
  ? new PrismaClient()
  : createInMemoryPrisma();

// Initialize database connection
export const initDatabase = async () => {
  if (isProduction) {
    await prisma.$connect();
    console.log('✅ Database connected (PostgreSQL)');
  } else {
    console.log('✅ Using in-memory database for development');
  }
};

// Close database connection
export const closeDatabase = async () => {
  if (isProduction) {
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  }
};

