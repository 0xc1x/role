import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import {
  BugReportDetailSchema,
  BugReportListResponseSchema,
} from '@0xc1x/role-commons';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import { RolesGuard } from '../../auth/roles.guard';
import { DRIZZLE } from '../../database/database.tokens';
import type { Env } from '../../config/env.schema';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedProfile } from '../../../test/seed';
import { AppStoreRepository } from '../store/app-store.repository';
import { BugReportInboxController } from './bug-report-inbox.controller';
import { BugReportInboxService } from './bug-report-inbox.service';

/**
 * Frontera del buzón de reportes probada sobre el stack HTTP real (AuthGuard +
 * RolesGuard, controlador real, servicio real sobre la DB real) y no con una
 * aserción de metadatos: un decorador mal puesto pasa un test de metadata y
 * filtra los reportes de los usuarios igual.
 *
 *  - sin token          → 401
 *  - token corrupto     → 401
 *  - token de user      → 403
 *  - token de business  → 403
 *  - token de admin     → 200
 *
 * Y, en el mismo archivo, las otras dos fronteras de esta superficie: que el
 * endpoint no se convierta en un `app_store` admin genérico, y que el listado no
 * publique el `reporter_id`.
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'bug-report-inbox-security-secret';

let ctx: TestDbContext;
let app: INestApplication;
let store: AppStoreRepository;
const tokens: Record<'user' | 'business' | 'admin', string> = {
  user: '',
  business: '',
  admin: '',
};

const REPORTER = '22222222-2222-4222-8222-222222222222';

const REPORTE = {
  summary: 'No me deja pagar con la tarjeta que usé ayer',
  description: 'Sale un error 500 al confirmar.',
  images: [`${REPORTER}/captura-1.png`],
  reporter_id: REPORTER,
  at: '2026-09-20T10:00:00.000Z',
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
    controllers: [BugReportInboxController],
    providers: [
      BugReportInboxService,
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

const seedReporte = (value: unknown = REPORTE, state?: string) =>
  store.insert({
    namespace: 'bug_report',
    value,
    ...(state ? { state } : {}),
  });

describe('GET /bug-report-inbox (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    await api().get('/bug-report-inbox').expect(401);
  });

  test('con token corrupto → 401', async () => {
    await api()
      .get('/bug-report-inbox')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    await api()
      .get('/bug-report-inbox')
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  test('negocio autenticado sin rol admin → 403', async () => {
    // Un negocio tiene su propio panel y podría ver los reportes de la
    // competencia si el endpoint no fuera admin-only.
    await api()
      .get('/bug-report-inbox')
      .set('Authorization', `Bearer ${tokens.business}`)
      .expect(403);
  });

  test('admin → 200 con la bandeja', async () => {
    const reporte = await seedReporte();

    const res = await comoAdmin(api().get('/bug-report-inbox')).expect(200);

    // `res.body` es `any` en `@types/supertest`: `res.body.data` a secas no
    // falla aunque el mapper emita otra forma, y el test quedaría verde
    // mintiendo. Parsear con el schema del contrato es lo que vuelve real la
    // aserción.
    const cuerpo = BugReportListResponseSchema.parse(res.body);
    const fila = cuerpo.data.find((f) => f.id === reporte.id);

    expect(fila).toBeDefined();
    expect(fila?.readable).toBe(true);
    expect(fila?.summary).toBe('No me deja pagar con la tarjeta que usé ayer');
  });
});

describe('GET /bug-report-inbox/:id (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    const reporte = await seedReporte();
    await api().get(`/bug-report-inbox/${reporte.id}`).expect(401);
  });

  test('usuario autenticado sin rol admin → 403', async () => {
    const reporte = await seedReporte();
    await api()
      .get(`/bug-report-inbox/${reporte.id}`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .expect(403);
  });

  test('admin → 200 con el detalle', async () => {
    const reporte = await seedReporte();

    const res = await comoAdmin(
      api().get(`/bug-report-inbox/${reporte.id}`),
    ).expect(200);

    const cuerpo = BugReportDetailSchema.parse(res.body);
    expect(cuerpo.reporter_id).toBe(REPORTER);
    expect(cuerpo.images).toHaveLength(1);
  });
});

describe('PATCH /bug-report-inbox/:id/state (frontera de seguridad)', () => {
  test('sin token → 401', async () => {
    const reporte = await seedReporte();
    await api()
      .patch(`/bug-report-inbox/${reporte.id}/state`)
      .send({ state: 'CORREGIDO' })
      .expect(401);
  });

  test('usuario autenticado sin rol admin → 403 y no tria', async () => {
    const reporte = await seedReporte();

    await api()
      .patch(`/bug-report-inbox/${reporte.id}/state`)
      .set('Authorization', `Bearer ${tokens.user}`)
      .send({ state: 'CORREGIDO' })
      .expect(403);

    // Un 403 tiene que dejar la fila como estaba, no marcarla corregida.
    expect((await store.findById(reporte.id))?.state).toBeNull();
  });

  test('negocio autenticado sin rol admin → 403 y no tria', async () => {
    const reporte = await seedReporte();

    await api()
      .patch(`/bug-report-inbox/${reporte.id}/state`)
      .set('Authorization', `Bearer ${tokens.business}`)
      .send({ state: 'CORREGIDO' })
      .expect(403);

    expect((await store.findById(reporte.id))?.state).toBeNull();
  });

  test('admin → 200 y la fila queda con el estado', async () => {
    const reporte = await seedReporte();

    const res = await comoAdmin(
      api().patch(`/bug-report-inbox/${reporte.id}/state`),
    )
      .send({ state: 'CORREGIDO' })
      .expect(200);

    // Parseado con el schema del contrato, no leído a secas: si el mapper se
    // cruzara y emitiera `status` en vez de `state`, el parseo revienta acá.
    const cuerpo = BugReportDetailSchema.parse(res.body);
    expect(cuerpo.state).toBe('CORREGIDO');

    // Y el aserto sobre la fila de la DB, que es el camino tipado: no pasa por
    // ninguna capa que este test controle.
    expect((await store.findById(reporte.id))?.state).toBe('CORREGIDO');
  });

  test('un estado fuera del vocabulario → 400 y no escribe', async () => {
    const reporte = await seedReporte();

    await comoAdmin(api().patch(`/bug-report-inbox/${reporte.id}/state`))
      .send({ state: 'REABIERTO' })
      .expect(400);

    expect((await store.findById(reporte.id))?.state).toBeNull();
  });

  test('un body sin state → 400', async () => {
    const reporte = await seedReporte();

    await comoAdmin(api().patch(`/bug-report-inbox/${reporte.id}/state`))
      .send({})
      .expect(400);

    expect((await store.findById(reporte.id))?.state).toBeNull();
  });

  test('el triaje no mueve delivery_status', async () => {
    // `state` y `delivery_status` son ortogonales y un reporte de error no
    // tiene camino de correo (D8): mandar la clave igual tiene que salir
    // descartada, no aplicada. Si el panel pudiera ponerla, el badge de entrega
    // mentiría.
    const reporte = await seedReporte();

    await comoAdmin(api().patch(`/bug-report-inbox/${reporte.id}/state`))
      .send({ state: 'CORREGIDO', delivery_status: 'PROCESADO' })
      .expect(200);

    const fila = await store.findById(reporte.id);
    expect(fila?.state).toBe('CORREGIDO');
    expect(fila?.delivery_status).toBe('PENDIENTE');
  });
});

describe('el endpoint no es un app_store genérico', () => {
  test('GET ignora un namespace del cliente', async () => {
    const reporte = await seedReporte();
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com', name: 'Ana' },
    });

    const res = await comoAdmin(
      api().get('/bug-report-inbox?namespace=contact&limit=100'),
    ).expect(200);

    const cuerpo = BugReportListResponseSchema.parse(res.body);
    const ids = cuerpo.data.map((f) => f.id);

    expect(ids).toContain(reporte.id);
    expect(ids).not.toContain(contacto.id);
  });

  test('GET con un state inválido → 400, no se filtra a lo bruto', async () => {
    await comoAdmin(api().get('/bug-report-inbox?state=NUEVO')).expect(400);
  });

  test('GET con un origin inválido → 400', async () => {
    await comoAdmin(api().get('/bug-report-inbox?origin=desktop')).expect(400);
  });

  test('GET :id de una fila de otro namespace → 404', async () => {
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com' },
    });
    await comoAdmin(api().get(`/bug-report-inbox/${contacto.id}`)).expect(404);
  });

  test('PATCH sobre una fila de otro namespace → 404 y no la escribe', async () => {
    // El 404 tiene que ocurrir ANTES de escribir: si no, el triaje de este
    // endpoint se leería encima de la bandeja de contactos.
    const contacto = await store.insert({
      namespace: 'contact',
      value: { email: 'ana@example.com' },
    });

    await comoAdmin(api().patch(`/bug-report-inbox/${contacto.id}/state`))
      .send({ state: 'CORREGIDO' })
      .expect(404);

    expect((await store.findById(contacto.id))?.state).toBeNull();
  });

  test('un id que no es uuid → 400', async () => {
    await comoAdmin(api().get('/bug-report-inbox/no-es-un-uuid')).expect(400);
  });
});

describe('el listado no publica datos personales', () => {
  /**
   * La versión HTTP de la comprobación fuerte del mapper spec: que la clave no
   * exista en la respuesta real, y no solo en el objeto que devuelve el mapper.
   */
  test('el listado no emite reporter_id ni las capturas', async () => {
    const reporte = await seedReporte();

    const res = await comoAdmin(
      api().get('/bug-report-inbox?limit=100'),
    ).expect(200);

    const cuerpo = BugReportListResponseSchema.parse(res.body);
    const fila = cuerpo.data.find((f) => f.id === reporte.id);

    expect(fila).toBeDefined();
    expect(fila).not.toHaveProperty('reporter_id');
    expect(fila).not.toHaveProperty('images');
    expect(JSON.stringify(fila)).not.toContain(REPORTER);
    expect(JSON.stringify(fila)).not.toContain('captura-1.png');

    // El detalle sí los lleva: el operador los necesita para seguir el reporte.
    const detalle = await comoAdmin(
      api().get(`/bug-report-inbox/${reporte.id}`),
    ).expect(200);
    const cuerpoDetalle = BugReportDetailSchema.parse(detalle.body);
    expect(cuerpoDetalle.reporter_id).toBe(REPORTER);
  });
});

