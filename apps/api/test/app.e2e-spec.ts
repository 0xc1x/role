import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Smoke e2e — requires valid env + reachable DB.
 *
 * Skips when DATABASE_URL (or full env) is missing so local/CI unit jobs stay green.
 * Full marketplace e2e (auth → create order → stock) needs a test Supabase/Postgres
 * and is tracked for a later wave (testcontainers / compose service).
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const hasSupabase =
  Boolean(process.env.SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_JWT_SECRET) &&
  Boolean(process.env.SUPABASE_ANON_KEY) &&
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

const canBoot = hasDb && hasSupabase;

(canBoot ? describe : describe.skip)('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns status payload', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('database');
      });
  });

  it('GET /api/v1/offers is public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/offers')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('meta');
      });
  });

  it('POST /api/v1/orders without token is 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ offer_id: '00000000-0000-4000-8000-000000000001' })
      .expect(401);
  });

  it('POST /api/v1/auth/login with bad credentials is 401', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
  });
});

describe('App e2e (always)', () => {
  it('documents skip reason when env is incomplete', () => {
    if (!canBoot) {
      console.info(
        '[e2e] Skipped full suite: set DATABASE_URL + SUPABASE_* to enable.',
      );
    }
    expect(true).toBe(true);
  });
});
