import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { eq } from 'drizzle-orm';
import type { Express } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { createTestDb, type TestDbContext } from './db';
import {
  seedBusiness,
  seedBusinessHours,
  seedCategory,
  seedLocation,
  seedOffer,
  seedProfile,
} from './seed';
import {
  coupons,
  deviceTokens,
  businessLocations,
} from '../src/database/schema';

/**
 * E2E marketplace (auth → oferta → orden → recogida → review → payout).
 *
 * Requiere el Postgres de test (`docker compose up postgres-test`).
 * Auth: JWT HS256 forjados con SUPABASE_JWT_SECRET (bypass de Supabase Auth;
 * el guard verifica firma + perfil en DB, que es lo que se prueba aquí).
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'e2e-test-secret';

let ctx: TestDbContext;
let app: INestApplication<App>;
let consumerId: string;
let ownerId: string;
let adminId: string;
let businessId: string;
let locationId: string;
let offerId: string;
/** Active, but never moderation-approved: the gate must hide all of it. */
let pendingBusinessId: string;

async function token(sub: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/**
 * One distinct `X-Forwarded-For` per request, from a random /64 per run.
 *
 * `ThrottlerGuard` keys on `req.ip`, and this file makes roughly forty requests
 * through one socket. Every one of them used to arrive from the same address, so
 * the suite spent its own throttle budget: with `REDIS_URL` set — which
 * `apps/api/.env` does — the run exhausted the `orders` bucket partway through
 * and thirteen tests came back `429 Too Many Requests`, growing on every re-run
 * because the counters sit in Redis under a 60s TTL.
 *
 * CI got away with it by accident. That step sets only `TEST_DATABASE_URL`, so
 * there is no Redis and `RedisThrottlerStorage` falls back to the in-memory map,
 * which resets with the process. One service added to the workflow, or one
 * developer with `REDIS_URL` exported, and the suite starts failing for a reason
 * that has nothing to do with the code under test.
 *
 * Randomised per run rather than fixed, because a fixed address only hides the
 * re-run problem: the second run inside the TTL window inherits the first run's
 * budget and fails identically. `normalizeIp` masks a v6 address to its /64
 * before it becomes a key, so one random /64 per run is 2^32 throttle namespaces
 * and the remaining 64 bits stay free for the per-request sequence.
 * `2001:db8::/32` is RFC 3847's documentation prefix.
 */
const RUN_PREFIX = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;
let ipSequence = 0;
function nextIp(): string {
  ipSequence += 1;
  return `${RUN_PREFIX}::${ipSequence.toString(16)}`;
}

/**
 * Block until the throttler's storage can answer.
 *
 * Fails loudly rather than returning quietly, so a throttle backend that is
 * genuinely broken reads as "the harness is not ready" and not as "the first
 * assertion in the suite is wrong".
 */
async function waitForThrottleBackend(server: Server): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const res = await request(server).get('/api/v1/health');
    if (res.status !== 500) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    'app.e2e-spec: /health kept answering 500 after boot. RedisThrottlerStorage ' +
      'builds its client with enableOfflineQueue: false, so the first request ' +
      'through ThrottlerGuard races the connection — the harness is not ready, ' +
      'and the next assertion is not the thing that is broken.',
  );
}

