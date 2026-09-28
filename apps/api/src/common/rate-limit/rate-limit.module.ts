import { type ExecutionContext, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * `ThrottlerGuard` applies EVERY configured throttler to EVERY request. It skips
 * one only when the route carries `@SkipThrottle({ <name>: true })`; `@Throttle`
 * merely overrides that bucket's ttl and limit, it never opts the route out of
 * the others.
 *
 * So with the buckets below registered, the effective limit on any route is
 * `min(...)` of all of them. `contact` is 5, which made the WHOLE API 5
 * requests per minute per IP — an admin panel fails on its first screen. This
 * was not visible in any spec, because no spec made more than five requests
 * through the real guard, and it is the reason the e2e suite intermittently
 * answered 429 partway through a clean run.
 *
 * The fix uses the mechanism the library already has rather than adding
 * `@SkipThrottle` to every route that is not the contact form. `@Throttle({ X:
 * ... })` records `THROTTLER_LIMIT + 'X'` on the handler, so a bucket can be
 * skipped unless the route NAMED it. A route therefore opts into a bucket
 * exactly as visibly as it already opts into the bucket's limit, and a bucket
 * nobody names is a bucket nobody is silently governed by.
 *
 * `default` keeps no predicate on purpose: it is the global cap and applies to
 * everything, which is the one behaviour that should not need an opt-in.
 */
const appliesOnlyWhenNamedOnRoute =
  (bucket: string) =>
  (context: ExecutionContext): boolean => {
    const reflectorMetadata = Reflect.getMetadata(
      'THROTTLER:LIMIT' + bucket,
      context.getHandler(),
    );
    const classMetadata = Reflect.getMetadata(
      'THROTTLER:LIMIT' + bucket,
      context.getClass(),
    );
    // Skip when the route did not name this bucket.
    return reflectorMetadata === undefined && classMetadata === undefined;
  };

/**
 * Exported for the spec, which asserts the wiring rather than a copy of it.
 *
 * `auth` looks unused and is not: `forgot-password` and `change-email` are the
 * only routes that name it, both at 5 per HOUR rather than per minute, which is
 * a deliberate anti-abuse choice for the two endpoints that send mail. The other
 * auth routes constrain `default` instead. Both behaviours are preserved by
 * `skipIf`, which keys on whether a route named the bucket.
 */
export function buildThrottlers() {
  return [
    // The global cap. No skipIf: this one is meant to reach everything.
    { ttl: 60_000, limit: 100 },
    // Named buckets reach only the routes that name them. See
    // appliesOnlyWhenNamedOnRoute.
    {
      name: 'auth',
      ttl: 60_000,
      limit: 10,
      skipIf: appliesOnlyWhenNamedOnRoute('auth'),
    },
    {
      name: 'orders',
      ttl: 60_000,
      limit: 30,
      skipIf: appliesOnlyWhenNamedOnRoute('orders'),
    },
    {
      name: 'upload',
      ttl: 60_000,
      limit: 20,
      skipIf: appliesOnlyWhenNamedOnRoute('upload'),
    },
    {
      name: 'contact',
      ttl: 60_000,
      limit: 5,
      skipIf: appliesOnlyWhenNamedOnRoute('contact'),
    },
  ];
}

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
        throttlers: buildThrottlers(),
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