describe('una fila con value corrupto no tumba la bandeja', () => {
  test('el listado responde 200 con la fila marcada como no legible', async () => {
    const sana = await seedReporte();
    const rota = await seedReporte({ lo_que_sea: true });

    const res = await comoAdmin(
      api().get('/bug-report-inbox?limit=100'),
    ).expect(200);

    const cuerpo = BugReportListResponseSchema.parse(res.body);
    const porId = new Map(cuerpo.data.map((f) => [f.id, f]));

    expect(porId.get(rota.id)?.readable).toBe(false);
    expect(porId.get(rota.id)?.summary).toBeNull();
    expect(porId.get(sana.id)?.readable).toBe(true);
  });

  test('el detalle de la fila corrupta responde 200, no 500', async () => {
    const rota = await seedReporte('esto no es un objeto');

    const res = await comoAdmin(
      api().get(`/bug-report-inbox/${rota.id}`),
    ).expect(200);

    const cuerpo = BugReportDetailSchema.parse(res.body);
    expect(cuerpo.readable).toBe(false);
    expect(cuerpo.summary).toBeNull();
  });
});

describe('un state fuera del vocabulario que ya está en la base', () => {
  test('sale null en la respuesta, no un estado que el panel no sabe pintar', async () => {
    const reporte = await seedReporte(REPORTE, 'REABIERTO');

    const res = await comoAdmin(
      api().get(`/bug-report-inbox/${reporte.id}`),
    ).expect(200);

    // El parseo con el schema es la aserción: `state` es `z.enum(BUG_TRIAGE_STATES)`, así
    // que un mapper que lo colara sin estrechar ROMPERÍA el parseo con un
    // ZodError. Acá sale `null` y el panel lo muestra como "sin triage".
    const cuerpo = BugReportDetailSchema.parse(res.body);
    expect(cuerpo.state).toBeNull();
    expect(cuerpo.readable).toBe(true);
  });
});
