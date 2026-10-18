import { HttpStatus, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { StaffSessionStateSchema } from '@0xc1x/role-commons';
import type { StaffSessionState } from '@0xc1x/role-commons';
import { AuthGuard } from '../../auth/auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { Env } from '../../config/env.schema';
import { DRIZZLE } from '../../database/database.tokens';
import { StaffController, StaffSessionController } from './staff.controller';
import { StaffRepository, type BusinessMemberRow } from './staff.repository';
import { StaffService } from './staff.service';
import { STAFF_AUTH_ADMIN, type StaffAuthAdmin } from './staff.tokens';

/**
 * Las nueve rutas del §8 sobre el stack HTTP real: los controladores de verdad,
 * los pipes de verdad, los dos guards de `SecurityModule` de verdad y el
 * `StaffService` de verdad.
 *
 * ─── POR QUÉ EL SERVICIO NO ESTÁ STUBBEADO ──────────────────────────────────────
 *
 * Porque lo que esta tarea tiene que demostrar no es que el controlador llama a
 * un método: es que la PUERTA que se decide en el controlador es la del §5.2.
 * Con el servicio stubbeado, un `GET /businesses/:id/staff` devolvería 200 a
 * cualquiera y el test pasaría igual —incluido un controlador con
 * `@Roles('business')`, que es exactamente el defecto que el §8 manda reemplazar.
 *
 * Lo que se stubea es TODO lo que hay debajo del servicio: el repositorio y el
 * admin de Auth. Así el `requireActor` real lee una fila, pregunta por
 * `business_member_session_state` y decide, y el test observa lo que el panel
 * observaría.
 *
 * ─── LO QUE ESTOS TESTS NO AFIRMAN ─────────────────────────────────────────────
 *
 * Que `requireActor` pregunte lo correcto ya lo prueban los 68 tests del
 * servicio. Lo que este archivo afirma es de otra capa y es la razón de existir:
 * que la ruta NO tiene una puerta propia que la adelante. Por eso hay tests de
 * metadata (`ROLES_KEY` ausente) y de status sobre el stack real, y no una copia
 * de la lógica de negocio.
 */

const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'staff-controller-secret';

const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const LOC_A = '11111111-1111-4111-8111-111111111111';

const OWNER_USER = '00000000-0000-4000-8000-000000000001';
const MANAGER_USER = '00000000-0000-4000-8000-000000000002';
const STAFF_USER = '00000000-0000-4000-8000-000000000003';
const CONSUMER_USER = '00000000-0000-4000-8000-000000000004';
const NEW_AUTH_USER = '00000000-0000-4000-8000-0000000000ff';

const MEMBER_STAFF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_OWNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const HOUR = 3_600_000;

/**
 * Ids UUID-shaped porque el contrato lo dice: `profiles.id` es una columna uuid
 * y un fixture llamado `owner` sería una fila que la base no puede contener.
 */
function memberRow(
  overrides: Partial<BusinessMemberRow> = {},
): BusinessMemberRow {
  return {
    id: MEMBER_STAFF,
    business_id: BIZ,
    user_id: STAFF_USER,
    role: 'staff',
    label: 'Carla',
    alias: 'carla@panaderia.role.ec',
    status: 'active',
    session_ttl_hours: 24,
    last_authenticated_at: new Date(Date.now() - HOUR),
    created_at: new Date('2026-10-01T00:00:00.000Z'),
    updated_at: new Date('2026-10-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

/**
 * `session_ttl_hours: 0` es lo que dejó `20261016022631` en producción, y es
 * también lo que separa a este dueño del caso que el §5.2 niega.
 */
const ownerRow = () =>
  memberRow({
    id: MEMBER_OWNER,
    user_id: OWNER_USER,
    role: 'owner',
    label: 'Dueña',
    alias: 'dueno@panaderia.role.ec',
    session_ttl_hours: 0,
  });

const managerRow = () =>
  memberRow({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    user_id: MANAGER_USER,
    role: 'manager',
    label: 'Karla',
    alias: 'karla@panaderia.role.ec',
  });

/**
 * What `business_member_session_state` answers when the session is inside the
 * §5.2 promise.
 *
 * ─── POR QUÉ EL DOBLE NO CALCULA NADA ──────────────────────────────────────────
 *
 * Porque si calculara `sello + ttl` estaría SCIP reimplementando en el test justo
 * la cuenta que Plan 1 quitó del código. Los dos pasarían juntos aunque los dos
 * estuvieran mal, así que devuelve literales.
 */
function sessionState(
  overrides: Partial<StaffSessionState> = {},
): StaffSessionState {
  return StaffSessionStateSchema.parse({
    role: 'manager',
    location_ids: [LOC_A],
    expires_at: null,
    reason: 'ok',
    business_ids: [BIZ],
    ...overrides,
  });
}

/** Which membership `findMemberByUser` finds, per caller. */
const MEMBER_BY_USER: Record<string, BusinessMemberRow> = {
  [OWNER_USER]: ownerRow(),
  [MANAGER_USER]: managerRow(),
  [STAFF_USER]: memberRow(),
};

/**
 * What the session function answers, per caller.
 *
 * A map and not a function because the point of the expired-session tests is that
 * two callers with the SAME role get different answers, and a fixture where they
 * agreed would pass through a controller whose gate is the role.
 */
const SESSION_BY_USER: Record<string, StaffSessionState> = {
  [OWNER_USER]: sessionState({ role: 'owner', location_ids: [] }),
  [MANAGER_USER]: sessionState(),
  [STAFF_USER]: sessionState({ role: 'staff' }),
};

/**
 * The `app_role` the API attributes to each token.
 *
 * `consumer` carries `user` on purpose: the point of the test is that a consumer
 * is refused by the MEMBERSHIP —the §8 gate— and not by a decorator. If a
 * `@Roles('business')` were added to these routes, this test would keep passing
 * and the §5.2 promise would already estar rota; the `ROLES_KEY` test below es
 * la que lo dice.
 */
const PROFILES: Record<
  string,
  { id: string; email: string | null; role: string }
> = {
  [OWNER_USER]: { id: OWNER_USER, email: null, role: 'business' },
  [MANAGER_USER]: { id: MANAGER_USER, email: null, role: 'business' },
  [STAFF_USER]: { id: STAFF_USER, email: null, role: 'business' },
  [CONSUMER_USER]: { id: CONSUMER_USER, email: null, role: 'user' },
};

/**
 * The subject the REAL verifier just authenticated.
 *
 * `AuthGuard` verifies the token and only then asks `profiles` who that `sub` is.
 * The DB stub answers for the identity that was just verified, which is why the
 * verification stays real (a forged token is a 401 here, no exceptions) and only
 * the row lookup is fake — the row lookup is what a database is.
 */
let verifiedSub = '';

/** The doubles, declared before the module so DI resolves them once. */
type Mock = ReturnType<typeof jest.fn>;

/**
 * The last patch each membership row received.
 *
 * `memberDto` RE-READS the row after every write —the service does not answer
 * from memory— so a double that always returned the initial fixture would make
 * the HTTP response contradict the write it just did: a `disable` that answered
 * `status: 'active'`. This is the part of the database that the write is
 * supposed to change, and a fake that ignores it is a fake that lies about the
 * only thing the route is asserting.
 */
const written = new Map<string, Record<string, unknown>>();

const repository: Record<string, Mock> = {
  transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  findBusiness: jest.fn(async () => ({ id: BIZ, slug: 'panaderia-familia' })),
  findMemberByUser: jest.fn(
    async (_businessId: string, userId: string) =>
      MEMBER_BY_USER[userId] ?? null,
  ),
  findMemberById: jest.fn(async (_businessId: string, id: string) => ({
    ...memberRow({ id }),
    ...written.get(id),
  })),
  listMembersWithScope: jest.fn(async () => [
    { row: ownerRow(), locationIds: [] },
    { row: memberRow(), locationIds: [LOC_A] },
  ]),
  locationIdsOfMember: jest.fn(async () => [LOC_A]),
  findLocationIdsInBusiness: jest.fn(
    async (_businessId: string, ids: string[]) => ids,
  ),
  insertMember: jest.fn(async (_tx: unknown, values: unknown) => ({
    ...memberRow(),
    ...(values as object),
  })),
  setScope: jest.fn(async () => {}),
  updateMember: jest.fn(
    async (
      _businessId: string,
      memberId: string,
      values: Record<string, unknown>,
    ) => {
      written.set(memberId, { ...(written.get(memberId) ?? {}), ...values });
      return { ...memberRow({ id: memberId }), ...written.get(memberId) };
    },
  ),
  softDeleteMember: jest.fn(
    async (_tx: unknown, _businessId: string, id: string) =>
      memberRow({ id, deleted_at: new Date() }),
  ),
  stampSession: jest.fn(
    async (_businessId: string, _userId: string, at: Date) =>
      memberRow({ last_authenticated_at: at }),
  ),
  sessionStateAsCaller: jest.fn(
    async (_businessId: string, userId: string) =>
      SESSION_BY_USER[userId] ??
      sessionState({ reason: 'no_membership', business_ids: [] }),
  ),
};

const authAdmin = {
  createUser: jest.fn(async () => ({
    data: { user: { id: NEW_AUTH_USER } },
    error: null,
  })),
  deleteUser: jest.fn(async () => ({ error: null })),
  updateUserById: jest.fn(async () => ({ error: null })),
};

/**
 * The defaults every test starts from.
 *
 * `mockClear()` solo borra las llamadas: una implementación puesta por un test
 * seguiría viva en el siguiente, y un `sessionStateAsCaller` que quedó en
 * `session_expired` volvería negativa la mitad de los tests de abajo sin que
 * ninguno lo pidiera. Por eso se guardan y se reponen.
 */
const defaults = new Map<string, (() => unknown) | undefined>(
  [...Object.entries(repository), ...Object.entries(authAdmin)].map(
    ([name, mock]) => [name, mock.getMockImplementation()],
  ),
);

function resetDoubles(): void {
  written.clear();
  for (const [name, implementation] of defaults) {
    const mock = repository[name] ?? authAdmin[name as keyof typeof authAdmin];
    mock.mockClear();
    mock.mockImplementation(implementation as never);
  }
}

async function tokenFor(id: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/**
 * The drizzle shape `AuthGuard` reads, and nothing more: a `select().from(
 * profiles).where(…).limit(1)` that answers for the identity just verified.
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

let app: INestApplication;

beforeAll(async () => {
  const config = {
    get: (key: string) =>
      ({ SUPABASE_URL, SUPABASE_JWT_SECRET: JWT_SECRET })[key],
  } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({
    controllers: [StaffController, StaffSessionController],
    providers: [
      StaffService,
      { provide: StaffRepository, useValue: repository },
      {
        provide: STAFF_AUTH_ADMIN,
        useValue: { auth: { admin: authAdmin } } as StaffAuthAdmin,
      },
      { provide: DRIZZLE, useValue: drizzleStub },
      { provide: ConfigService, useValue: config },
      AuthGuard,
      RolesGuard,
      // The REAL verifier, wrapped so the DB stub knows who was authenticated.
      // Replacing it would make every "no token → 401" test pass for the wrong
      // reason: it would be the stub negando, no el guard.
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

  // El logger del servicio escribe una línea JSON por evento, y un test no es un
  // lugar donde lostee el stdout de producción. Se silencia después del
  // compile, que es cuando el servicio ya existe.
  (moduleRef.get(StaffService) as unknown as { logger: unknown }).logger = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  app = moduleRef.createNestApplication();
  await app.init();
}, 60000);

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  resetDoubles();
});

const api = () => request(app.getHttpServer());

/**
 * One authenticated caller.
 *
 * The token is minted once per user because `AuthGuard` caches the profile for
 * 30 s per `sub`, and re-minting would be slower for no gain: the cache key is
 * the identity, which is exactly what these tests vary.
 */
const tokens = new Map<string, Promise<string>>();

function as(userId: string) {
  let pending = tokens.get(userId);
  if (!pending) {
    pending = tokenFor(userId);
    tokens.set(userId, pending);
  }
  return pending.then((token) => {
    const auth = { Authorization: `Bearer ${token}` };
    return {
      get: (url: string) => api().get(url).set(auth),
      post: (url: string) => api().post(url).set(auth),
      patch: (url: string) => api().patch(url).set(auth),
      delete: (url: string) => api().delete(url).set(auth),
    };
  });
}

// ───────────────────────────── la puerta ─────────────────────────────

describe('la puerta de las ocho rutas es la del §5.2', () => {
  /**
   * El test que decide esta tarea, y el que un stub pasaría: con el servicio
   * reemplazado por `jest.fn()`, estas dos llamadas darían 200 las dos.
   *
   * La diferencia entre ellas NO es el rol —los dos son dueños—, es la sesión.
   * Y es la diferencia que el §5.2 promete: `business_member_session_valid` es
   * el único helper que puede DENEGAR por sesión, y `can_manage_location` lo
   * consulta para no autorizar. Autorizando por rol, la segunda respuesta sería
   * un 200 igual que la primera, y el panel y la base discreparían sobre quién
   * está presente.
   */
  it('un dueño con la sesión vencida recibe 403 aunque su rol lo permitiría', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'owner',
        location_ids: [],
        reason: 'session_expired',
        expires_at: '2026-10-16T03:00:00.000000+00:00',
      }),
    );

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('sesión venció');
    // Y la denegación ocurre ANTES de leer la lista: filtrarla y tirarla después
    // habría emitido las sucursales y los alias del negocio por el log.
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('el mismo dueño con `reason: ok` entra: lo que decide es la respuesta de la función', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(repository.listMembersWithScope).toHaveBeenCalled();
    expect(repository.sessionStateAsCaller).toHaveBeenCalledWith(
      BIZ,
      OWNER_USER,
    );
  });

  it('`session_never_stamped` también deniega: una membresía sin sello es una sesión vencida', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'owner',
        location_ids: [],
        reason: 'session_never_stamped',
      }),
    );

    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('una razón que esta API no conoce también deniega', async () => {
    // Una palabra nueva en la base no puede abrir la puerta por inadvertencia: el
    // predicado es `reason === 'ok'`, no `reason !== 'session_expired'`.
    repository.sessionStateAsCaller.mockResolvedValue({
      ...sessionState({ role: 'owner' }),
      reason: 'banned_for_being_rude',
    } as unknown as StaffSessionState);

    const res = await (await as(OWNER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('un empleado no administra, aunque su sesión esté viva', async () => {
    const res = await (await as(STAFF_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('empleado');
    // El `role` de la sesión dice `staff` y el `reason` dice `ok`: los dos los
    // concede la base, y ninguno de los dos abre la puerta. Lo que escribe el 403
    // es `requireActor`, no el estado.
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });

  it('un consumidor no es miembro: 403, no una lista vacía', async () => {
    const res = await (await as(CONSUMER_USER)).get(`/businesses/${BIZ}/staff`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(repository.listMembersWithScope).not.toHaveBeenCalled();
  });

  it('un id que no es uuid es 400 antes de tocar la base', async () => {
    const res = await (
      await as(OWNER_USER)
    ).patch(`/businesses/${BIZ}/staff/no-es-un-uuid`);

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.findMemberById).not.toHaveBeenCalled();
  });
});

describe('la puerta NO es un @Roles: la metadata lo dice', () => {
  const handlers = () => {
    const controller = app.get(StaffController);
    const session = app.get(StaffSessionController);
    return [
      controller.list,
      controller.create,
      controller.update,
      controller.updateAlias,
      controller.rotatePin,
      controller.disableAccess,
      controller.enableAccess,
      controller.remove,
      session.stampSession,
    ];
  };

  /**
   * La aserción negativa del §8, escrita como test.
   *
   * `RolesGuard` es global y lee `ROLES_KEY`: si estas nueve rutas lo tuvieran,
   * el chequeo sería `profiles.role ∈ […]`, que es `app_role` y NO lleva TTL. El
   * §5.2 sería entonces una promesa que nadie cumple en esta API, que escribe con
   * `service_role`.
   *
   * La ausencia es lo que hay que proteger, y es un test que no se rompe solo: un
   * `@Roles` puesto «por uniformidad con los otros controladores» deja verdes
   * todos los tests de arriba —`requireActor` deniega igual— y reinstala la
   * frontera equivocada DELANTE de la buena.
   */
  it('ninguna de las nueve rutas pide un rol de Nest', () => {
    const reflector = app.get(Reflector);

    for (const handler of handlers()) {
      expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
    }
  });

  it('ninguna de las nueve rutas es pública: el AuthGuard global es default-deny', () => {
    const reflector = app.get(Reflector);

    for (const handler of handlers()) {
      expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
    }
  });

  it('sin token es 401 en las ocho, y también en `POST /staff/session`', async () => {
    await api().get(`/businesses/${BIZ}/staff`).expect(401);
    await api()
      .post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`)
      .expect(401);
    // La novena no es pública tampoco: sella la sesión de QUIEN entra, y sin
    // token no hay nadie a quien sellársela.
    await api().post('/staff/session').send({ business_id: BIZ }).expect(401);
  });

  it('un token forjado es 401, y lo nega el verificador real', async () => {
    await api()
      .get(`/businesses/${BIZ}/staff`)
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  it('los prefijos son los del §8: ocho bajo el negocio, la novena aparte', () => {
    expect(Reflect.getMetadata('path', StaffController)).toBe(
      'businesses/:businessId/staff',
    );
    expect(Reflect.getMetadata('path', StaffSessionController)).toBe('staff');
  });
});

// ─────────────────────────── el alta no crea dueños ───────────────────────────

describe('POST /businesses/:id/staff', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  /**
   * El 422 y no el 400, y la diferencia no es cosmética.
   *
   * `CreateBusinessMemberSchema` acepta el vocabulario entero A PROPÓSITO
   * (`CREATABLE_BUSINESS_MEMBER_ROLES` es lo que el formulario ofrece, no lo que
   * el schema admite), así que el `owner` pasa la validación de forma y lo
   * rechaza la regla de producto con su motivo. Si el schema lo rechazara, el
   * cliente recibiría un 400 —una respuesta sobre la FORMA del cuerpo— por una
   * regla sobre qué se puede dar de alta, y el servicio se quedaría sin el caso
   * que probar.
   */
  it('un `owner` en el cuerpo es 422, y no crea nada', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Otro dueño',
        role: 'owner',
        business_location_ids: [],
      });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('dueño es quien creó el negocio');
    // Lo que hace que no sea un 400 disfrazado: NADA se escribió. Ni el
    // `auth.users` —que dejaría huérfano, con el alias quemado para siempre— ni
    // la membresía, ni se abrió una transacción.
    expect(authAdmin.createUser).not.toHaveBeenCalled();
    expect(repository.insertMember).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('un `staff` y un `manager` sí se dan de alta, y el PIN se entrega una vez', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(res.body.alias).toBe('carla@panaderia-familia.role.ec');
    expect(authAdmin.createUser).toHaveBeenCalled();
    expect(repository.insertMember).toHaveBeenCalled();
  });

  it('un campo de más en el cuerpo es 400 y no llega al servicio', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Carla',
        role: 'staff',
        business_location_ids: [],
        status: 'disabled',
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });

  it('`business_id` en el cuerpo es 400: el negocio lo trae la ruta', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({
        label: 'Carla',
        role: 'staff',
        business_location_ids: [],
        business_id: BIZ,
      });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.createUser).not.toHaveBeenCalled();
  });
});

// ────────────────────────────── dar de baja ──────────────────────────────

describe('DELETE /businesses/:id/staff/:memberId', () => {
  it('un gerente recibe 403 y no se da de baja a nadie', async () => {
    const res = await (
      await as(MANAGER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.message).toContain('dueño del negocio');
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('el dueño sí puede, y es un 204 sin cuerpo', async () => {
    const res = await (
      await as(OWNER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.NO_CONTENT);
    expect(res.body).toEqual({});
    expect(repository.softDeleteMember).toHaveBeenCalled();
    // El ban del `auth.users` es parte de la operación, no un efecto colateral:
    // una fila dada de baja no concede nada por ningún path, pero su login
    // seguiría entrando.
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.any(String) }),
    );
  });

  it('un id que no es de este negocio es 404, y no se toca nada', async () => {
    repository.findMemberById.mockResolvedValue(null);

    const res = await (
      await as(OWNER_USER)
    ).delete(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`);

    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(repository.softDeleteMember).not.toHaveBeenCalled();
  });
});

// ─────────────────────── POST /staff/session ───────────────────────

describe('POST /staff/session', () => {
  /**
   * La respuesta viene de la base y no de una cuenta en TypeScript.
   *
   * La fecha que se le pide al doble es una que NINGUNA aritmética de TTL puede
   * producir: la fila de la que saldría tiene `last_authenticated_at` de hace una
   * hora y `session_ttl_hours = 24`, así que un `sello + ttl` no puede dar 2031.
   * Si alguien reintrodujera el cálculo —en el servicio o en el repositorio, que
   * es donde Plan 1 lo borró— este test se pone rojo; y si sólo cambia el SQL, la
   * respuesta se mueve con él.
   */
  it('el `expires_at` de la respuesta es el que dijo la función', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: 'manager',
        location_ids: [LOC_A],
        expires_at: '2031-04-05T06:07:08.910000+00:00',
        reason: 'ok',
        business_ids: [BIZ],
      }),
    );

    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.expires_at).toBe('2031-04-05T06:07:08.910000+00:00');
    expect(res.body.role).toBe('manager');
    expect(res.body.reason).toBe('ok');
    expect(repository.stampSession).toHaveBeenCalledWith(
      BIZ,
      MANAGER_USER,
      expect.any(Date),
    );
  });

  it('sella primero y pregunta después: por eso una vencida vuelve como `ok`', async () => {
    // El doble cambia de respuesta según haya pasado el sello, que es lo que
    // hace la base. Leído al revés, el panel le diría a un gerente que acaba de
    // entrar que su sesión venció — y sería verdad en un idioma y falsa en el
    // otro. El ORDEN de las llamadas es la promesa, no el resultado.
    let sealed = false;
    repository.stampSession.mockImplementation(async () => {
      sealed = true;
      return managerRow();
    });
    repository.sessionStateAsCaller.mockImplementation(async () =>
      sealed
        ? sessionState({ expires_at: '2031-04-05T06:07:08.910000+00:00' })
        : sessionState({ reason: 'session_expired' }),
    );

    const res = await (
      await as(MANAGER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.body.reason).toBe('ok');
    expect(
      repository.sessionStateAsCaller.mock.invocationCallOrder[0],
    ).toBeGreaterThan(repository.stampSession.mock.invocationCallOrder[0]);
  });

  it('un empleado la puede llamar, y una membresía pausada se explica en vez de negarse', async () => {
    repository.findMemberByUser.mockResolvedValue(
      memberRow({ status: 'disabled' }),
    );
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'disabled',
        business_ids: [],
      }),
    );

    const res = await (
      await as(STAFF_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    // Un 403 sería un error genérico en la pantalla cuyo trabajo es explicar la
    // salida. Y además este empleado NO pasa la puerta de las otras ocho: esta es
    // la única de las nueve que puede llamar cualquier miembro.
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('disabled');
    expect(res.body.role).toBeNull();
    // Y a un acceso pausado no se le renueva la sesión: el sello es lo que revive
    // una sesión, y una fila que no concede nada no tiene sesión que revivir.
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('sin `business_id` es 400: el sello es de UNA membresía', async () => {
    const res = await (await as(MANAGER_USER)).post('/staff/session').send({});

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.stampSession).not.toHaveBeenCalled();
    expect(repository.sessionStateAsCaller).not.toHaveBeenCalled();
  });

  it('un campo de más es 400, no un 200 que finge haber sellado', async () => {
    const res = await (await as(MANAGER_USER)).post('/staff/session').send({
      business_id: BIZ,
      expires_at: '2031-01-01T00:00:00.000000+00:00',
    });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.stampSession).not.toHaveBeenCalled();
  });

  it('quien no es miembro recibe `no_membership`, no un 403', async () => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({
        role: null,
        location_ids: [],
        expires_at: null,
        reason: 'no_membership',
        business_ids: [],
      }),
    );

    const res = await (
      await as(CONSUMER_USER)
    )
      .post('/staff/session')
      .send({ business_id: BIZ });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.reason).toBe('no_membership');
    expect(repository.stampSession).not.toHaveBeenCalled();
  });
});

