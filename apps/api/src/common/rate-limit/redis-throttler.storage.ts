import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Env } from '../../config/env.schema';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

interface MemoryEntry {
  hits: number;
  resetAt: number;
  blockedUntil: number;
}

export interface RateLimitHealth {
  backend: 'redis' | 'memory';
  status: 'up' | 'down';
}

const incrementScript = `
local total = redis.call('INCR', KEYS[1])
if total == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local blocked_until = tonumber(redis.call('GET', KEYS[2]) or '0')
local now = tonumber(ARGV[4])
if blocked_until > now then
  local ttl = redis.call('PTTL', KEYS[1])
  return { total, ttl, 1, blocked_until - now }
end
if total > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 then
  redis.call('SET', KEYS[2], now + tonumber(ARGV[3]), 'PX', ARGV[3])
  return { total, redis.call('PTTL', KEYS[1]), 1, tonumber(ARGV[3]) }
end
return { total, redis.call('PTTL', KEYS[1]), 0, -1 }
`;

@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(config: ConfigService<Env, true>) {
    const redisUrl = config.get('REDIS_URL', { infer: true });
    this.redis = redisUrl
      ? new Redis(redisUrl, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        })
      : null;
    this.redis?.on('error', () => {
      this.logger.error({ event: 'rate_limit_redis_error' });
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const safeKey = createHash('sha256')
      .update(`${throttlerName}:${key}`)
      .digest('hex');
    if (this.redis)
      return this.incrementRedis(safeKey, ttl, limit, blockDuration);

    return this.incrementMemory(safeKey, ttl, limit, blockDuration);
  }

  async check(): Promise<RateLimitHealth> {
    if (!this.redis) return { backend: 'memory', status: 'up' };
    try {
      const result = await this.redis.ping();
      return { backend: 'redis', status: result === 'PONG' ? 'up' : 'down' };
    } catch {
      return { backend: 'redis', status: 'down' };
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.memory.clear();
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const result = (await this.redis!.eval(
      incrementScript,
      2,
      `role:throttle:${key}`,
      `role:throttle:block:${key}`,
      String(ttl),
      String(limit),
      String(blockDuration),
      String(now),
    )) as [number, number, number, number];

    return {
      totalHits: result[0],
      timeToExpire: Math.max(0, result[1]),
      isBlocked: result[2] === 1,
      timeToBlockExpire: result[3],
    };
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerStorageRecord {
    const now = Date.now();
    const current = this.memory.get(key);
    const entry =
      !current || current.resetAt <= now
        ? { hits: 0, resetAt: now + ttl, blockedUntil: 0 }
        : current;
    entry.hits += 1;
    this.memory.set(key, entry);

    if (entry.blockedUntil > now) {
      return {
        totalHits: entry.hits,
        timeToExpire: Math.max(0, entry.resetAt - now),
        isBlocked: true,
        timeToBlockExpire: entry.blockedUntil - now,
      };
    }

    if (entry.hits > limit && blockDuration > 0) {
      entry.blockedUntil = now + blockDuration;
      return {
        totalHits: entry.hits,
        timeToExpire: Math.max(0, entry.resetAt - now),
        isBlocked: true,
        timeToBlockExpire: blockDuration,
      };
    }

    this.memory.set(key, entry);
    return {
      totalHits: entry.hits,
      timeToExpire: Math.max(0, entry.resetAt - now),
      isBlocked: false,
      timeToBlockExpire: -1,
    };
  }
}
