import Redis from 'ioredis';
import { isProduction, config } from './env';

// In-memory Redis-like store for development
class InMemoryRedis {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    // In-memory implementation - would need setTimeout for real expiry
    return 1;
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}

export const redis = isProduction
  ? new Redis(config.redis.url, {
      maxRetriesPerRequest: 3, // Reduce retries to avoid timeout errors
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis: Max retry attempts reached');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      enableReadyCheck: true,
      connectTimeout: 10000, // 10 second timeout
      lazyConnect: false,
    })
  : (new InMemoryRedis() as unknown as Redis);

// Initialize Redis connection
export const initRedis = async () => {
  if (isProduction) {
    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });
    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });
  } else {
    console.log('✅ Using in-memory Redis store for development');
  }
};

// Close Redis connection
export const closeRedis = async () => {
  if (isProduction) {
    await redis.quit();
    console.log('✅ Redis disconnected');
  } else {
    await (redis as unknown as InMemoryRedis).disconnect();
  }
};

