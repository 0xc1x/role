import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestDb, type TestDbContext } from './db';
import {
  seedBusiness,
  seedBusinessHours,
  seedLocation,
  seedOffer,
  seedProfile,
} from './seed';

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
  app.setGlobalPrefix('api/v1');
  await app.init();

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
  const api = () => request(app.getHttpServer());
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
        'cover_image',
        'created_at',
        'description',
        'email',
        'id',
        'image',
        'name',
        'phone',
        'rating',
        'review_count',
        'slug',
        'type',
        'updated_at',
        'website',
      ]);
    }

    // The admin-only query keys are stripped, not honoured, so they cannot widen
    // the gate: the same list comes back.
    const filtered = await api()
      .get('/api/v1/businesses/public?verification_status=pending&is_active=false')
      .expect(200);
    expect(filtered.body.data.map((b: { id: string }) => b.id)).toEqual(ids);
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
});
