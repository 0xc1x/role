import { describe, expect, it } from 'bun:test';
import type { ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { buildThrottlers } from './rate-limit.module';

/**
 * `ThrottlerGuard` applies every configured throttler to every request. It skips
 * one only when the route carries `@SkipThrottle({ <name>: true })`; `@Throttle`
 * overrides a bucket's ttl and limit but never opts the route out of the others.
 *
 * The consequence was a whole-API limit of 5 requests per minute, because the
 * `contact` bucket is 5. Nothing caught it: the unit specs never reach the real
 * guard with a real context, and the e2e suite was read as a Redis TTL race
 * rather than as the product being rate limited to five requests a minute.
 *
 * These tests assert the WIRING — the real `buildThrottlers()` output, against
 * the real `@Throttle` decorator — because a spec that re-declared the buckets
 * would keep passing after the configuration was reverted, which is the failure
 * this file exists to prevent.
 */

/** The shape ThrottlerGuard passes to `skipIf`. */
function contextFor(handler: object, cls: object): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function named(
  buckets: Record<string, { limit: number; ttl: number }>,
): MethodDecorator {
  return Throttle(buckets);
}

/**
 * Apply `@Throttle` the way Nest does, to a real method, and hand back the
 * function the guard will later see as `getHandler()`. Merely holding the
 * decorator without applying it writes no metadata at all, which makes every
 * assertion in this file pass for the wrong reason.
 */
function handlerThrottling(
  buckets: Record<string, { limit: number; ttl: number }>,
): () => undefined {
  const handler = function routeHandler() {
    return undefined;
  };
  const descriptor = { value: handler } as unknown as PropertyDescriptor;
  named(buckets)({} as object, 'method', descriptor);
  return handler as () => undefined;
}

/**
 * The same, for a bucket declared on the controller class. Applied to the class
 * itself, which is the branch `@Throttle` takes when it receives no descriptor —
 * a method decorator writes the metadata onto the handler function, not the
 * class, so a method-style application here would test nothing about the class.
 */
function classThrottling(
  buckets: Record<string, { limit: number; ttl: number }>,
): object {
  class Controller {
    ask() {
      return undefined;
    }
  }
  named(buckets)(Controller as unknown as MethodDecorator);
  return Controller;
}

describe('rate limit buckets', () => {
  it('leaves the global default bucket applying to every route', () => {
    const [global] = buildThrottlers();
    expect(global.name).toBeUndefined();
    expect(global.limit).toBe(100);
    // No predicate at all: the global cap is the one bucket that must not need
    // an opt-in, or adding a route would silently mean adding no limit.
    expect((global as { skipIf?: unknown }).skipIf).toBeUndefined();
  });

  it('gives every named bucket a skipIf, so no named bucket governs unasked', () => {
    const named0 = buildThrottlers().filter((t) => t.name !== undefined);
    expect(named0.map((t) => t.name).sort()).toEqual([
      'auth',
      'contact',
      'orders',
      'upload',
    ]);
    for (const bucket of named0) {
      expect(typeof bucket.skipIf).toBe('function');
    }
  });

  it('applies a named bucket only to a route that named it', () => {
    const contact = buildThrottlers().find((t) => t.name === 'contact')!;
    const asksForIt = handlerThrottling({ contact: { limit: 5, ttl: 60_000 } });
    const asksForSomethingElse = handlerThrottling({
      orders: { limit: 10, ttl: 60_000 },
    });
    const asksForNothing = function plain() {
      return undefined;
    };

    expect(contact.skipIf!(contextFor(asksForIt, {}))).toBe(false);
    expect(contact.skipIf!(contextFor(asksForSomethingElse, {}))).toBe(true);
    expect(contact.skipIf!(contextFor(asksForNothing, {}))).toBe(true);
  });

  it('honours a bucket named on the controller class, not just the handler', () => {
    const orders = buildThrottlers().find((t) => t.name === 'orders')!;
    const controller = classThrottling({
      orders: { limit: 10, ttl: 60_000 },
    });
    const plainRoute = function plain() {
      return undefined;
    };
    expect(orders.skipIf!(contextFor(plainRoute, controller))).toBe(false);
  });

  it('reaches the 5-per-HOUR auth bucket on the two routes that name it', () => {
    // forgot-password and change-email are the only routes naming `auth`, both
    // deliberately at 5/hour because they send mail. If this bucket stopped
    // reaching them, an attacker could mail any user at 10/minute. Grepping for
    // `@Throttle({ X` on one line misses them: both decorators are multi-line.
    const auth = buildThrottlers().find((t) => t.name === 'auth')!;
    const sendsMail = handlerThrottling({
      default: { limit: 3, ttl: 60_000 },
      auth: { limit: 5, ttl: 3_600_000 },
    });
    expect(auth.skipIf!(contextFor(sendsMail, {}))).toBe(false);
  });

  it('does not let the tightest bucket decide the whole API', () => {
    // The regression itself, stated as an arithmetic property of the config
    // rather than as a request count: for any route that names no bucket, the
    // effective limit is the default, because every named bucket is skipped.
    const buckets = buildThrottlers();
    const appliesToEverything = buckets.filter((b) => !b.skipIf);
    expect(appliesToEverything).toHaveLength(1);
    expect(appliesToEverything[0]!.limit).toBe(100);

    const tightestNamed = Math.min(
      ...buckets.filter((b) => b.skipIf).map((b) => b.limit),
    );
    expect(tightestNamed).toBe(5);
    // Nothing below the global cap can bind a route that opted into nothing.
    expect(tightestNamed).toBeLessThan(100);
  });
});
