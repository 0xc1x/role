import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestDb, type TestDbContext } from './db';
import {
  seedBusiness,
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
let offerId: string;

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
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
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
    const loc = await ctx.db.execute(
      `select id from business_locations where business_id = '${businessId}' limit 1`,
    );
    const locationId = (loc as unknown as Array<{ id: string }>)[0]?.id as string;
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
});
