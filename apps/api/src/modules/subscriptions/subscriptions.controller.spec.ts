import { HttpStatus, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { Env } from '../../config/env.schema';
import { DRIZZLE } from '../../database/database.tokens';
import {
  SubscriptionsRepository,
  type PlanEntry,
  type SubscriptionEntry,
} from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * LAS TRES PUERTAS DE LAS TRES RUTAS, sobre el stack HTTP real.
 *
 * ─── POR QUÉ EL SERVICIO NO ESTÁ STUBBEADO ─────────────────────────────────────
 *
 * Porque lo que esta tarea tiene que demostrar no es que el controlador llama
 * a un método: es que la PUERTA que se decide en el servicio es la del plan.
 * Con el servicio stubbeado, un `GET /businesses/:id/subscription` devolvería
 * 200 a cualquiera y el test pasaría igual —incluido un controlador sin
 * ninguna puerta— que es exactamente el defecto que estas tres rutas no pueden
 * tener.
 *
 * Lo que se stubea es TODO lo que hay debajo del servicio: el repositorio.
 * El controlador, los pipes, los dos guards de `SecurityModule` y el
 * `SubscriptionsService` son los de verdad.
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'subscriptions-http-spec-secret';

const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const MISSING_BIZ = '3b1c9d20-1f4e-4a6b-9c11-77aa11bb22cc';

const OWNER_USER = '00000000-0000-4000-8000-000000000001';
const MANAGER_USER = '00000000-0000-4000-8000-000000000002';
const STAFF_USER = '00000000-0000-4000-8000-000000000003';
const CONSUMER_USER = '00000000-0000-4000-8000-000000000004';
const ADMIN_USER = '00000000-0000-4000-8000-000000000005';

const SINCE = new Date('2026-10-01T12:00:00.000Z');

const freePlan: PlanEntry = {
  code: 'free',
  audience: 'business',
  max_locations: 1,
  max_members: 2,
  is_active: true,
  features: ['staff_access'],
};

const proPlan: PlanEntry = {
  code: 'pro',
  audience: 'business',
  max_locations: 5,
  max_members: 20,
  is_active: true,
  features: ['staff_access', 'payments'],
};

function subscriptionEntry(): SubscriptionEntry {
  return { plan_code: 'pro', started_at: SINCE, plan: proPlan };
}

/**
 * El `app_role` que la API atribuye a cada token.
 *
 * `admin` es el único que no es `business`, y es también el único que no es
 * miembro de ningún negocio: por eso el 403 del dueño se distingue del 403
 * del admin por el MENSAJE y no por el status.
 */
const PROFILES: Record<string, { id: string; email: null; role: string }> = {
  [OWNER_USER]: { id: OWNER_USER, email: null, role: 'business' },
  [MANAGER_USER]: { id: MANAGER_USER, email: null, role: 'business' },
  [STAFF_USER]: { id: STAFF_USER, email: null, role: 'business' },
  [CONSUMER_USER]: { id: CONSUMER_USER, email: null, role: 'user' },
  [ADMIN_USER]: { id: ADMIN_USER, email: null, role: 'admin' },
};

/** El rol que tiene cada quien en el negocio del fixture. */
const ROLE_BY_USER: Record<string, string | null> = {
  [OWNER_USER]: 'owner',
  [MANAGER_USER]: 'manager',
  [STAFF_USER]: 'staff',
};

const repository: Record<string, ReturnType<typeof jest.fn>> = {
  listActivePlans: jest.fn(async () => [freePlan, proPlan]),
  findPlan: jest.fn(async (code: string) =>
    code === 'pro' ? proPlan : freePlan,
  ),
  findBusinessSubscription: jest.fn(async () => subscriptionEntry()),
  businessExists: jest.fn(
    async (businessId: string) => businessId !== MISSING_BIZ,
  ),
  roleOf: jest.fn(
    async (_businessId: string, userId: string) => ROLE_BY_USER[userId] ?? null,
  ),
  /**
   * La transacción y la fila viva que se lee para escribir encima.
   *
   * La fila dice `free`: el negocio está en el plan gratuito y el admin le
   * asigna el `pro`, así que la asignación ES un cambio y la fila se escribe.
   */
  transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ tx: true }),
  ),
  findLiveSubscriptionForUpdate: jest.fn(async () => ({
    id: 'sub-1',
    business_id: BIZ,
    user_id: null,
    plan_code: 'free',
    started_at: SINCE,
    cancelled_at: null,
    deleted_at: null,
    created_at: SINCE,
    updated_at: SINCE,
  })),
  updateLiveSubscription: jest.fn(async () => ({
    id: 'sub-1',
    business_id: BIZ,
    user_id: null,
    plan_code: 'pro',
    started_at: SINCE,
    cancelled_at: null,
    deleted_at: null,
    created_at: SINCE,
    updated_at: SINCE,
  })),
  insertBusinessSubscription: jest.fn(async () => ({
    id: 'sub-1',
    business_id: BIZ,
    user_id: null,
    plan_code: 'pro',
    started_at: SINCE,
    cancelled_at: null,
    deleted_at: null,
    created_at: SINCE,
    updated_at: SINCE,
  })),
};

