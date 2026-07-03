// src/modules/cache/cache.spec.ts
// Unit tests for CacheService

import { CacheService } from './cache.service.js';

function mockRedis(): any {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, mode: string, ttl: number) => {
      if (mode === 'EX') store.set(key, value);
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    }),
  };
}

describe('CacheService', () => {
  let svc: CacheService;
  let redis: any;

  beforeEach(() => {
    redis = mockRedis();
    svc = new CacheService(redis);
  });

  describe('get', () => {
    it('returns null for missing key', async () => {
      const result = await svc.get('missing');
      expect(result).toBeNull();
    });

    it('parses JSON value', async () => {
      await redis.set('k', '{"a":1}', 'EX', 60);
      const result = await svc.get<{ a: number }>('k');
      expect(result).toEqual({ a: 1 });
    });

    it('returns raw string for non-JSON', async () => {
      await redis.set('k', 'hello', 'EX', 60);
      const result = await svc.get('k');
      expect(result).toBe('hello');
    });
  });

  describe('set', () => {
    it('stores stringified value with TTL', async () => {
      await svc.set('k', { foo: 'bar' }, 300);
      expect(redis.set).toHaveBeenCalledWith('k', '{"foo":"bar"}', 'EX', 300);
    });

    it('stores raw string without JSON parse roundtrip', async () => {
      await svc.set('k', 'raw', 10);
      expect(redis.set).toHaveBeenCalledWith('k', 'raw', 'EX', 10);
    });
  });

  describe('del', () => {
    it('deletes a key', async () => {
      await redis.set('k', 'v', 'EX', 60);
      await svc.del('k');
      const result = await svc.get('k');
      expect(result).toBeNull();
    });
  });

  describe('getOrSet', () => {
    it('returns cached value on hit', async () => {
      await redis.set('k', '"cached"', 'EX', 60);
      const fn = jest.fn(async () => 'fresh');
      const result = await svc.getOrSet('k', 60, fn);
      expect(result).toBe('cached');
      expect(fn).not.toHaveBeenCalled();
    });

    it('calls fetchFn and caches on miss', async () => {
      const fn = jest.fn(async () => ({ data: 42 }));
      const result = await svc.getOrSet('k', 60, fn);
      expect(result).toEqual({ data: 42 });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith('k', '{"data":42}', 'EX', 60);
    });

    it('caches null returned from fetchFn', async () => {
      const fn = jest.fn(async () => null);
      const result = await svc.getOrSet('k', 60, fn);
      expect(result).toBeNull();
    });
  });
});
