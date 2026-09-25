import type { RedisOptions } from 'ioredis';

export function parseRedisUrl(url: string): RedisOptions {
  if (!url)
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 6379,
      username: u.username || undefined,
      password: u.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };
  }
}