beforeAll(async () => {
  ctx = await createTestDb();
  process.env.DATABASE_URL = ctx.connectionString;
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
  process.env.SUPABASE_ANON_KEY = 'e2e-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'e2e-service';
  process.env.NODE_ENV = 'test';

  // Import dinámico DESPUÉS de fijar el env: ConfigModule congela las
  // variables al evaluar app.module (si se importa arriba, gana el .env).
  const { AppModule } = await import('../src/app.module');
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  // The two pieces of `main.ts` this suite's behaviour depends on, and that it
  // never installed. Without `trust proxy`, `req.ip` ignores `X-Forwarded-For`
  // and the per-run isolation below does nothing at all — the header would be
  // sent, honoured by nothing, and every request would still arrive from one
  // address. Production sets it, so setting it here is the faithful choice
  // rather than a concession to the test.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  // `RedisThrottlerStorage` builds its client with `enableOfflineQueue: false`,
  // so the first command after boot — which is the first request through
  // `ThrottlerGuard` — is refused and the guard answers 500. This suite used to
  // dodge that by accident: it spends several Postgres round trips seeding between
  // `init()` and its first request, and the client is connected by then. Relying
  // on that is how a race becomes a mystery, so it is waited out explicitly, on
  // `/health` and not on a route this suite asserts on.
  await waitForThrottleBackend(app.getHttpServer());

  consumerId = await seedProfile(ctx.db, `consumer-${randomUUID()}@t.cl`);
  await ctx.db.execute(
    `update profiles set role = 'user' where id = '${consumerId}'`,
  );
  ownerId = await seedProfile(ctx.db, `owner-${randomUUID()}@t.cl`);
  await ctx.db.execute(
    `update profiles set role = 'business' where id = '${ownerId}'`,
  );
  adminId = await seedProfile(ctx.db, `admin-${randomUUID()}@t.cl`);
  await ctx.db.execute(
    `update profiles set role = 'admin' where id = '${adminId}'`,
  );
  const biz = await seedBusiness(ctx.db, ownerId);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  locationId = loc.id;
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;

  // A weekly schedule for the storefront read, seeded out of weekday order on
  // purpose: the response is ordered by the enum's declaration order, not by
  // insertion order.
  await seedBusinessHours(ctx.db, businessId, { day: 'saturday' });
  await seedBusinessHours(ctx.db, businessId, { day: 'monday' });

  // A second business that exists and has a pickup point, but never passed
  // moderation review. Every public surface has to answer 404 for it.
  pendingBusinessId = (
    await seedBusiness(ctx.db, ownerId, { verification_status: 'pending' })
  ).id;
  await seedLocation(ctx.db, pendingBusinessId);
  await seedBusinessHours(ctx.db, pendingBusinessId, { day: 'monday' });
}, 120000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

describe('Marketplace e2e', () => {
  /**
   * Every verb here carries its own `X-Forwarded-For`, so none of the tests
   * below had to change and none of them can forget.
   *
   * It has to be done per verb rather than on the supertest object: given a
   * server, `request()` returns a `Test`, and `.set()` does not exist on one
   * until a method has been chosen. A `.get(...)`-first chain would make the
   * header a property of each call site, and the next verb someone reaches for
   * would quietly not have it.
   */
  const api = () => {
    const agent = request(app.getHttpServer());
    const ip = <T extends { set(k: string, v: string): T }>(t: T) =>
      t.set('X-Forwarded-For', nextIp());
    return {
      get: (url: string) => ip(agent.get(url)),
      post: (url: string) => ip(agent.post(url)),
      put: (url: string) => ip(agent.put(url)),
      patch: (url: string) => ip(agent.patch(url)),
      delete: (url: string) => ip(agent.delete(url)),
    };
  };
  let consumerToken = '';
  let ownerToken = '';
  let adminToken = '';
  let orderId = '';
  let pickupCode = '';

  test('health público', async () => {
    await api().get('/api/v1/health').expect(200);
  });

  test('sin token → 401', async () => {
    await api().get('/api/v1/orders').expect(401);
  });

  // The coupon pre-check is authenticated but NOT role-restricted, and this is
  // the only layer that can prove the difference: the controller spec reads
  // metadata, this one crosses the real global guard. A `@Public()` slip would
  // turn a code oracle into an unauthenticated enumeration of every promotion,
  // which is the thing the sibling admin routes withhold.
  //
  // Two requests, deliberately. The e2e suite shares one throttled IP and sits
  // close to the 100/min default bucket; the per-stage verdicts belong in the
  // database parity spec, not here.
  test('cupones: el pre-check exige sesión, no exige rol, y la lista no', async () => {
    await api()
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E10', business_id: businessId, amount: 3990 })
      .expect(401);

    // The pre-check is the ONE exception to the admin-only block. If this ever
    // returns 200 for a consumer, the enumeration the module withholds is open.
    await api()
      .get('/api/v1/coupons')
      .set('Authorization', `Bearer ${await token(consumerId, 'c@t.cl')}`)
      .expect(403);
  });

  test('cupones: el pre-check y la reserva cobran el mismo número', async () => {
    const [coupon] = await ctx.db
      .insert(coupons)
      .values({
        business_id: businessId,
        code: 'E2E10',
        name: 'E2E 10%',
        type: 'percentage',
        value: '10',
      })
      .returning();
    const amount = 3990;
    const expectedFinal = 3591;

    const validation = await api()
      .post('/api/v1/coupons/validate')
      .set('Authorization', `Bearer ${await token(consumerId, 'c@t.cl')}`)
      .send({ code: 'E2E10', business_id: businessId, amount })
      .expect(200);
    expect(validation.body).toEqual({
      applies: true,
      code: 'E2E10',
      discount: amount - expectedFinal,
      final_price: expectedFinal,
    });

    // And the number the pre-check quoted is the number the order carries.
    const fresh = await seedProfile(ctx.db);
    const reserved = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${await token(fresh, 'coupon@t.cl')}`)
      .send({ offer_id: offerId, coupon_code: 'E2E10' })
      .expect(201);
    expect(reserved.body.price).toBe(expectedFinal);
    expect(reserved.body.coupon_id).toBe(coupon?.id);

    // The pre-check spent nothing: only the reservation did.
    const [row] = await ctx.db
      .select({ used_count: coupons.used_count })
      .from(coupons)
      .where(eq(coupons.id, coupon!.id));
    expect(row?.used_count).toBe(1);
  });

  test('emite tokens y lista órdenes vacías', async () => {
    consumerToken = await token(consumerId, 'c@t.cl');
    ownerToken = await token(ownerId, 'o@t.cl');
    adminToken = await token(adminId, 'a@t.cl');
    const res = await api()
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(res.body.data).toEqual([]);
  });

  test('ofertas públicas incluyen la seed', async () => {
    const res = await api().get('/api/v1/offers').expect(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).toContain(offerId);
  });

  test('GET /offers/zones resuelve por HTTP y devuelve deals numérico', async () => {
    // The point of doing this over HTTP and not in the controller spec: Nest
    // matches routes in DECLARATION order, and `@Get(':id')` is
    // `ParseUUIDPipe`d. If `zones` were ever declared below it, this is the test
    // that fails — a unit spec calling `controller.listZones()` directly cannot
    // see the router at all, which is exactly how that mistake ships green.
    const zone = `e2e-centro-${randomUUID().slice(0, 8)}`;
    await ctx.db
      .update(businessLocations)
      .set({ zone })
      .where(eq(businessLocations.id, locationId));

    const res = await api().get('/api/v1/offers/zones').expect(200);
    // A bare array, NOT a 400 from the uuid pipe and not a 404.
    expect(Array.isArray(res.body)).toBe(true);

    const row = (res.body as Array<{ zone: string; deals: number }>).find(
      (r) => r.zone === zone,
    );
    expect(row).toBeDefined();
    expect(row!.deals).toBeGreaterThan(0);
    // A JSON number, not `"7"`: postgres.js hands back `int8` as a string and the
    // mapper is what makes this a number. A string here would be invisible to
    // every other assertion in this file and would break the mobile chip.
    expect(typeof row!.deals).toBe('number');

    // The query params are the RPC's, reached through validation. Searched from
    // (0, 0) with a 100 m radius the seeded location in Santiago is thousands of
    // km away, so the zone drops out: `limit=1` caps, it does not manufacture a
    // row, and an empty array here can only mean the radius filter ran.
    const far = await api()
      .get('/api/v1/offers/zones?lat=0&lng=0&radius_km=0.1&limit=1')
      .expect(200);
    expect(Array.isArray(far.body)).toBe(true);
    expect(far.body).toEqual([]);

    // The same request from the location's OWN coordinates brings it back, which
    // is what makes the assertion above about distance and not about the zone
    // being unlistable.
    const [here] = await ctx.db
      .select({
        latitude: businessLocations.latitude,
        longitude: businessLocations.longitude,
      })
      .from(businessLocations)
      .where(eq(businessLocations.id, locationId));
    const near = await api()
      .get(
        `/api/v1/offers/zones?lat=${here!.latitude}&lng=${here!.longitude}&radius_km=2`,
      )
      .expect(200);
    expect((near.body as Array<{ zone: string }>).map((r) => r.zone)).toContain(
      zone,
    );

    // `limit=0` is clamped to one row by `greatest(p_limit, 1)`, not rejected and
    // not emptied: an empty array here would mean the clamp was turned into a
    // validation, and a 400 would mean it was rejected outright.
    const zero = await api().get('/api/v1/offers/zones?limit=0').expect(200);
    expect(zero.body).toHaveLength(1);

    // A non-integer limit IS rejected, so the clamp is not a free pass for junk.
    await api().get('/api/v1/offers/zones?limit=1.5').expect(400);
  });

  test('GET /categories trae active_count numérico y 0 para una vacía', async () => {
    const category = await seedCategory(
      ctx.db,
      `E2E ${randomUUID().slice(0, 6)}`,
    );
    const res = await api().get('/api/v1/categories').expect(200);
    const data = res.body.data as Array<{ id: string; active_count?: number }>;
    const row = data.find((c) => c.id === category.id);
    expect(row).toBeDefined();
    // Present, a NUMBER, and a real zero — not absent and not null. The API
    // always emits it on the list, whatever the category holds.
    expect(row!.active_count).toBeDefined();
    expect(row!.active_count).not.toBeNull();
    expect(typeof row!.active_count).toBe('number');
    expect(row!.active_count).toBe(0);
  });

  test('consumer crea orden y descuenta stock', async () => {
    const before = await api().get(`/api/v1/offers/${offerId}`).expect(200);
    const res = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ offer_id: offerId })
      .expect(201);
    orderId = res.body.id;
    pickupCode = res.body.pickup_code;
    expect(pickupCode).toBeDefined();
    const after = await api().get(`/api/v1/offers/${offerId}`).expect(200);
    expect(after.body.stock).toBe(before.body.stock - 1);
  });

  test('segunda orden activa sobre la misma oferta → 409', async () => {
    await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ offer_id: offerId })
      .expect(409);
  });

  test('negocio confirma y deja lista', async () => {
    await api()
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'confirmed' })
      .expect(200);
    await api()
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ready_for_pickup' })
      .expect(200);
  });

  test('negocio valida pickup y completa', async () => {
    const res = await api()
      .post(`/api/v1/orders/${orderId}/validate-pickup`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ pickup_code: pickupCode })
      .expect(201);
    expect(res.body.status).toBe('completed');
  });

  test('consumer deja review', async () => {
    await api()
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ order_id: orderId, business_rating: 5, product_rating: 4 })
      .expect(201);
  });

  test('admin genera payout de la orden completada', async () => {
    const gen = await api()
      .post('/api/v1/payouts/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(gen.body.count).toBeGreaterThanOrEqual(1);
    const list = await api()
      .get('/api/v1/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('stats públicas responden', async () => {
    await api().get('/api/v1/stats/platform').expect(200);
  });

  test('negocio ajeno no puede mutar la orden', async () => {
    const offer2 = await seedOffer(ctx.db, businessId, locationId);
    const order2 = await api()
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ offer_id: offer2.id })
      .expect(201);
    const stranger = await seedProfile(ctx.db, `s-${randomUUID()}@t.cl`);
    await ctx.db.execute(
      `update profiles set role = 'business' where id = '${stranger}'`,
    );
    const strangerToken = await token(stranger, 's@t.cl');
    await api()
      .patch(`/api/v1/orders/${order2.body.id}/status`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ status: 'cancelled' })
      .expect(403);
  });

  // The e2e app shares its Redis throttle counters with whatever else is
  // talking to the same Redis, so these cases are kept to the few requests
  // that only HTTP can prove: the wire contract, the owner coming from the
  // token, and the authorization parity of the timeline. Ordering, pagination
  // and the field projection are covered in the module specs against real
  // Postgres, without spending the shared budget.
  test('favoritos: idempotente, ignora user_id del body y embebe la oferta', async () => {
    const other = await seedProfile(ctx.db, `f-${randomUUID()}@t.cl`);

    // `user_id` is not in the request schema, so it is stripped: the favorite
    // belongs to the caller, not to whoever the body named.
    const first = await api()
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ offer_id: offerId, user_id: other })
      .expect(201);
    const second = await api()
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ offer_id: offerId })
      .expect(201);

    expect(first.body.user_id).toBe(consumerId);
    expect(second.body.id).toBe(first.body.id);

    const list = await api()
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0].offer.id).toBe(offerId);
    expect(list.body.data[0].offer.business.name).toBeDefined();
  });

  test('favoritos: la lista es del caller y quitar por offer id responde 204', async () => {
    const other = await seedProfile(ctx.db, `g-${randomUUID()}@t.cl`);
    const otherToken = await token(other, 'g@t.cl');

    const asOther = await api()
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(asOther.body.data).toEqual([]);

    await api()
      .delete(`/api/v1/favorites/${offerId}`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(204);

    const empty = await api()
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(empty.body.data).toEqual([]);
  });

  test('addresses: the owner comes from the token, user_id is stripped, the default flag is the API call', async () => {
    const other = await seedProfile(ctx.db, `a-${randomUUID()}@t.cl`);
    const otherToken = await token(other, 'a@t.cl');

    // `user_id` is not in the request schema, so the Zod pipe strips it: the
    // address belongs to the caller, not to whoever the body named.
    const created = await api()
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        label: 'Casa',
        address: 'Calle Falsa 123',
        latitude: -33.4372,
        longitude: -70.6506,
        user_id: other,
      })
      .expect(201);
    expect(created.body.user_id).toBe(consumerId);
    // The first address a user saves is their default: the API owns that rule,
    // and `saved_addresses` has no constraint behind it.
    expect(created.body.is_default).toBe(true);
    expect(typeof created.body.latitude).toBe('number');

    // The other consumer's book is untouched by the body that named them.
    const asOther = await api()
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(asOther.body).toEqual([]);

    // A second default clears the first, in one transaction.
    const second = await api()
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        label: 'Trabajo',
        address: 'Avenida Real 456',
        latitude: -33.45,
        longitude: -70.66,
        is_default: true,
      })
      .expect(201);
    expect(second.body.is_default).toBe(true);

    const list = await api()
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(
      list.body.filter((a: { is_default: boolean }) => a.is_default),
    ).toHaveLength(1);
    expect(list.body[0].id).toBe(second.body.id);

    // Un-defaulting the only default would leave the book with no default at
    // all, which the edge function that reads this flag cannot answer for: 409.
    await api()
      .patch(`/api/v1/addresses/${second.body.id}`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ is_default: false })
      .expect(409);

    // And someone else's address is a 404, never a write.
    await api()
      .patch(`/api/v1/addresses/${second.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ label: 'Sequestrado' })
      .expect(404);
    await api()
      .delete(`/api/v1/addresses/${second.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(204);

    await api()
      .delete(`/api/v1/addresses/${second.body.id}`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(204);
    const remaining = await api()
      .get('/api/v1/addresses')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(remaining.body).toHaveLength(1);
  });

  test('timeline: el dueño la lee y ni metadata ni changed_by se exponen', async () => {
    const res = await api()
      .get(`/api/v1/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);

    // pending → confirmed → ready_for_pickup → completed, oldest first.
    expect(res.body.data.map((e: { status: string }) => e.status)).toEqual([
      'pending',
      'confirmed',
      'ready_for_pickup',
      'completed',
    ]);
    for (const event of res.body.data) {
      expect(Object.keys(event).sort()).toEqual([
        'created_at',
        'previous_status',
        'reason',
        'status',
      ]);
    }
  });

  test('timeline: mismo acceso que GET /orders/{id}', async () => {
    // The business that owns the order reads its own order timeline, and a
    // stranger gets the same 403 it gets on the order itself.
    await api()
      .get(`/api/v1/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const stranger = await seedProfile(ctx.db, `t-${randomUUID()}@t.cl`);
    const strangerToken = await token(stranger, 't@t.cl');
    await api()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
    await api()
      .get(`/api/v1/orders/${orderId}/events`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(403);
  });

  // ─── Superficie pública de negocios y reseñas ───────────────────────
  //
  // What only HTTP can prove here, and why it is worth the shared throttle
  // budget: the routes RESOLVE. `BusinessesController` and `OffersController`
  // both declare `@Get(':id')`, so a public route mounted on either prefix in
  // the wrong position would be swallowed by it and answer 400 or 404 for a
  // different reason. The module specs cannot catch that; only a real request
  // through the router can. The rest of the behaviour (ordering, pagination,
  // index usage) is asserted against real Postgres in the module specs.

  test('catálogo público: solo negocios activos y aprobados, sin campos de panel', async () => {
    const res = await api().get('/api/v1/businesses/public').expect(200);

    const ids = res.body.data.map((b: { id: string }) => b.id);
    expect(ids).toContain(businessId);
    // A business in review is not in the public catalog, and the admin-only
    // filters of `ListBusinessesQuerySchema` are not accepted here.
    expect(ids).not.toContain(pendingBusinessId);
    expect(res.body.meta.total).toBe(ids.length);

    for (const business of res.body.data) {
      expect(Object.keys(business).sort()).toEqual([
        // The fourteen public business columns, plus the five
        // `active_businesses_near` fields (and the two location coordinates).
        // Widened on purpose when the RPC was mirrored (ADR-0008): the list is
        // now built from live offers and names the pickup point it ranked.
        'active_deals_count',
        'address',
        'business_location_id',
        'cover_image',
        'created_at',
        'description',
        'distance_km',
        'email',
        'id',
        'image',
        'latitude',
        'longitude',
        'name',
        'phone',
        'rating',
        'review_count',
        'slug',
        'type',
        'updated_at',
        'website',
        'zone',
      ]);
    }

    // The admin-only query keys are stripped, not honoured, so they cannot widen
    // the gate: the same list comes back.
    const filtered = await api()
      .get(
        '/api/v1/businesses/public?verification_status=pending&is_active=false',
      )
      .expect(200);
    expect(filtered.body.data.map((b: { id: string }) => b.id)).toEqual(ids);
  });

  test('el catálogo público acepta los parámetros de active_businesses_near', async () => {
    // Only the ROUTE and the query-string coercion are asserted here; the
    // ordering, radius and distance semantics live against real Postgres in
    // businesses.repository.public.near.db.spec.ts. What HTTP adds is that
    // `lat`/`lng`/`radius_km`/`type`/`sort` arrive as STRINGS and survive
    // `ZodValidationPipe` as numbers and an enum — a coercion that a repository
    // test cannot catch, because it calls the repository with already-typed input.
    const res = await api()
      .get(
        '/api/v1/businesses/public?lat=-33.45&lng=-70.66&radius_km=50&type=BUSINESS&sort=distance',
      )
      .expect(200);

    // `type` is a free string on purpose: the RPC lowercases the PARAMETER, so
    // `BUSINESS` is a valid request and simply matches nothing here.
    for (const business of res.body.data) {
      expect(business.active_deals_count).toBeGreaterThanOrEqual(1);
      expect(business.distance_km).not.toBeNull();
      expect(typeof business.business_location_id).toBe('string');
    }
  });

  test('storefront público: negocio con ubicaciones y horarios, en una respuesta', async () => {
    const res = await api()
      .get(`/api/v1/businesses/public/${businessId}`)
      .expect(200);

    expect(res.body.business.id).toBe(businessId);
    expect(res.body.locations.length).toBeGreaterThanOrEqual(1);
    expect(res.body.hours.map((h: { day: string }) => h.day)).toEqual([
      'monday',
      'saturday',
    ]);
    expect(Object.keys(res.body.hours[0]).sort()).toEqual([
      'business_id',
      'close_time',
      'created_at',
      'day',
      'id',
      'is_closed',
      'open_time',
      'updated_at',
    ]);
  });

  test('storefront y feeds de un negocio en revisión responden 404', async () => {
    // 404, not 403: anything else confirms the id exists.
    await api()
      .get(`/api/v1/businesses/public/${pendingBusinessId}`)
      .expect(404);
    await api()
      .get(`/api/v1/businesses/public/${pendingBusinessId}/reviews`)
      .expect(404);
    await api()
      .get(`/api/v1/businesses/public/${pendingBusinessId}/reviews?page=1`)
      .expect(404);
  });

  test('feeds públicos de reseñas: la del negocio y la de la oferta', async () => {
    const byBusiness = await api()
      .get(`/api/v1/businesses/public/${businessId}/reviews`)
      .expect(200);
    expect(byBusiness.body.data.length).toBe(1);
    expect(byBusiness.body.meta.total).toBe(1);
    // The author is a display name, and nothing else of the profile travels.
    expect(Object.keys(byBusiness.body.data[0]).sort()).toEqual([
      'author_id',
      'author_name',
      'business_id',
      'business_rating',
      'comment',
      'created_at',
      'id',
      'order_id',
      'product_rating',
      'updated_at',
    ]);

    const byOffer = await api()
      .get(`/api/v1/offers/${offerId}/reviews`)
      .expect(200);
    expect(byOffer.body.data[0]?.offer_id).toBe(offerId);
    expect(byOffer.body.data[0]?.offer_title).toBeDefined();

    // A sold-out offer fails the same availability gate as its detail read.
    const soldOut = await seedOffer(ctx.db, businessId, locationId, {
      stock: 0,
    });
    await api().get(`/api/v1/offers/${soldOut.id}/reviews`).expect(404);
  });

  test('mi feed de reseñas: requiere token y devuelve solo las mías', async () => {
    await api().get('/api/v1/me/reviews').expect(401);

    const mine = await api()
      .get('/api/v1/me/reviews')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.data[0]?.author_id).toBe(consumerId);
    expect(mine.body.data[0]?.is_hidden).toBe(false);

    const other = await seedProfile(ctx.db, `m-${randomUUID()}@t.cl`);
    const otherToken = await token(other, 'm@t.cl');
    const theirs = await api()
      .get('/api/v1/me/reviews')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(theirs.body.data).toEqual([]);
  });

  test('una reseña oculta sale del feed público y sigue en el de su autor', async () => {
    const hidden = await api()
      .get('/api/v1/me/reviews')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    const reviewId = hidden.body.data[0].id as string;

    await api()
      .patch(`/api/v1/reviews/moderation/${reviewId}/hide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ moderation_reason: 'insults_or_hate_speech' })
      .expect(200);

    const publicFeed = await api()
      .get(`/api/v1/businesses/public/${businessId}/reviews`)
      .expect(200);
    expect(publicFeed.body.data).toEqual([]);
    // The count follows the filter, so the page is not "1 of 0".
    expect(publicFeed.body.meta.total).toBe(0);

    const own = await api()
      .get('/api/v1/me/reviews')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(own.body.data).toHaveLength(1);
    expect(own.body.data[0]?.is_hidden).toBe(true);
    // The appeal record between the business and the platform is not the
    // author's to read.
    expect(own.body.data[0]?.moderation_reason).toBeUndefined();
  });

  // ─── /me: the caller's own account ─────────────────────────────────────
  // Every route here requires a token, takes no id, and answers from the token
  // subject. The e2e value is that the wiring is real: guard, pipe, controller,
  // service, repository, and the columns actually moving in Postgres.

  test('me: requiere token y devuelve la cuenta entera en una respuesta', async () => {
    await api().get('/api/v1/me').expect(401);

    // The seeded consumer has a profile but no preferences/consents rows: the
    // API never wrote them, so it reports null rather than 404-ing or inventing
    // them. A fresh profile is the honest fixture here.
    const bare = await seedProfile(ctx.db, `me-${randomUUID()}@t.cl`);
    const bareToken = await token(bare, 'me@t.cl');

    const res = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${bareToken}`)
      .expect(200);

    expect(res.body.profile.id).toBe(bare);
    expect(res.body.preferences).toBeNull();
    expect(res.body.notification_preferences).toBeNull();
    expect(res.body.consents).toEqual([]);

    // And a seeded account comes back whole, in ONE round trip: this is the
    // four-request fan-out mobile does on every app start today.
    await ctx.db.execute(
      `insert into user_preferences (user_id) values ('${consumerId}') on conflict do nothing`,
    );
    await ctx.db.execute(
      `insert into consumer_notification_preferences (user_id) values ('${consumerId}') on conflict do nothing`,
    );
    const seeded = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(seeded.body.preferences.user_id).toBe(consumerId);
    expect(seeded.body.notification_preferences.push_enabled).toBe(true);
  });

  test('me: un role en el body no cambia el rol, y un email se rechaza con 422', async () => {
    const patch = await api()
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${consumerToken}`)
      // `role` is not a key of the request schema, so it parses into nothing.
      .send({ role: 'admin', full_name: 'Consumidor' })
      .expect(200);
    expect(patch.body.role).toBe('user');
    expect(patch.body.full_name).toBe('Consumidor');

    const asAdmin = await api()
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'business' })
      .expect(200);
    expect(asAdmin.body.role).toBe('admin');

    // `email` is the GoTrue identity. A silent strip would answer 200 to a caller
    // who asked to change their address. The refusal has to name the route that
    // DOES work, or it is just a dead end: the two halves are the same contract
    // and a change to one without the other is the bug this pins.
    const email = await api()
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ email: 'nuevo@correo.cl' })
      .expect(422);
    expect(JSON.stringify(email.body)).toContain('supabase.auth.updateUser');
    expect(JSON.stringify(email.body)).toContain('/auth/change-email');
  });

  test('me: favorite_categories se valida contra el catálogo y guarda el nombre canónico', async () => {
    const category = await seedCategory(ctx.db, 'Panadería');
    await ctx.db.execute(
      `update categories set slug = 'panaderia-e2e' where id = '${category.id}'`,
    );

    const stored = await api()
      .patch('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ favorite_categories: ['  PANADERÍA  '] })
      .expect(200);
    // The display name, not the ASCII-folded slug: that is the string
    // `dispatch-nearby-offers` compares against.
    expect(stored.body.preferences.favorite_categories).toEqual(['Panadería']);

    // A value that can never match is refused, and the working list survives.
    const rejected = await api()
      .patch('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ favorite_categories: ['No existe'] })
      .expect(422);
    expect(rejected.body.details.unmatched).toEqual(['No existe']);

    const after = await api()
      .get('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);
    expect(after.body.preferences.favorite_categories).toEqual(['Panadería']);
  });

  test('me: media ventana de quiet hours se rechaza, y las dos puntas se guardan', async () => {
    // `filterNotInQuietHours` treats a window with one end as no window at all,
    // so storing this shape would be a setting the user believes is on and that
    // does nothing.
    await api()
      .patch('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ quiet_hours_from: '22:00:00' })
      .expect(422);

    const set = await api()
      .patch('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ quiet_hours_from: '22:00:00', quiet_hours_to: '07:00:00' })
      .expect(200);
    expect(set.body.notification_preferences.quiet_hours_from).toBe('22:00:00');
    expect(set.body.notification_preferences.quiet_hours_to).toBe('07:00:00');
  });

  test('me: PUT de consent es idempotente y el tipo fuera de la unión es 400', async () => {
    const first = await api()
      .put('/api/v1/me/consents')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ consent_type: 'marketing', granted: true })
      .expect(200);

    const second = await api()
      .put('/api/v1/me/consents')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ consent_type: 'marketing', granted: true })
      .expect(200);
    // Byte-identical, timestamps included: a retry after a flaky connection
    // must not move the grant moment.
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.granted_at).toBe(first.body.granted_at);
    expect(second.body.updated_at).toBe(first.body.updated_at);

    // `consent_type` is a bare text column with no CHECK, so the schema is the
    // only gate.
    await api()
      .put('/api/v1/me/consents')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ consent_type: 'cookies', granted: true })
      .expect(400);
  });

  test('me: el token de push se transfiere y el dueño anterior no lo alcanza', async () => {
    // NOT named `token`: that is the JWT helper at the top of this file.
    const pushToken = `ExponentPushToken[e2e-${randomUUID()}]`;

    const registered = await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${consumerToken}`)
      // `user_id` is not in the schema: the device belongs to the caller.
      .send({ token: pushToken, platform: 'ios', user_id: ownerId })
      .expect(201);
    expect(registered.body.user_id).toBe(consumerId);

    const other = await seedProfile(ctx.db, `me-dev-${randomUUID()}@t.cl`);
    const otherToken = await token(other, 'me-dev@t.cl');

    // The same device, another account: transferred, not rejected and not left
    // pointing at the previous owner.
    const moved = await api()
      .post('/api/v1/me/devices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ token: pushToken, platform: 'ios' })
      .expect(201);
    expect(moved.body.user_id).toBe(other);
    expect(moved.body.id).toBe(registered.body.id);

    // The previous owner revokes it: scoped to their own user_id, so it reaches
    // nothing and the device stays live for its new owner.
    await api()
      .delete(`/api/v1/me/devices?token=${encodeURIComponent(pushToken)}`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(204);

    // Read through the schema rather than raw SQL: the assertions are about what
    // the rows say, not about how they are queried.
    const [stillOwned] = await ctx.db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, pushToken));
    expect(stillOwned?.user_id).toBe(other);
    expect(stillOwned?.is_active).toBe(true);

    // The owner revokes its own: 204, and the row is deactivated.
    await api()
      .delete(`/api/v1/me/devices?token=${encodeURIComponent(pushToken)}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(204);
    const [revoked] = await ctx.db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.token, pushToken));
    expect(revoked?.is_active).toBe(false);
  });

  test('me: nadie lee ni escribe las preferencias, consents o devices de otro', async () => {
    const other = await seedProfile(ctx.db, `me-iso-${randomUUID()}@t.cl`);
    const otherToken = await token(other, 'me-iso@t.cl');

    await api()
      .patch('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ notification_radius_km: 30 })
      .expect(200);
    await api()
      .patch('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ weekly_summary_enabled: false })
      .expect(200);
    const consent = await api()
      .put('/api/v1/me/consents')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ consent_type: 'analytics', granted: true })
      .expect(200);

    // The other account reads its own, never the caller's. An explicit null, not
    // an empty body: this account has no settings rows at all.
    const prefs = await api()
      .get('/api/v1/me/preferences')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(prefs.body).toEqual({ preferences: null });

    const notif = await api()
      .get('/api/v1/me/notification-preferences')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(notif.body).toEqual({ notification_preferences: null });

    const consents = await api()
      .get('/api/v1/me/consents')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(consents.body).toEqual([]);
  });
});
