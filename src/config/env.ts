import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    url: process.env.DATABASE_URL || '',
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },
  adminjs: {
    cookieSecret: process.env.ADMINJS_COOKIE_SECRET || '',
    sessionSecret: process.env.ADMINJS_SESSION_SECRET || '',
  },
  app: {
    name: process.env.APP_NAME || 'PolySignal Copy Trading',
    url: process.env.APP_URL || 'http://localhost:3001',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '',
  },
  blockchain: {
    polygonRpcUrl: process.env.POLYGON_RPC_URL || '',
    deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || '',
    usdcAddress: process.env.USDC_POLYGON_ADDRESS || '', // USDC on Polygon
    ctfAddress: process.env.CTF_ADDRESS || '', // Conditional Token Framework on Polygon
    hdWalletMnemonic: process.env.HD_WALLET_MNEMONIC || '', // Mnemonic for HD wallet derivation (for dynamic Safe deployment)
  },
  deposit: {
    onramperApiKey: process.env.ONRAMPER_API_KEY || '',
    onramperApiUrl: process.env.ONRAMPER_API_URL || '',
    webhookSecret: process.env.DEPOSIT_WEBHOOK_SECRET || '',
  },
  polymarket: {
    dataApiUrl: process.env.POLYMARKET_DATA_API_URL || 'https://data-api.polymarket.com',
    gammaApiUrl: process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com',
    subgraphUrl: process.env.POLYMARKET_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/polymarket/pm-subgraph/version/latest',
    clobApiUrl: process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
    relayerUrl: process.env.POLYMARKET_RELAYER_URL || 'https://relayer-v2.polymarket.com/',
    builder: {
      apiKey: process.env.POLY_BUILDER_API_KEY || '',
      secret: process.env.POLY_BUILDER_SECRET || '',
      passphrase: process.env.POLY_BUILDER_PASSPHRASE || '',
      signingServerUrl: process.env.POLY_BUILDER_SIGNING_SERVER_URL || '',
      signingServerToken: process.env.POLY_BUILDER_SIGNING_SERVER_TOKEN || '',
    },
  },
  signals: {
    apiUrl: process.env.SIGNALS_API_URL || '',
    apiKey: process.env.SIGNALS_API_KEY || '',
  },
  safe: {
    // Safe Transaction Service URL for Polygon
    // According to Safe docs: https://safe-transaction.polygon.safe.global
    // If this doesn't work, try: https://safe-transaction.polygon.gnosis.io
    transactionServiceUrl: process.env.SAFE_TRANSACTION_SERVICE_URL || 'https://safe-transaction.polygon.safe.global',
    relayerPrivateKey: process.env.SAFE_RELAYER_PRIVATE_KEY || '',
    relayerAddress: process.env.SAFE_RELAYER_ADDRESS || '',
  },
  workers: {
    tradeMonitorInterval: parseInt(process.env.TRADE_MONITOR_INTERVAL || '30000', 10), // 30 seconds
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  },
  tenderly: {
    accessToken: process.env.TENDERLY_ACCESS_TOKEN || '',
    apiUrl: process.env.TENDERLY_API_URL || '',
  },
  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    url: process.env.PROXY_URL || '',
    // CLOB-specific proxy override (for routing through local machine)
    // If set, this will be used for CLOB order submission instead of the general proxy
    clobProxyUrl: process.env.CLOB_PROXY_URL || '',
    // Oxylabs specific (kept for future use)
    oxylabs: {
      username: process.env.OXYLABS_USERNAME || '',
      password: process.env.OXYLABS_PASSWORD || '',
      proxyType: (process.env.OXYLABS_PROXY_TYPE || 'http') as 'http' | 'socks5',
      country: process.env.OXYLABS_COUNTRY || '', // Optional: us, gb, etc.
      useDatacenter: process.env.OXYLABS_USE_DATACENTER === 'true', // Use dc.oxylabs.io instead of pr.oxylabs.io
    },
  },
};

export const isProduction = config.env === 'production';
export const isDevelopment = config.env === 'development';

