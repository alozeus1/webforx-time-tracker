import { Request, Response, NextFunction } from 'express';
import { cacheGet, cacheSet } from '../utils/cache';

type CacheOptions = {
  keyGenerator: (req: Request) => string;
  ttlSeconds?: number;
};

export const cacheResponse = (options: CacheOptions) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = options.keyGenerator(req);
    const cached = await cacheGet<unknown>(key);

    if (cached) {
      res.json(cached);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void cacheSet(key, body, options.ttlSeconds);
      return originalJson(body);
    };

    next();
  };
};
