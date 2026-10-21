import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SignJWT } from 'jose';
import request from 'supertest';
import { StaffSessionStateSchema } from '@0xc1x/role-commons';
import type { StaffSessionState } from '@0xc1x/role-commons';
import { AuthGuard } from '../src/auth/auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { SupabaseTokenVerifier } from '../src/auth/supabase-token-verifier';
import type { Env } from '../src/config/env.schema';
import { DRIZZLE } from '../src/database/database.tokens';
import { OwnershipController } from '../src/modules/staff/ownership.controller';
import { StaffController } from '../src/modules/staff/staff.controller';
import { StaffSessionController } from '../src/modules/staff/staff-session.controller';
import {
  StaffRepository,
  type BusinessMemberRow,
} from '../src/modules/staff/staff.repository';
import { StaffService } from '../src/modules/staff/staff.service';
import {
  STAFF_AUTH_ADMIN,
  type StaffAuthAdmin,
} from '../src/modules/staff/staff.tokens';

/**
 * El stack HTTP de las nueve rutas del §8, para los dos specs que lo necesitan.
 *
 * ─── POR QUÉ ESTO ESTÁ EN `test/` Y NO EN CADA SPEC ───────────────────────────
 *
 * Porque los dos archivos necesitan EXACTAMENTE el mismo app y los mismos
 * dobles, y copiarlo a los dos es la clase de copia que este módulo existe para
 * quitar: dos juegos de fixtures que se apartan y dos suites que pasan por
 * razones distintas. Un lugar, y el que importa —los dobles— es visible desde
 * los dos.
 *
 * ─── LO QUE ES REAL Y LO QUE NO ───────────────────────────────────────────────
 *
 * REAL: los dos controladores, los pipes, los dos guards de `SecurityModule`, el
 * verificador de JWT y el `StaffService`.
 *
 * FALSO: la base. `StaffRepository` y el admin de Auth son dobles.
 *
 * Y la asimetría es la razón de existir de estos specs: con el servicio stubbeado
 * un `GET /businesses/:id/staff` devolvería 200 a cualquiera y el archivo pasaría
 * igual —incluido un controlador con `@Roles('business')`, que es exactamente el
 * defecto que el §8 manda reemplazar. Con el servicio real y la base falsa, el
 * `requireActor` real lee una fila, pregunta por `business_member_session_state`
 * y decide, y el test observa lo que el panel observaría.
 */

export const SUPABASE_URL = 'http://127.0.0.1:9';
const JWT_SECRET = 'staff-http-harness-secret';

export const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
export const LOC_A = '11111111-1111-4111-8111-111111111111';

export const OWNER_USER = '00000000-0000-4000-8000-000000000001';
export const MANAGER_USER = '00000000-0000-4000-8000-000000000002';
export const STAFF_USER = '00000000-0000-4000-8000-000000000003';
export const CONSUMER_USER = '00000000-0000-4000-8000-000000000004';
/**
 * A platform admin, and the only fixture whose `app_role` is not `business`.
 *
 * It has NO membership: `MEMBER_BY_USER` deliberately has no entry for it, so
 * `findMemberByUser` answers `null` for this `sub`. That is what makes the
 * controller tests about the admin meaningful — the 403 has to come from
 * "administrar es del dueño" and not from "no eres miembro", and the two are only
 * distinguishable by the message.
 */
export const ADMIN_USER = '00000000-0000-4000-8000-000000000005';
export const NEW_AUTH_USER = '00000000-0000-4000-8000-0000000000ff';

export const MEMBER_STAFF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const MEMBER_OWNER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** A second business, for the `multiple_businesses` answer of the §5.2 table. */
export const OTHER_BIZ = '3b1c9d20-1f4e-4a6b-9c11-77aa11bb22cc';

const HOUR = 3_600_000;

/**
 * Ids UUID-shaped porque el contrato lo dice: `profiles.id` es una columna uuid
 * y un fixture llamado `owner` sería una fila que la base no puede contener.
 */
