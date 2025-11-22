import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { config, isProduction } from './config/env';
import { initDatabase, closeDatabase } from './config/database';
import { initRedis, closeRedis } from './config/redis';
import routes from './routes';
import { setupAdmin } from './admin/admin';
import { startTradeMonitorWorker, stopTradeMonitorWorker } from './workers/trade-monitor-worker';
import { startSignalMonitorWorker, stopSignalMonitorWorker } from './workers/signal-monitor-worker';
import { startTradeExecutorWorker } from './workers/trade-executor-worker';
import { startBridgeAssetsWorker } from './workers/bridge-assets-worker';
import { startDepositTrackerWorker } from './workers/deposit-tracker-worker';
import { startClobClientRefreshWorker } from './workers/clob-client-refresh-worker';
import { startPositionRedemptionWorker } from './workers/position-redemption-worker';
import { closeQueues } from './services/queue';

const app: Express = express();

// CORS configuration - allow requests from frontend origins
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://polysignal.io',
      'https://www.polysignal.io',
      'https://app.polysignal.io',
      'https://lovable.dev',
      'https://*.lovable.dev', // Allow all lovable.dev subdomains
    ];

    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard subdomains (e.g., *.lovable.dev)
        const pattern = allowed.replace('*.', '');
        return origin.endsWith(pattern);
      }
      return origin === allowed;
    });

    // Also allow any origin that ends with .lovable.dev, .lovable.app, or .lovableproject.com (including subdomains)
    const isLovableSubdomain = 
      origin === 'https://lovable.dev' || 
      origin === 'https://lovable.app' ||
      origin === 'https://lovableproject.com' ||
      origin.endsWith('.lovable.dev') ||
      origin.endsWith('.lovable.app') ||
      origin.endsWith('.lovableproject.com');
    
    // Also allow polysignal.io and its subdomains
    const isPolysignalDomain = origin === 'https://polysignal.io' || origin.endsWith('.polysignal.io');

    if (isAllowed || isLovableSubdomain || isPolysignalDomain) {
      callback(null, true);
    } else {
      // In development, allow all origins
      if (!isProduction) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api', routes);

// Root endpoint - serve frontend
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize services
const startServer = async () => {
  try {
    await initDatabase();
    await initRedis();
    await setupAdmin(app);

    // Start background workers
    startTradeMonitorWorker();
    startSignalMonitorWorker(); // Monitor external API for signals
    startTradeExecutorWorker();
    startBridgeAssetsWorker(); // Sync supported assets from Polymarket Bridge API
    startClobClientRefreshWorker(); // Refresh CLOB clients before they expire
    startDepositTrackerWorker(); // Track deposits through bridge process
    startPositionRedemptionWorker(); // Auto-redeem positions for closed markets

    const server = app.listen(config.port, () => {
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`🌐 Frontend: ${config.app.url}`);
      console.log(`📚 API Documentation: ${config.app.url}/api-docs`);
      console.log(`🔧 Admin Panel: ${config.app.url}/admin`);
      console.log(`🌍 Environment: ${config.env}`);
      console.log(`🔄 Trade monitoring worker: Active`);
      console.log(`📡 Signal monitoring worker: Active`);
      console.log(`⚡ Trade execution worker: Active`);
      console.log(`🌉 Bridge assets sync worker: Active`);
      console.log(`🔑 CLOB client refresh worker: Active`);
      console.log(`📦 Deposit tracker worker: Active`);
      console.log(`💰 Position redemption worker: Active`);
    });

    // Graceful shutdown
    const gracefulShutdown = async () => {
      console.log('\n🛑 Shutting down gracefully...');
      stopTradeMonitorWorker();
      stopSignalMonitorWorker();
      await closeQueues();
      server.close(async () => {
        await closeDatabase();
        await closeRedis();
        console.log('✅ Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start server
if (!isProduction || require.main === module) {
  startServer();
}

export default app;