// ───────────────────── los códigos que el panel distingue ─────────────────────

describe('la traducción de Postgres llega al cliente con su código', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  /**
   * `409` para el alias repetido y `422` para el tope del plan.
   *
   * Los tres los traduce el servicio desde los códigos de Postgres —`23505`,
   * `R0001`, `R0002`— y esta capa tiene que dejarlos pasar SIN reescribirlos: un
   * filtro de excepciones que los tradujera otra vez sería el segundo sitio
   * donde vive la misma regla.
   */
  it('un alias repetido es 409 con el mensaje del negocio, no el código de Postgres', async () => {
    repository.insertMember.mockImplementation(async () => {
      throw Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint_name: 'business_members_alias_key',
      });
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.message).toBe('Ese alias ya está en uso en este negocio.');
    expect(JSON.stringify(res.body)).not.toContain('23505');
    // Y el `auth.users` que esta llamada creó se borró: sin compensación, un
    // reintento del mismo formulario encuentra el alias tomado por una cuenta que
    // nadie alcanza.
    expect(authAdmin.deleteUser).toHaveBeenCalledWith(NEW_AUTH_USER);
  });

  it('el tope del plan es 422 y el mensaje nombra el plan y el número', async () => {
    repository.insertMember.mockImplementation(async () => {
      throw Object.assign(new Error('plan limit'), {
        code: 'R0001',
        message: 'El plan no admite otro acceso.',
        detail: 'business=… plan=free limit=2 current=3',
      });
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('free');
    expect(res.body.message).toContain('2');
  });

  it('intentar tocar al dueño es 422 y el mensaje dice que se lo degrade', async () => {
    repository.findMemberById.mockResolvedValue(ownerRow());
    repository.updateMember.mockImplementation(async () => {
      throw Object.assign(new Error('owner untouchable'), {
        code: 'R0002',
        message: 'Degradalo a manager antes de tocar al dueño.',
      });
    });

    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_OWNER}/disable`);

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.message).toContain('Degradalo a manager');
    // El ban NO se mandó: el write de la base va primero a propósito, y un ban que
    // llegara antes de este `R0002` le habría dejado el negocio sin su dueño.
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('un login que ya existe en GoTrue es 409, en el idioma del dueño', async () => {
    authAdmin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff`)
      .send({ label: 'Carla', role: 'staff', business_location_ids: [] });

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.message).toBe('Ese alias ya está en uso.');
    expect(JSON.stringify(res.body)).not.toContain('already registered');
  });
});

