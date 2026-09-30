import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import { RolesGuard } from '../../auth/roles.guard';
import { DRIZZLE } from '../../database/database.tokens';
import type { Env } from '../../config/env.schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { AppStoreRepository } from '../store/app-store.repository';
import { ContactInboxController } from './contact-inbox.controller';
import { ContactInboxService } from './contact-inbox.service';

/**
 * Frontera de la bandeja de contactos probada sobre el stack HTTP real
 * (AuthGuard + RolesGuard, controlador real, servicio real sobre la DB real) y
 * no con una aserción de metadatos: un decorador mal puesto pasa un test de
 * metadata y filtra los datos personales de la gente que escribió desde la
 * landing igual.
 *
 *  - sin token          → 401
 *  - token corrupto     → 401
 *  - token de user      → 403
 *  - token de business  → 403
 *  - token de admin     → 200
 *
 * Y, en el mismo archivo, la otra frontera de esta superficie: que el endpoint
 * no se convierta en un `app_store` admin genérico. Un `?namespace=jobs` en el
 * query y un `PATCH` sobre el id de una fila de otro namespace tienen que
 * seguir sin hacer nada.
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'contact-inbox-security-secret';

let ctx: TestDbContext;
let app: INestApplication;
let store: AppStoreRepository;
const tokens: Record<'user' | 'business' | 'admin', string> = {
  user: '',
  business: '',
  admin: '',
};

const MENSAJE = {
  name: 'Ana',
  email: 'ana@example.com',
  role: 'persona',
  city: 'Quito',
  city_raw: 'Quito',
  city_other: null,
  message: 'Quiero recibir comida en mi casa',
  at: '2026-09-20T10:00:00.000Z',
  ip: '203.0.113.7',
  to: 'hola@role.ec',
  from: 'notificaciones@role.ec',
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
    controllers: [ContactInboxController],
    providers: [
      ContactInboxService,
      // Repositorio y servicio REALES: acá se prueba la frontera HTTP con el
      // namespace de verdad, no un doble que devolvería lo que se le pida.
      AppStoreRepository,
      { provide: DRIZZLE, useValue: ctx.db },
      { provide: ConfigService, useValue: config },
      AuthGuard,
      RolesGuard,
      // The guard delegates JWT verification to it; constructed from the same
      // ConfigService stub, so the real verification still runs here.
      SupabaseTokenVerifier,
      { provide: 'APP_GUARD', useExisting: AuthGuard },
      { provide: 'APP_GUARD', useExisting: RolesGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
  store = app.get(AppStoreRepository);

  for (const role of ['user', 'business', 'admin'] as const) {
    tokens[role] = await tokenFor(role, await seedRole(role));
  }
}, 120000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

const api = () => request(app.getHttpServer());
const comoAdmin = <T>(r: request.Test) =>
  r.set('Authorization', `Bearer ${tokens.admin}`);

describe('GET /contact-inbox (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    await api().get('/contact-inbox').expect(401);
  });

  test('con token corrupto → 401', async () => {
    await api()
      .get('/contact-inbox')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    await api()
      .get('/contact-inbox')
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  test('negocio autenticado sin rol admin → 403', async () => {
    await api()
      .get('/contact-inbox')
      .set('Authorization', `Bearer ${tokens.business}`)
      .expect(403);
  });

  test('admin → 200 con la bandeja', async () => {
    const mensaje = await store.insert({
      namespace: 'contact',
      value: MENSAJE,
    });

    const res = await comoAdmin(api().get('/contact-inbox')).expect(200);

    const fila = res.body.data.find((f: { id: string }) => f.id === mensaje.id);
    expect(fila).toBeDefined();
    expect(fila.readable).toBe(true);
    expect(fila.email).toBe('ana@example.com');
  });
});

describe('PATCH /contact-inbox/:id/handled (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    const fila = await store.insert({ namespace: 'contact', value: MENSAJE });
    await api().patch(`/contact-inbox/${fila.id}/handled`).expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    const fila = await store.insert({ namespace: 'contact', value: MENSAJE });
    await api()
      .patch(`/contact-inbox/${fila.id}/handled`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);

    // Un 403 tiene que dejar la fila como estaba, no marcarla "atendida".
    expect((await store.findById(fila.id))?.status).toBe('PENDIENTE');
  });

  test('admin → 200 y la fila queda PROCESADO', async () => {
    const fila = await store.insert({ namespace: 'contact', value: MENSAJE });

    const res = await comoAdmin(
      api().patch(`/contact-inbox/${fila.id}/handled`),
    ).expect(200);

    expect(res.body.status).toBe('PROCESADO');
    expect((await store.findById(fila.id))?.status).toBe('PROCESADO');
  });
});

describe('el endpoint no es un app_store genérico', () => {
  test('GET ignora un namespace del cliente', async () => {
    const contacto = await store.insert({
      namespace: 'contact',
      value: MENSAJE,
    });
    const ajeno = await store.insert({ namespace: 'jobs', value: { a: 1 } });

    const res = await comoAdmin(
      api().get('/contact-inbox?namespace=jobs&limit=100'),
    ).expect(200);

    const ids = res.body.data.map((f: { id: string }) => f.id);
    expect(ids).toContain(contacto.id);
    expect(ids).not.toContain(ajeno.id);
  });

  test('GET con un status inválido → 400, no se filtra a lo bruto', async () => {
    await comoAdmin(api().get('/contact-inbox?status=NUEVO')).expect(400);
  });

  test('GET :id de una fila de otro namespace → 404', async () => {
    const ajeno = await store.insert({ namespace: 'jobs', value: { a: 1 } });
    await comoAdmin(api().get(`/contact-inbox/${ajeno.id}`)).expect(404);
  });

  test('PATCH sobre una fila de otro namespace → 404 y no la escribe', async () => {
    const ajeno = await store.insert({ namespace: 'jobs', value: { a: 1 } });

    await comoAdmin(api().patch(`/contact-inbox/${ajeno.id}/handled`)).expect(
      404,
    );

    expect((await store.findById(ajeno.id))?.status).toBe('PENDIENTE');
  });
});

describe('el listado no filtra datos internos', () => {
  test('ni el listado ni el detalle emiten to/from, y la lista tampoco la ip', async () => {
    const mensaje = await store.insert({
      namespace: 'contact',
      value: MENSAJE,
    });

    const lista = await comoAdmin(api().get('/contact-inbox?limit=100')).expect(
      200,
    );
    const fila = lista.body.data.find(
      (f: { id: string }) => f.id === mensaje.id,
    );
    expect(fila).toBeDefined();
    expect(fila).not.toHaveProperty('to');
    expect(fila).not.toHaveProperty('from');
    expect(fila).not.toHaveProperty('ip');
    expect(JSON.stringify(fila)).not.toContain('hola@role.ec');

    // El detalle sí lleva la ip (dato que ayuda a investigar abuso) y sigue sin
    // llevar el routing interno.
    const detalle = await comoAdmin(
      api().get(`/contact-inbox/${mensaje.id}`),
    ).expect(200);
    expect(detalle.body.ip).toBe('203.0.113.7');
    expect(detalle.body).not.toHaveProperty('to');
    expect(detalle.body).not.toHaveProperty('from');
  });
});

describe('una fila con value corrupto no tumba la bandeja', () => {
  test('el listado responde 200 con la fila marcada como no legible', async () => {
    const sana = await store.insert({ namespace: 'contact', value: MENSAJE });
    const rota = await store.insert({
      namespace: 'contact',
      value: { lo_que_sea: true },
    });

    const res = await comoAdmin(api().get('/contact-inbox?limit=100')).expect(
      200,
    );

    const porId = new Map(res.body.data.map((f: { id: string }) => [f.id, f]));
    expect(porId.get(rota.id)?.readable).toBe(false);
    expect(porId.get(rota.id)?.email).toBeNull();
    expect(porId.get(sana.id)?.readable).toBe(true);
  });

  test('el detalle de la fila corrupta responde 200, no 500', async () => {
    const rota = await store.insert({
      namespace: 'contact',
      value: 'esto no es un objeto',
    });
    const res = await comoAdmin(api().get(`/contact-inbox/${rota.id}`)).expect(
      200,
    );
    expect(res.body.readable).toBe(false);
    expect(res.body.message).toBeNull();
  });
});
