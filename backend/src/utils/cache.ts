import { redis } from '../config/redis';

const DEFAULT_TTL = 300; // 5 minutes

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async <T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Fail silently - cache is best effort
  }
};

export const cacheDelete = async (key: string): Promise<void> => {
  try {
    await redis.del(key);
  } catch {
    // Fail silently
  }
};

export const cacheDeletePattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Fail silently
  }
};

// Cache key builders for multi-tenant app
export const cacheKeys = {
  dashboard: (orgId: string, userId: string) => `dashboard:${orgId}:${userId}`,
  projects: (orgId: string) => `projects:${orgId}`,
  team: (orgId: string) => `team:${orgId}`,
  reports: (orgId: string, reportType: string, params: string) => `reports:${orgId}:${reportType}:${params}`,
  timer: (userId: string) => `timer:${userId}`,
  user: (userId: string) => `user:${userId}`,
  organization: (orgId: string) => `org:${orgId}`,
};
