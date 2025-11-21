import Queue from 'bull';
import { config } from '../config/env';
import { redis } from '../config/redis';
import { isProduction } from '../config/env';

// Create Redis connection for Bull
// Bull requires a real Redis connection (cannot use in-memory mock)
// NOTE: Bull does NOT allow enableReadyCheck or maxRetriesPerRequest options
// See: https://github.com/OptimalBits/bull/issues/1873
const getRedisConnection = () => {
  // If we have a Redis URL (production), use it
  if (isProduction && config.redis.url) {
    try {
      const url = new URL(config.redis.url);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        // Bull doesn't allow enableReadyCheck or maxRetriesPerRequest
        connectTimeout: 10000,
        lazyConnect: false,
        keepAlive: 30000,
      };
    } catch {
      // Fallback to localhost if URL parsing fails
      return { 
        host: '127.0.0.1', 
        port: 6379,
        connectTimeout: 5000,
        keepAlive: 30000,
      };
    }
  }
  
  // Development: Always use real Redis connection (Bull doesn't support in-memory)
  // Use 127.0.0.1 for better reliability than 'localhost'
  return { 
    host: '127.0.0.1',
    port: 6379,
    connectTimeout: 5000,
    lazyConnect: false, // Connect immediately to catch errors early
    keepAlive: 30000, // Maintain connection
  };
};

// Trade execution queue
export const tradeExecutionQueue = new Queue('trade-execution', {
  redis: getRedisConnection(),
  defaultJobOptions: {
    // TEMPORARILY DISABLED: Set to 1 to disable retries
    attempts: 1, // config.workers.maxRetries,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
  },
  settings: {
    maxStalledCount: 1, // Prevent jobs from being marked as stalled too quickly
  },
});

// Trade monitoring queue (for periodic checks)
export const tradeMonitoringQueue = new Queue('trade-monitoring', {
  redis: getRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Handle Redis connection events for trade execution queue
tradeExecutionQueue.on('error', (error) => {
  if (error.message?.includes('MaxRetriesPerRequestError') || 
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ENOTFOUND')) {
    console.warn('⚠️ Redis connection error for trade execution queue. Make sure Redis is running.');
    console.warn('   Error details:', error.message);
  } else {
    console.error('❌ Trade execution queue error:', error);
  }
});

tradeExecutionQueue.on('waiting', (jobId) => {
  console.log(`⏳ Trade execution job ${jobId} waiting`);
});

// Add connection event handlers to debug connection issues
// Bull uses ioredis internally, access the client safely
if (tradeExecutionQueue.client) {
  tradeExecutionQueue.client.on('connect', () => {
    console.log('✅ Bull queue connected to Redis');
  });

  tradeExecutionQueue.client.on('ready', () => {
    console.log('✅ Bull queue Redis client ready');
  });

  tradeExecutionQueue.client.on('error', (err: Error) => {
    console.error('❌ Bull queue Redis client error:', err.message);
  });
}

// Process queue events
tradeExecutionQueue.on('completed', (job) => {
  console.log(`✅ Trade execution job ${job.id} completed`);
});

tradeExecutionQueue.on('failed', (job, err) => {
  console.error(`❌ Trade execution job ${job?.id || 'unknown'} failed:`, err);
});

tradeMonitoringQueue.on('completed', (job) => {
  console.log(`✅ Trade monitoring job ${job.id} completed`);
});

tradeMonitoringQueue.on('failed', (job, err) => {
  console.error(`❌ Trade monitoring job ${job?.id || 'unknown'} failed:`, err);
});

// Close queues gracefully
export async function closeQueues(): Promise<void> {
  console.log('🛑 Closing queues...');
  await Promise.all([
    tradeExecutionQueue.close(),
    tradeMonitoringQueue.close(),
  ]);
  console.log('✅ Queues closed');
}

