import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestTrades() {
  console.log('🌱 Seeding test trades...');

  // First, ensure you have a test user and config
  const testUser = await prisma.user.upsert({
    where: { address: '0xTestUser123456789012345678901234567890' },
    update: {},
    create: {
      address: '0xTestUser123456789012345678901234567890',
      proxyWallet: '0xTestSafe123456789012345678901234567890',
    },
  });

  const testTraderAddress = '0x743510ee9f21e24071c4e28edab4653df44ea620';
  
  const testConfig = await prisma.copyTradingConfig.upsert({
    where: {
      userId_targetTraderAddress: {
        userId: testUser.id,
        targetTraderAddress: testTraderAddress,
      },
    },
    update: {},
    create: {
      userId: testUser.id,
      targetTraderAddress: testTraderAddress,
      copyBuyTrades: true,
      copySellTrades: true,
      amountType: 'fixed',
      buyAmount: '100',
      sellAmount: '100',
      enabled: true,
      authorized: true,
      traderInfo: JSON.stringify({
        username: 'test_trader',
        totalVolume: '50000',
        totalTrades: 100,
      }),
    },
  });

  // Create various test trades
  const testTrades = [
    // Executed trades with wins
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket1',
      marketQuestion: 'Will Bitcoin reach $100k by 2024?',
      outcomeIndex: 1,
      tradeType: 'buy',
      originalAmount: '1000.00',
      originalPrice: '0.65',
      originalShares: '1538.46',
      copiedAmount: '500.00',
      copiedPrice: '0.65',
      copiedShares: '769.23',
      copiedTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      status: 'executed',
      outcome: 'win',
      pnl: '125.00',
      executedAt: new Date('2024-01-10T08:15:00Z'),
      resolvedAt: new Date('2024-01-15T10:30:00Z'),
      resolutionPrice: '0.75',
    },
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket2',
      marketQuestion: 'Will Ethereum reach $5000 by 2024?',
      outcomeIndex: 1,
      tradeType: 'buy',
      originalAmount: '2000.00',
      originalPrice: '0.70',
      originalShares: '2857.14',
      copiedAmount: '1000.00',
      copiedPrice: '0.70',
      copiedShares: '1428.57',
      copiedTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      status: 'executed',
      outcome: 'win',
      pnl: '250.00',
      executedAt: new Date('2024-01-12T10:20:00Z'),
      resolvedAt: new Date('2024-01-18T14:00:00Z'),
      resolutionPrice: '0.80',
    },
    // Executed trades with losses
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket3',
      marketQuestion: 'Will the stock market crash in Q1 2024?',
      outcomeIndex: 0,
      tradeType: 'buy',
      originalAmount: '1500.00',
      originalPrice: '0.60',
      originalShares: '2500.00',
      copiedAmount: '750.00',
      copiedPrice: '0.60',
      copiedShares: '1250.00',
      copiedTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      status: 'executed',
      outcome: 'loss',
      pnl: '-150.00',
      executedAt: new Date('2024-01-08T09:00:00Z'),
      resolvedAt: new Date('2024-01-20T16:00:00Z'),
      resolutionPrice: '0.48',
    },
    // Pending trades
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket4',
      marketQuestion: 'Will AI replace software developers by 2025?',
      outcomeIndex: 1,
      tradeType: 'buy',
      originalAmount: '800.00',
      originalPrice: '0.55',
      originalShares: '1454.55',
      copiedAmount: '400.00',
      copiedPrice: '0.55',
      copiedShares: '727.27',
      copiedTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      status: 'executed',
      outcome: 'pending',
      executedAt: new Date('2024-01-22T11:00:00Z'),
    },
    // Failed trades
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket5',
      marketQuestion: 'Will Dogecoin reach $1?',
      outcomeIndex: 1,
      tradeType: 'buy',
      originalAmount: '500.00',
      originalPrice: '0.50',
      originalShares: '1000.00',
      copiedAmount: '250.00',
      copiedPrice: '0.50',
      copiedShares: '500.00',
      status: 'failed',
      errorMessage: 'Insufficient balance',
    },
    // Sell trades
    {
      userId: testUser.id,
      configId: testConfig.id,
      originalTrader: testTraderAddress,
      originalTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      marketId: '0xMarket6',
      marketQuestion: 'Will Tesla stock drop below $200?',
      outcomeIndex: 0,
      tradeType: 'sell',
      originalAmount: '1200.00',
      originalPrice: '0.45',
      originalShares: '2666.67',
      copiedAmount: '600.00',
      copiedPrice: '0.45',
      copiedShares: '1333.33',
      copiedTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      status: 'executed',
      outcome: 'win',
      pnl: '80.00',
      executedAt: new Date('2024-01-14T13:30:00Z'),
      resolvedAt: new Date('2024-01-19T09:00:00Z'),
      resolutionPrice: '0.38',
    },
  ];

  // Delete existing test trades first
  await prisma.copiedTrade.deleteMany({
    where: {
      configId: testConfig.id,
    },
  });

  for (const trade of testTrades) {
    await prisma.copiedTrade.create({
      data: trade,
    });
  }

  console.log(`✅ Created ${testTrades.length} test trades`);
  console.log(`📊 Config ID: ${testConfig.id}`);
  console.log(`👤 User ID: ${testUser.id}`);
}

seedTestTrades()
  .catch((e) => {
    console.error('❌ Error seeding trades:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