/** El sujeto que el verificador REAL acaba de autenticar. */
let verifiedSub = '';

/**
 * La forma de drizzle que lee `AuthGuard`: un `select().from(profiles).where(…)`
 * que contesta por la identidad recién verificada.
 */
const drizzleStub = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const profile = PROFILES[verifiedSub];
          return profile ? [profile] : [];
        },
      }),
    }),
  }),
};

let app: INestApplication | undefined;

beforeAll(async () => {
  const config = {
    get: (key: string) =>
      ({ SUPABASE_URL, SUPABASE_JWT_SECRET: JWT_SECRET })[key],
  } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({
    controllers: [SubscriptionsController],
    providers: [
      SubscriptionsService,
      { provide: SubscriptionsRepository, useValue: repository },
      { provide: DRIZZLE, useValue: drizzleStub },
      { provide: ConfigService, useValue: config },
      AuthGuard,
      RolesGuard,
      {
        provide: SupabaseTokenVerifier,
        useFactory: () => {
          const real = new SupabaseTokenVerifier(config);
          return {
            verify: async (token: string) => {
              const verified = await real.verify(token);
              verifiedSub = verified.sub;
              return verified;
            },
          };
        },
      },
      { provide: 'APP_GUARD', useExisting: AuthGuard },
      { provide: 'APP_GUARD', useExisting: RolesGuard },
    ],
  }).compile();

  // El logger del servicio escribe una línea JSON por evento, y un test no es
  // un lugar donde los tee el stdout de producción.
  (
    moduleRef.get(SubscriptionsService) as unknown as { logger: unknown }
  ).logger = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  app = undefined;
});

beforeEach(() => {
  for (const mock of Object.values(repository)) mock.mockClear();
});

const http = () => {
  if (!app) throw new Error('el app no se levantó');
  return request(app.getHttpServer());
};

const tokens = new Map<string, Promise<string>>();

async function tokenFor(id: string): Promise<string> {
  let pending = tokens.get(id);
  if (!pending) {
    pending = new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setSubject(id)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(JWT_SECRET));
    tokens.set(id, pending);
  }
  return pending;
}

/** Un llamador autenticado. */
async function as(userId: string) {
  const auth = `Bearer ${await tokenFor(userId)}`;
  return {
    get: (url: string) => http().get(url).set('Authorization', auth),
    patch: (url: string) => http().patch(url).set('Authorization', auth),
  };
}

// ─────────────────────────── el catálogo ───────────────────────────

describe('GET /plans', () => {
  it('cualquier usuario autenticado recibe el catálogo', async () => {
    const res = await (await as(CONSUMER_USER)).get('/plans');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({
      code: 'free',
      audience: 'business',
      limits: { max_locations: 1, max_members: 2 },
      features: ['staff_access'],
    });
  });

  it('sin token es 401', async () => {
    await http().get('/plans').expect(401);
  });
});

// ────────────────────── ver el plan del negocio ──────────────────────

