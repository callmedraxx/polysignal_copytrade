#!/usr/bin/env tsx
/**
 * Test the full buy order flow with real user and CLOB client
 * This simulates the exact same flow as production buy orders
 */

// Use dist folder in container, src folder in development
const fs = require('fs');
const path = require('path');
const scriptDir = __dirname;
const appRoot = path.resolve(scriptDir, '..');
const hasSrc = fs.existsSync(path.join(appRoot, 'src'));
const hasDist = fs.existsSync(path.join(appRoot, 'dist'));
const basePath = hasDist && !hasSrc ? './dist' : './src';

const { prisma } = require(path.join(appRoot, basePath, 'config/database'));
const { getClobClientForUser } = require(path.join(appRoot, basePath, 'services/clob-client-cache'));
const { executeBuyTrade } = require(path.join(appRoot, basePath, 'services/polymarket-executor'));
const { config } = require(path.join(appRoot, basePath, 'config/env'));
const { isClobProxyEnabled } = require(path.join(appRoot, basePath, 'utils/proxy-agent'));
const { logger } = require(path.join(appRoot, basePath, 'utils/logger'));

async function testFullBuyFlow(marketIdArg?: string) {
  console.log('\n🧪 Testing Full Buy Order Flow with Proxy\n');
  console.log('=' .repeat(60));
  
  if (marketIdArg) {
    console.log(`\n📌 Using provided market ID: ${marketIdArg}`);
  }
  
  try {
    // Step 1: Get first user from database
    console.log('\n1️⃣ Getting user from database...');
    const user = await prisma.user.findFirst({
      where: {
        proxyWallet: {
          not: null,
        },
      },
      include: {
        copyTradingConfigs: {
          where: {
            status: 'active',
          },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new Error('No user found in database with proxy wallet');
    }

    if (!user.proxyWallet) {
      throw new Error(`User ${user.address} does not have a proxy wallet`);
    }

    console.log('✅ User found:', {
      address: user.address,
      proxyWallet: user.proxyWallet,
      hasActiveConfig: user.copyTradingConfigs.length > 0,
    });

    // Step 2: Check proxy configuration
    console.log('\n2️⃣ Checking proxy configuration...');
    const proxyEnabled = isClobProxyEnabled();
    const proxyUrl = config.proxy?.clobProxyUrl || config.proxy?.url || '';
    const proxyType = proxyUrl.startsWith('socks5') ? 'SOCKS5' : proxyUrl.startsWith('https') ? 'HTTPS' : 'Unknown';
    
    console.log('Proxy status:', {
      enabled: proxyEnabled,
      type: proxyType,
      url: proxyUrl ? `${proxyUrl.substring(0, 30)}...` : 'not configured',
    });

    if (!proxyEnabled) {
      console.warn('⚠️  Proxy is not enabled! This test requires proxy to be enabled.');
      console.warn('   Set CLOB_PROXY_URL environment variable to enable proxy.');
    }

    // Step 3: Get CLOB client (this will use proxy if enabled)
    console.log('\n3️⃣ Getting CLOB client for user...');
    const clobClient = await getClobClientForUser(user.address);
    console.log('✅ CLOB client obtained');

    // Step 4: Find an active market
    console.log('\n4️⃣ Finding an active market...');
    
    // Use provided market ID if available
    let marketId: string | null = marketIdArg || null;
    let outcomeIndex = 0;
    
    if (marketId) {
      console.log(`✅ Using provided market ID: ${marketId}`);
    }
    
    if (user.copyTradingConfigs.length > 0) {
      const userConfig = user.copyTradingConfigs[0];
      // Try to get a recent trade to find a market
      const recentTrade = await prisma.copiedTrade.findFirst({
        where: {
          configId: userConfig.id,
          status: {
            in: ['pending', 'submitted', 'filled'],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      
      if (recentTrade && recentTrade.marketId) {
        marketId = recentTrade.marketId;
        outcomeIndex = recentTrade.outcomeIndex || 0;
        console.log('✅ Found market from recent trade:', {
          marketId,
          outcomeIndex,
        });
      }
    }

    // If no market from config, try to fetch a popular market
    if (!marketId) {
      console.log('   No recent trade found, fetching a popular market...');
      try {
        // Try multiple approaches to get a market
        const dataApiUrl = config.polymarket.dataApiUrl || 'https://data-api.polymarket.com';
        console.log(`   Fetching from: ${dataApiUrl}/markets?limit=5&active=true`);
        
        const response = await fetch(`${dataApiUrl}/markets?limit=5&active=true`);
        if (response.ok) {
          const data = await response.json();
          const markets = Array.isArray(data) ? data : (data.markets || data.results || []);
          
          if (markets && markets.length > 0) {
            // Find a market with a slug
            const marketWithSlug = markets.find((m: any) => m.slug || m.conditionId);
            if (marketWithSlug) {
              marketId = marketWithSlug.slug || marketWithSlug.conditionId;
              outcomeIndex = 0;
              console.log('✅ Found active market:', {
                marketId,
                title: marketWithSlug.question || marketWithSlug.title || 'N/A',
                slug: marketWithSlug.slug,
                conditionId: marketWithSlug.conditionId,
              });
            }
          } else {
            console.warn('   No markets returned from API');
          }
        } else {
          console.warn(`   API returned status: ${response.status}`);
        }
      } catch (error: any) {
        console.warn('⚠️  Failed to fetch market from data API:', error.message);
      }
    }

    // If still no market, try to get from a recent copied trade
    if (!marketId) {
      console.log('   Trying to find market from any recent copied trade...');
      // Get all trades and filter for non-null marketId
      const allTrades = await prisma.copiedTrade.findMany({
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });
      
      const tradeWithMarket = allTrades.find(t => t.marketId && t.marketId.trim() !== '');
      
      if (tradeWithMarket && tradeWithMarket.marketId) {
        marketId = tradeWithMarket.marketId;
        outcomeIndex = tradeWithMarket.outcomeIndex || 0;
        console.log('✅ Found market from copied trade:', {
          marketId,
          outcomeIndex,
        });
      }
    }

    if (!marketId) {
      console.error('\n❌ Could not find an active market to test with.');
      console.error('   Options:');
      console.error('   1. Pass a market ID as argument: npm run test:full-buy-flow <marketId>');
      console.error('   2. Ensure there are recent trades in the database');
      console.error('   3. Check that data API is accessible');
      throw new Error('Could not find an active market to test with. Please provide a market ID as argument.');
    }

    // Step 5: Get market info to validate
    console.log('\n5️⃣ Validating market...');
    const { getMarketInfo } = require(path.join(appRoot, basePath, 'services/polymarket-clob'));
    const marketInfo = await getMarketInfo(marketId);
    const tokens = marketInfo.tokens || [];
    
    if (!tokens[outcomeIndex]) {
      throw new Error(`Outcome index ${outcomeIndex} not found. Available: ${tokens.length}`);
    }

    // Extract token ID - handle both string and object formats (same logic as polymarket-executor.ts)
    const token = tokens[outcomeIndex];
    console.log('Token structure:', {
      type: typeof token,
      token: token,
      stringified: JSON.stringify(token),
    });
    
    let tokenId: string;
    if (typeof token === 'string') {
      tokenId = token;
    } else if (token && typeof token === 'object') {
      // Token is an object, extract token_id or tokenId field
      // Try common field names
      tokenId = token.token_id || token.tokenId || token.id || token.address || token.contract;
      
      // If still not found, try to stringify and check
      if (!tokenId || tokenId === '[object Object]') {
        // Try accessing nested properties
        if (token.token && typeof token.token === 'string') {
          tokenId = token.token;
        } else {
          // Last resort: log the structure and throw error
          console.error('Token structure:', JSON.stringify(token, null, 2));
          throw new Error(`Could not extract tokenId from token object at index ${outcomeIndex}`);
        }
      }
    } else {
      throw new Error(`Invalid token format at index ${outcomeIndex}: ${typeof token}`);
    }

    if (!tokenId || tokenId.trim() === '') {
      console.error('Token structure:', JSON.stringify(token, null, 2));
      throw new Error(`TokenId is empty for token at index ${outcomeIndex}`);
    }

    console.log('✅ Market validated:', {
      marketId,
      tokenId,
      outcomeIndex,
      tokensCount: tokens.length,
      tokenType: typeof token,
    });

    // Step 6: Get current price from orderbook
    console.log('\n6️⃣ Getting current market price...');
    const { getOrderBook } = require(path.join(appRoot, basePath, 'services/polymarket-clob'));
    const orderbook = await getOrderBook(tokenId);
    
    // Get best ask price (for buy orders)
    // Orderbook format can be: { asks: [[price, size], ...] } or { asks: [{price, size}, ...] }
    const asks = orderbook?.asks || [];
    let bestAsk = 0.5; // Default price
    
    if (asks.length > 0) {
      const firstAsk = asks[0];
      if (Array.isArray(firstAsk)) {
        // Format: [price, size]
        bestAsk = parseFloat(firstAsk[0] || '0.5');
      } else if (typeof firstAsk === 'object') {
        // Format: {price, size}
        bestAsk = parseFloat(firstAsk.price || firstAsk[0] || '0.5');
      } else {
        bestAsk = parseFloat(firstAsk || '0.5');
      }
    }
    
    const maxPrice = Math.min(bestAsk * 1.1, 0.999); // 10% above best ask, capped at 0.999
    
    console.log('✅ Market price:', {
      bestAsk,
      maxPrice,
      asksCount: asks.length,
      orderbookStructure: asks.length > 0 ? (Array.isArray(asks[0]) ? 'array' : 'object') : 'empty',
    });

    // Step 7: Calculate order size (minimum $1 order value)
    console.log('\n7️⃣ Calculating order parameters...');
    const MIN_ORDER_VALUE = 1.0; // $1 minimum
    const orderSizeUSDC = MIN_ORDER_VALUE / maxPrice; // Calculate size to get exactly $1 value
    const amountWei = (BigInt(Math.floor(orderSizeUSDC * 1000000))).toString(); // USDC has 6 decimals
    
    console.log('Order parameters:', {
      amountUSDC: orderSizeUSDC.toFixed(6),
      amountWei,
      maxPrice: maxPrice.toFixed(4),
      orderValue: (orderSizeUSDC * maxPrice).toFixed(2),
      slippageTolerance: 0.05, // 5%
    });

    // Step 8: Execute buy trade (this will use proxy if enabled)
    console.log('\n8️⃣ Executing buy trade (this will use proxy if enabled)...');
    console.log('=' .repeat(60));
    console.log('⚠️  This will make a REAL buy order on Polymarket!');
    console.log('⚠️  Order value: $' + (orderSizeUSDC * maxPrice).toFixed(2));
    console.log('=' .repeat(60));
    
    const startTime = Date.now();
    
    try {
      const result = await executeBuyTrade(
        user.address,
        marketId,
        outcomeIndex,
        amountWei,
        maxPrice,
        0.05 // 5% slippage
      );
      
      const duration = Date.now() - startTime;
      
      console.log('\n✅ Buy order executed successfully!');
      console.log('Result:', {
        orderId: result.orderId,
        status: result.status,
        duration: `${duration}ms`,
      });
      
      console.log('\n📊 Summary:');
      console.log('  - User:', user.address);
      console.log('  - Market:', marketId);
      console.log('  - Order ID:', result.orderId);
      console.log('  - Proxy used:', proxyEnabled ? 'YES' : 'NO');
      console.log('  - Proxy type:', proxyType);
      console.log('  - Duration:', `${duration}ms`);
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.error('\n❌ Buy order failed!');
      console.error('Error:', error.message);
      console.error('Duration:', `${duration}ms`);
      
      // Check if it's a redirect error
      if (error?.message?.includes('redirect') || error?.code === 'ERR_TOO_MANY_REDIRECTS') {
        console.error('\n🔴 REDIRECT ERROR DETECTED!');
        console.error('This is the same error we\'re debugging in production.');
        console.error('\nError details:', {
          message: error.message,
          code: error.code,
          isAxiosError: error.isAxiosError,
          config: error.config ? {
            url: error.config.url,
            method: error.config.method,
            maxRedirects: error.config.maxRedirects,
          } : 'no config',
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    await prisma.$disconnect();
  }
}

// Run the test
// Allow passing market ID as command line argument
const marketIdArg = process.argv[2];
testFullBuyFlow(marketIdArg)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

