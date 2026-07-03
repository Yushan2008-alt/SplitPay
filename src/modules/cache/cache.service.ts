import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
    } catch (err) {
      this.logger.warn(`Cache get(${key}) failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ponytail: fail-open — cache infra down never blocks the app
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redis.set(key, raw, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache set(${key}) failed: ${(err as Error).message}`);
    }
  }

  // ponytail: fail-open — invalidation failure never blocks a mutation
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(`Cache del(${key}) failed: ${(err as Error).message}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) await this.redis.del(...keys);
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Cache delPattern(${pattern}) failed: ${(err as Error).message}`);
    }
  }

  // ponytail: on Redis error, skip cache and call fetchFn directly (best-effort)
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>,
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) return cached;
    } catch {
      // fall through — Redis is down, go directly to fetchFn
    }
    const fresh = await fetchFn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