describe('rotar y desactivar son operaciones distintas', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('rotar devuelve un PIN nuevo, responde 200 y NO manda ban', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.pin).toMatch(/^\d{6}$/);
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ password: expect.any(String) }),
    );
    // El §8 lo llama «el peor resultado posible de esta pantalla»: un dueño que
    // rota creyendo que cortó acceso deja al empleado con la sesión abierta, y no
    // se da cuenta. Por eso los dos métodos no se parecen ni en el nombre.
    expect(authAdmin.updateUserById).not.toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.anything() }),
    );
  });

  it('desactivar sí manda el ban, y responde 200 con la membresía', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/disable`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe('disabled');
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ ban_duration: expect.any(String) }),
    );
  });

  it('reactivar levanta el ban', async () => {
    const res = await (
      await as(OWNER_USER)
    ).post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/enable`);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe('active');
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
      ban_duration: 'none',
    });
  });

  it('un `pin` en el cuerpo del rotate es 400: el PIN lo elige el servidor', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .post(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/rotate`)
      .send({ pin: '000000' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('editar el alias son dos columnas en dos sistemas', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('mueve las dos y devuelve el aviso del §9.4, sin tocar el PIN', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'caja@panaderialafamilia.ec' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.alias_warnings).toEqual(['alias_domain_can_receive_mail']);
    expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
      alias: 'caja@panaderialafamilia.ec',
    });
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ email: 'caja@panaderialafamilia.ec' }),
    );
    // El alias es cómo se identifica y el PIN es el secreto: son dos hechos
    // independientes, y el dueño puede rotar el PIN aparte si quiere.
    expect(authAdmin.updateUserById).not.toHaveBeenCalledWith(
      STAFF_USER,
      expect.objectContaining({ password: expect.anything() }),
    );
  });

  it('un alias bajo `.role.ec` no trae aviso: la lista vacía también es una decisión', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'karla@panaderia.role.ec' });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.alias_warnings).toEqual([]);
  });

  it('si Auth rechaza el correo, el alias vuelve al que estaba', async () => {
    authAdmin.updateUserById.mockResolvedValue({ error: { message: 'boom' } });

    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'otro@panaderia.role.ec' });

    expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(repository.updateMember).toHaveBeenLastCalledWith(
      BIZ,
      MEMBER_STAFF,
      { alias: 'carla@panaderia.role.ec' },
    );
  });

  it('un alias que no es correo es 400 y no se toca nada', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}/alias`)
      .send({ alias: 'no-es-un-correo' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('PATCH /businesses/:id/staff/:memberId', () => {
  beforeEach(() => {
    repository.sessionStateAsCaller.mockResolvedValue(
      sessionState({ role: 'owner', location_ids: [] }),
    );
  });

  it('cambia el rol y las sucursales, y devuelve la membresía nueva', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ role: 'manager', business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.role).toBe('manager');
    expect(repository.setScope).toHaveBeenCalledWith(
      expect.anything(),
      MEMBER_STAFF,
      [LOC_A],
    );
  });

  it('promover a `owner` es 422, no una silent UPDATE', async () => {
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ role: 'owner' });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it('`status` en el cuerpo es 400: desactivar es su propia ruta', async () => {
    // Un `PATCH` que aceptara `status` devolvería un 200 que aparenta haber
    // pausado a alguien — sin ban, sin cerrar sesiones — y no lo hizo.
    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ status: 'disabled' });

    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    expect(repository.updateMember).not.toHaveBeenCalled();
    expect(authAdmin.updateUserById).not.toHaveBeenCalled();
  });

  it('una sucursal de otro negocio es 422, y no se escribe', async () => {
    repository.findLocationIdsInBusiness.mockResolvedValue([]);

    const res = await (
      await as(OWNER_USER)
    )
      .patch(`/businesses/${BIZ}/staff/${MEMBER_STAFF}`)
      .send({ business_location_ids: [LOC_A] });

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });
});
