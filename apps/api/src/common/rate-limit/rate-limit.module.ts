import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Exists only so the storage is resolvable from inside the dynamic
 * ThrottlerModule. A `forRootAsync({ inject: [...] })` resolves its tokens in
 * the dynamic module's own context, not the parent module's, so listing the
 * storage in RateLimitModule.providers is not enough and the app fails to
 * bootstrap with "Nest can't resolve dependencies of the THROTTLER:MODULE_OPTIONS".
 *
 * Importing a module that exports the provider is the documented way to widen
 * that context. Keeping it a real provider also means Nest still runs
 * onModuleDestroy, which is how the Redis connection is closed.
 */
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}

@Module({
  imports: [
    ThrottlerStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
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
  // Re-export the storage module rather than the provider: the provider is not
  // a member of this module, only of ThrottlerStorageModule, and exporting it
  // directly fails with UnknownExportException. HealthModule injects the
  // storage through this module for its readiness probe.
  exports: [ThrottlerModule, ThrottlerStorageModule],
})
export class RateLimitModule {}