describe('GET /businesses/:businessId/subscription', () => {
  it('un empleado recibe 403, y no se lee nada', async () => {
    const res = await (
      await as(STAFF_USER)
    ).get(`/businesses/${BIZ}/subscription`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toBe(
      'Ver el plan del negocio es del dueño o su gerente.',
    );
    expect(repository.findBusinessSubscription).not.toHaveBeenCalled();
  });

  it('un gerente entra y recibe el plan de su negocio', async () => {
    const res = await (
      await as(MANAGER_USER)
    ).get(`/businesses/${BIZ}/subscription`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.plan_code).toBe('pro');
    expect(res.body.limits).toEqual({ max_locations: 5, max_members: 20 });
    expect(res.body.features).toEqual(['staff_access', 'payments']);
    expect(res.body.since).toBe(SINCE.toISOString());
  });

  it('un admin de plataforma entra', async () => {
    const res = await (
      await as(ADMIN_USER)
    ).get(`/businesses/${BIZ}/subscription`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.plan_code).toBe('pro');
  });

  it('sin token es 401', async () => {
    await http().get(`/businesses/${BIZ}/subscription`).expect(401);
  });

  it('un negocio inexistente es 404', async () => {
    const res = await (
      await as(ADMIN_USER)
    ).get(`/businesses/${MISSING_BIZ}/subscription`);

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.findBusinessSubscription).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 400 antes de tocar la base', async () => {
    const res = await (
      await as(MANAGER_USER)
    ).get(`/businesses/no-es-un-uuid/subscription`);

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.findBusinessSubscription).not.toHaveBeenCalled();
  });
});

// ────────────────────── asignar el plan ──────────────────────

describe('PATCH /businesses/:businessId/subscription', () => {
  it('el dueño del negocio recibe 403, y no se escribe nada', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/subscription`)
      .send({ plan_code: 'pro' });

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toBe(
      'Asignar el plan de un negocio es de la plataforma.',
    );
    expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
    expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
  });

  it('un admin de plataforma entra y el plan queda asignado', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .patch(`/businesses/${BIZ}/subscription`)
      .send({ plan_code: 'pro' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.plan_code).toBe('pro');
    expect(res.body.limits).toEqual({ max_locations: 5, max_members: 20 });
    expect(repository.updateLiveSubscription).toHaveBeenCalledWith(
      expect.anything(),
      BIZ,
      'pro',
    );
  });

  it('sin token es 401', async () => {
    await http()
      .patch(`/businesses/${BIZ}/subscription`)
      .send({ plan_code: 'pro' })
      .expect(401);
  });

  it('un negocio inexistente es 404, y no se escribe nada', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .patch(`/businesses/${MISSING_BIZ}/subscription`)
      .send({ plan_code: 'pro' });

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.insertBusinessSubscription).not.toHaveBeenCalled();
  });

  it('un plan_code que no está en el vocabulario es 400, antes de tocar la base', async () => {
    const res = await (
      await as(ADMIN_USER)
    )
      .patch(`/businesses/${BIZ}/subscription`)
      .send({ plan_code: 'enterprise' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
  });

  it('mandar los límites en el cuerpo es 400: los límites son del catálogo', async () => {
    // `UpdateBusinessSubscriptionSchema` es estricto: mandar `limits` sería
    // dejar que el cliente escribiera el número que el motor aplica.
    const res = await (
      await as(ADMIN_USER)
    )
      .patch(`/businesses/${BIZ}/subscription`)
      .send({
        plan_code: 'pro',
        limits: { max_locations: 99, max_members: 99 },
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateLiveSubscription).not.toHaveBeenCalled();
  });
});

// ─────────────────────────── la forma de las rutas ───────────────────────────

describe('la forma de las tres rutas', () => {
  it('son exactamente las tres, con el prefijo global', () => {
    const paths = Object.getOwnPropertyNames(SubscriptionsController.prototype)
      .filter((name) => name !== 'constructor')
      .map((name) => {
        const handler = Reflect.getMetadata(
          'path',
          SubscriptionsController.prototype[name],
        ) as string | undefined;
        return handler ? `${name}: ${handler}` : null;
      })
      .filter((entry): entry is string => entry !== null)
      .sort();

    expect(paths).toEqual([
      'assign: businesses/:businessId/subscription',
      'getSubscription: businesses/:businessId/subscription',
      'listPlans: plans',
    ]);
  });

  it('ninguna es pública y ninguna pide un rol de Nest', () => {
    // La puerta es la del SERVICIO —la membresía y la plataforma—, y un
    // `@Roles` mediría `profiles.role`, que es el `app_role` de la cuenta y no
    // lleva TTL. Un rol de Nest puesto «por uniformidad con los otros
    // controladores» dejaría pasar a un dueño cuya sesión venció, que es
    // justo la promesa que el §5.2 hace.
    for (const name of Object.getOwnPropertyNames(
      SubscriptionsController.prototype,
    )) {
      if (name === 'constructor') continue;
      const handler = SubscriptionsController.prototype[name];
      if (typeof handler !== 'function') continue;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});
