import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { DRIZZLE } from '../../database/database.tokens';
import type { Env } from '../../config/env.schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedProfile } from '../../../test/seed';
import { RevenueStatsService } from './revenue-stats.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/**
 * Frontera de seguridad de `GET /stats/revenue`, probada sobre el stack HTTP
 * real (AuthGuard + RolesGuard de `SecurityModule`, controlador real) y no con
 * una aserción de metadatos: un decorador mal puesto pasa un test de metadata
 * y filtra el dinero igual.
 *
 *  - sin token            → 401 (AuthGuard: la ruta no es pública)
 *  - token de user       → 403 (RolesGuard: no es admin)
 *  - token de business   → 403
 *  - token de admin      → 200
 *  - `GET /stats/platform` sin token → 200, y su cuerpo no tiene dinero
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'stats-security-secret';

let ctx: TestDbContext;
let app: INestApplication;
const tokens: Record<'user' | 'business' | 'admin', string> = {
  user: '',
  business: '',
  admin: '',
};

async function tokenFor(role: 'user' | 'business' | 'admin', id: string) {
  return new SignJWT({ email: `${role}-${id}@t.cl` })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function seedRole(role: 'user' | 'business' | 'admin'): Promise<string> {
  const id = await seedProfile(ctx.db, `${role}-${randomUUID()}@t.cl`);
  await ctx.db.execute(
    `update profiles set role = '${role}' where id = '${id}'`,
  );
  return id;
}

beforeAll(async () => {
  ctx = await createTestDb();

  const config = {
    get: (key: string) =>
      ({
        SUPABASE_URL,
        SUPABASE_JWT_SECRET: JWT_SECRET,
      })[key],
  } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({
    controllers: [StatsController],
    providers: [
      // StatsService real: el endpoint público tiene que seguir funcionando.
      StatsService,
      // El dinero se stubbea: acá se prueba la frontera, no la agregación.
      {
        provide: RevenueStatsService,
        useValue: { getRevenueStats: jest.fn() },
      },
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: ConfigService, useValue: config },
      AuthGuard,
      RolesGuard,
      { provide: 'APP_GUARD', useExisting: AuthGuard },
      { provide: 'APP_GUARD', useExisting: RolesGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();

  for (const role of ['user', 'business', 'admin'] as const) {
    tokens[role] = await tokenFor(role, await seedRole(role));
  }
  // Al menos un negocio, para que el endpoint público no devuelva todo en cero.
  await seedBusiness(ctx.db, await seedProfile(ctx.db));
}, 120000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

const api = () => request(app.getHttpServer());

describe('GET /stats/revenue (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    await api().get('/stats/revenue').expect(401);
  });

  test('con token corrupto → 401', async () => {
    await api()
      .get('/stats/revenue')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    await api()
      .get('/stats/revenue')
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  test('negocio autenticado sin rol admin → 403', async () => {
    await api()
      .get('/stats/revenue')
      .set('Authorization', `Bearer ${tokens.business}`)
      .expect(403);
  });

  test('admin → 200 con el reporte de dinero', async () => {
    const money = {
      period: { from: '2026-09-01', to: '2026-09-30' },
      accrued: {
        gross_amount: 150,
        platform_fees: 20,
        business_net: 130,
        effective_commission_rate: 0.1333,
        orders: { total: 4, completed: 2, cancelled: 1, expired: 1 },
      },
      collected: {
        gross_amount: 50,
        platform_fees: 10,
        business_net: 40,
        paid_payouts: 1,
        outstanding_business_net: 90,
        outstanding_payouts: 1,
        failed_payouts: 0,
      },
    };
    const service = app.get(RevenueStatsService);
    (service.getRevenueStats as jest.Mock).mockResolvedValue(money);

    const res = await api()
      .get('/stats/revenue?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

    expect(res.body).toEqual(money);
    expect(res.body.accrued.platform_fees).not.toBe(
      res.body.collected.platform_fees,
    );
  });
});

describe('GET /stats/platform (superficie pública, sin cambios)', () => {
  test('sigue siendo público y devuelve solo los tres conteos', async () => {
    const res = await api().get('/stats/platform').expect(200);

    expect(Object.keys(res.body).sort()).toEqual([
      'businesses',
      'meals_saved',
      'users',
    ]);
  });

  test('no expone ninguna métrica de dinero', async () => {
    const res = await api().get('/stats/platform').expect(200);
    const moneyish = Object.keys(res.body).filter((key) =>
      /fee|revenue|earn|payout|commission|money|amount|net|price/i.test(key),
    );

    expect(moneyish).toEqual([]);
  });
});
