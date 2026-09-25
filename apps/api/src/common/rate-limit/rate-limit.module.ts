import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        throttlers: [
          { ttl: 60_000, limit: 100 },
          { name: 'auth', ttl: 60_000, limit: 10 },
          { name: 'orders', ttl: 60_000, limit: 30 },
          { name: 'upload', ttl: 60_000, limit: 20 },
          { name: 'contact', ttl: 60_000, limit: 5 },
        ],
      }),
    }),
  ],
  providers: [RedisThrottlerStorage],
  exports: [ThrottlerModule, RedisThrottlerStorage],
})
export class RateLimitModule {}