export function memberRow(
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
export const ownerRow = () =>
  memberRow({
    id: MEMBER_OWNER,
    user_id: OWNER_USER,
    role: 'owner',
    label: 'Dueña',
    alias: 'dueno@panaderia.role.ec',
    session_ttl_hours: 0,
  });

export const managerRow = () =>
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
export function sessionState(
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
 * `@Roles('business')` were added to these routes, that test would keep passing
 * and the §5.2 promise would already estar rota; the `ROLES_KEY` assertions are
 * the ones that say it.
 *
 * `ADMIN_USER` carries `admin`, and is the only fixture with no membership: see
 * its own note above.
 */
export const PROFILES: Record<
  string,
  { id: string; email: string | null; role: string }
> = {
  [OWNER_USER]: { id: OWNER_USER, email: null, role: 'business' },
  [MANAGER_USER]: { id: MANAGER_USER, email: null, role: 'business' },
  [STAFF_USER]: { id: STAFF_USER, email: null, role: 'business' },
  [CONSUMER_USER]: { id: CONSUMER_USER, email: null, role: 'user' },
  [ADMIN_USER]: { id: ADMIN_USER, email: null, role: 'admin' },
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

type Mock = ReturnType<typeof jest.fn>;

/**
 * The last patch each membership row received.
 *
 * `memberDto` RE-READS the row after every write — the service does not answer
 * from memory — so a double that always returned the initial fixture would make
 * the HTTP response contradict the write it just did: a `disable` that answered
 * `status: 'active'`. This is the part of the database the write is supposed to
 * change, and a fake that ignores it is a fake that lies about the only thing the
 * route is asserting.
 */
const written = new Map<string, Record<string, unknown>>();

export const repository: Record<string, Mock> = {
  transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  findBusiness: jest.fn(async () => ({ id: BIZ, slug: 'panaderia-familia' })),
  /**
   * The plan's entitlement, and the answer every plan gives today.
   *
   * `business_has_feature` is the DATABASE's answer, and the database's answer
   * today is `true` for every plan in the catalogue. A test that needs the other
   * answer sets this mock itself: the point of the double is to be the plan
   * table, not to have a private opinion about which plans exist.
   *
   * Y la respuesta son TRES estados, no dos: el plan que concede la feature, el
   * que no la concede, y el que no tiene fila en el catálogo —una avería, y no
   * una negativa del plan—. El primero es el que se sembró.
   */
  staffAccessEntitlement: jest.fn(async () => ({
    status: 'entitled',
    plan: 'pro',
  })),
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
  /**
   * The two reach questions, and the answer they give here.
   *
   * They are the DATABASE's answer, and the double plays the database: the
   * owner reaches everything, and everybody else reaches what is inside their
   * own scope. The scope of the fixture is `{LOC_A}`, so that is what a member
   * reaches and what a set of branches is covered by.
   */
  reachesMember: jest.fn(async () => true),
  coversLocations: jest.fn(async () => true),
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
  /**
   * The same answer for the named and the unnamed call.
   *
   * It is a default and not a distinction on purpose: what makes the two differ
   * is WHICH memberships the caller has, and a fixture that answered
   * `multiple_businesses` to one call and not the other would be inventing a
   * database behavior. The tests that need a distinction set the mock themselves.
   */
  sessionStateAsCaller: jest.fn(
    async (_businessId: string | null, userId: string) =>
      SESSION_BY_USER[userId] ??
      sessionState({ reason: 'no_membership', business_ids: [] }),
  ),
  /**
   * La transferencia de propiedad, como la contesta la BASE: los cinco
   * identificadores de la operación.
   *
   * Y además ESCRIBE el rol nuevo en `written`, porque el servicio vuelve a
   * leer las dos filas para armar la respuesta: un doble que no escribiera
   * contestaría con un roster que contradice la transferencia que acaba de
   * hacer —el dueño saliente seguiría siendo `owner` en la respuesta de una
   * operación que lo degradó.
   */
  transferOwnership: jest.fn(
    async (
      _businessId: string,
      newOwnerMemberId: string,
      _callerUserId: string,
    ) => {
      written.set(MEMBER_OWNER, { role: 'manager' });
      written.set(newOwnerMemberId, { role: 'owner' });
      return {
        business_id: BIZ,
        previous_owner_member_id: MEMBER_OWNER,
        previous_owner_user_id: OWNER_USER,
        new_owner_member_id: newOwnerMemberId,
        new_owner_user_id: STAFF_USER,
      };
    },
  ),
  /**
   * La RECUPERACIÓN, como la contesta la BASE: los tres identificadores de la
   * operación, y el rol nuevo escrito en `written` —el servicio vuelve a leer
   * la fila para armar la respuesta—.
   */
  assignOwnership: jest.fn(
    async (_businessId: string, memberId: string, _callerUserId: string) => {
      written.set(memberId, { role: 'owner' });
      return {
        business_id: BIZ,
        owner_member_id: memberId,
        owner_user_id: STAFF_USER,
      };
    },
  ),
  /**
   * Los DUEÑOS VIVOS del negocio, que es lo que decide si la plataforma puede
   * crear un acceso en él. El default es UNO, que es el negocio con dueño: la
   * rama de la plataforma sólo se abre en los negocios que se quedaron sin él.
   */
  liveOwnerCount: jest.fn(async (_businessId: string) => 1),
};

export const authAdmin = {
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
 * `mockClear()` sólo borra las llamadas: una implementación puesta por un test
 * seguiría viva en el siguiente, y un `sessionStateAsCaller` que quedó en
 * `session_expired` volvería negativa la mitad de los tests de abajo sin que
 * ninguno lo pidiera. Por eso se guardan y se reponen.
 */
const defaults = new Map<string, (() => unknown) | undefined>(
  [...Object.entries(repository), ...Object.entries(authAdmin)].map(
    ([name, mock]) => [name, mock.getMockImplementation()],
  ),
);

export function resetDoubles(): void {
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
 * The drizzle shape `AuthGuard` reads, and nothing more: a
 * `select().from(profiles).where(…).limit(1)` that answers for the identity just
 * verified.
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

export async function bootstrapStaffHttp(): Promise<INestApplication> {
  const config = {
    get: (key: string) =>
      ({ SUPABASE_URL, SUPABASE_JWT_SECRET: JWT_SECRET })[key],
  } as unknown as ConfigService<Env, true>;

  const moduleRef = await Test.createTestingModule({
    controllers: [StaffController, StaffSessionController, OwnershipController],
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
      // reason: it would be the stub negating, no el guard.
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
  // lugar donde los tee el stdout de producción. Se silencia después del
  // compile, que es cuando el servicio ya existe.
  (moduleRef.get(StaffService) as unknown as { logger: unknown }).logger = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };

  app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

export async function closeStaffHttp(): Promise<void> {
  await app?.close();
  app = undefined;
}

export const staffHttp = () => {
  if (!app) throw new Error('bootstrapStaffHttp() no se llamó');
  return request(app.getHttpServer());
};

/**
 * One authenticated caller.
 *
 * The token is minted once per user because `AuthGuard` caches the profile for
 * 30 s per `sub`, and re-minting would be slower for no gain: the cache key is
 * the identity, which is exactly what these tests vary.
 */
const tokens = new Map<string, Promise<string>>();

/**
 * The `Bearer …` header value for a caller.
 *
 * Separate from {@link as} because a loop over seven write routes needs the same
 * identity on each of them, and re-minting per iteration would make the test
 * about the cache instead of about the guard. It returns the header VALUE, with
 * the prefix, because that's what `.set('Authorization', …)` wants — and
 * prefixing it a second time is how a harness turns every test into a 401.
 */
export function bearerFor(userId: string): Promise<string> {
  let pending = tokens.get(userId);
  if (!pending) {
    pending = tokenFor(userId);
    tokens.set(userId, pending);
  }
  return pending.then((token) => `Bearer ${token}`);
}

export function as(userId: string) {
  return bearerFor(userId).then((auth) => {
    const header = { Authorization: auth };
    return {
      get: (url: string) => staffHttp().get(url).set(header),
      post: (url: string) => staffHttp().post(url).set(header),
      patch: (url: string) => staffHttp().patch(url).set(header),
      delete: (url: string) => staffHttp().delete(url).set(header),
    };
  });
}
