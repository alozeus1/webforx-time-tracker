import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export const connectRedis = async (): Promise<void> => {
  if (redis.status === 'wait') {
    await redis.connect();
  }
};

export const disconnectRedis = async (): Promise<void> => {
  await redis.quit();
};
