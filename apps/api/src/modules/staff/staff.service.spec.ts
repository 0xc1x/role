import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as nodeCrypto from 'node:crypto';
import {
  BusinessMemberDeliveryCardSchema,
  BusinessMemberSchema,
  StaffSessionStateSchema,
  type CreateBusinessMemberDto,
  type StaffSessionState,
  type UpdateBusinessMemberAliasResponseDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { DRIZZLE } from '../../database/database.tokens';
import { StaffRepository, type BusinessMemberRow } from './staff.repository';
import { StaffService } from './staff.service';
import { STAFF_AUTH_ADMIN, type StaffAuthAdmin } from './staff.tokens';

const BIZ = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER_BIZ = '3b1c9d20-1f4e-4a6b-9c11-77aa11bb22cc';

const LOC_A = '11111111-1111-4111-8111-111111111111';
const LOC_B = '22222222-2222-4222-8222-222222222222';
const LOC_C = '33333333-3333-4333-8333-333333333333';

/**
 * Ids are UUID-shaped because the contract says so: `BusinessMemberSchema` types
 * `id`, `business_id` and `user_id` as `UuidSchema`, and a fixture with
 * `user_id: 'staff-user'` would be testing a row the database cannot hold.
 */
const OWNER_USER = '00000000-0000-4000-8000-000000000001';
const MANAGER_USER = '00000000-0000-4000-8000-000000000002';
const STAFF_USER = '00000000-0000-4000-8000-000000000003';
const OUTSIDE_USER = '00000000-0000-4000-8000-000000000004';
const NEW_AUTH_USER = '00000000-0000-4000-8000-0000000000ff';
const MEMBER_STAFF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_MANAGER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_OUTSIDE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MEMBER_OWNER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const owner: AuthUser = { id: OWNER_USER, role: 'business', email: null };
const managerAB: AuthUser = {
  id: MANAGER_USER,
  role: 'business',
  email: null,
};
const admin: AuthUser = { id: 'admin-1', role: 'admin', email: null };
const stranger: AuthUser = {
  id: 'stranger',
  role: 'business',
  email: null,
};

const HOUR = 3_600_000;

/**
 * The clock the fixtures hang off — and it is the REAL one, deliberately.
 *
 * `requireActor` enforces the §5.2 session promise against `new Date()`, so a
 * fixture pinned to a calendar date is a session that expires: it was written
 * with `NOW = 2026-10-16T12:00Z` and a 24 h TTL, and the moment the wall clock
 * passed `2026-10-17T11:00Z` four containment tests started failing with
 * «Tu sesión venció» — the production code right, the fixture wrong, and nothing
 * in the failure pointing at the fixture. A date is readable, and readable is
 * what makes it dangerous here.
 */
const NOW = new Date();

/**
 * Rows with the session already inside the §5.2 promise.
 *
 * `session_ttl_hours: 0` for the owner is not laziness, it is what
 * `20261016022631_owner_memberships_no_session_expiry` left in production: an
 * owner row with a TTL and no stamp is a session that expired by definition, so
 * the 16 real owners would be denied everything.
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
    last_authenticated_at: new Date(NOW.getTime() - HOUR),
    created_at: new Date('2026-10-01T00:00:00.000Z'),
    updated_at: new Date('2026-10-01T00:00:00.000Z'),
    deleted_at: null,
    ...overrides,
  };
}

const ownerRow = () =>
  memberRow({
    id: MEMBER_OWNER,
    user_id: OWNER_USER,
    role: 'owner',
    alias: 'dueno@panaderia.role.ec',
    session_ttl_hours: 0,
    last_authenticated_at: null,
  });

const managerRow = (locationIds: string[]) =>
  memberRow({
    id: MEMBER_MANAGER,
    user_id: MANAGER_USER,
    role: 'manager',
    label: 'Karla',
    alias: 'karla@panaderia.role.ec',
    session_ttl_hours: 24,
  });

/**
 * What `business_member_session_state` answers when the session is inside the
 * §5.2 promise.
 *
 * ─── POR QUÉ EL DOBLE NO CALCULA NADA ──────────────────────────────────────────
 *
 * El doble *es* la base de datos para estos tests, así que si calculara
 * `sello + ttl` estaría SCIP REIMPLEMENTANDO en el test justo la cuenta que
 * este arreglo quitó del servicio: los dos pasarían juntos aunque los dos
 * estuvieran mal. Por eso devuelve un literal, y los tests de la costura le
 * pasan una fecha que ninguna aritmética de TTL puede producir —una que el
 * servicio tendría que inventar para coincidir.
 */
function sessionState(
  overrides: Partial<StaffSessionState> = {},
): StaffSessionState {
  return StaffSessionStateSchema.parse({
    role: 'manager',
    location_ids: [],
    expires_at: null,
    reason: 'ok',
    business_ids: [BIZ],
    ...overrides,
  });
}

/** A `23505` / `R0001` / `R0002` as postgres-js hands it over. */
function pgError(
  code: string,
  extra: { constraint_name?: string; message?: string; detail?: string } = {},
): Error {
  return Object.assign(new Error(extra.message ?? code), { code, ...extra });
}

describe('StaffService', () => {
  let service: StaffService;
  let repository: Record<string, ReturnType<typeof jest.fn>>;
  let authAdmin: {
    createUser: ReturnType<typeof jest.fn>;
    deleteUser: ReturnType<typeof jest.fn>;
    updateUserById: ReturnType<typeof jest.fn>;
  };
  let logs: unknown[];

  /**
   * The PIN is the only secret this module produces, so the log collector is not
   * a nicety: the §8 promise is that it is never in a list, never in a PATCH and
   * never in a log line, and the third of those can only be asserted by reading
   * the lines.
   */
  const captureLogs = (): unknown[] => {
    const entries: unknown[] = [];
    (service as unknown as { logger: unknown }).logger = {
      log: (entry: unknown) => entries.push(entry),
      warn: (entry: unknown) => entries.push(entry),
      error: (entry: unknown) => entries.push(entry),
      debug: (entry: unknown) => entries.push(entry),
    };
    return entries;
  };

  beforeEach(async () => {
    repository = {
      transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
      findBusiness: jest.fn(async () => ({
        id: BIZ,
        slug: 'panaderia-familia',
      })),
      findMemberByUser: jest.fn(async () => ownerRow()),
      findMemberById: jest.fn(async () => memberRow()),
      listMembersWithScope: jest.fn(async () => []),
      locationIdsOfMember: jest.fn(async () => []),
      findLocationIdsInBusiness: jest.fn(
        async (_b: string, ids: string[]) => ids,
      ),
      insertMember: jest.fn(async (_tx: unknown, values: unknown) => ({
        ...memberRow(),
        ...(values as object),
      })),
      setScope: jest.fn(async () => {}),
      updateMember: jest.fn(
        async (
          _b: string,
          memberId: string,
          values: Record<string, unknown>,
        ) => ({
          ...memberRow({ id: memberId }),
          ...values,
        }),
      ),
      softDeleteMember: jest.fn(async (_tx: unknown, _b: string, id: string) =>
        memberRow({ id, deleted_at: new Date() }),
      ),
      stampSession: jest.fn(async (_b: string, _u: string, at: Date) =>
        memberRow({ last_authenticated_at: at }),
      ),
      sessionStateAsCaller: jest.fn(async () => sessionState()),
    };

    authAdmin = {
      createUser: jest.fn(async () => ({
        data: { user: { id: NEW_AUTH_USER } },
        error: null,
      })),
      deleteUser: jest.fn(async () => ({ error: null })),
      updateUserById: jest.fn(async () => ({ error: null })),
    };

    const module = await Test.createTestingModule({
      providers: [
        StaffService,
        { provide: StaffRepository, useValue: repository },
        {
          provide: STAFF_AUTH_ADMIN,
          useValue: { auth: { admin: authAdmin } } as StaffAuthAdmin,
        },
        // El `ConfigService` NO está: leer credenciales es de la factory de
        // `staff.module.ts`, y el servicio recibe la superficie de Auth ya
        // resuelta. Dejarlo aquí sugeriría que el servicio lee configuración, que
        // es lo contrario de lo que hace `staff.tokens.ts` a propósito.
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    service = module.get(StaffService);
    logs = captureLogs();
  });

  // ───────────────────────── la regla que se rompe ────────────────────────

  describe('la contención del manager es un SUBCONJUNTO, no una intersección', () => {
    /**
     * The fixture that decides the rule.
     *
     * `managerAB` manages A and B. `MEMBER_STAFF` is scoped to A. `MEMBER_OUTSIDE`
     * is scoped to A AND C — and C is outside the manager's reach. An
     * intersection reading (`some`) admits it because A is shared; a subset
     * reading refuses it. Everything below hangs off that one difference, which
     * is why this test exists in the shape it exists: a fixture where both
     * readings AGREE would pass with the rule written backwards.
     */
    beforeEach(() => {
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A, LOC_B]));
      repository.locationIdsOfMember.mockImplementation(
        async (id: string) =>
          ({
            [MEMBER_MANAGER]: [LOC_A, LOC_B],
            [MEMBER_STAFF]: [LOC_A],
            [MEMBER_OUTSIDE]: [LOC_A, LOC_C],
            [MEMBER_OWNER]: [],
          })[id] ?? [],
      );
      repository.findMemberById.mockImplementation(
        async (_b: string, id: string) =>
          id === MEMBER_OUTSIDE
            ? memberRow({
                id: MEMBER_OUTSIDE,
                user_id: OUTSIDE_USER,
                label: 'Nadia',
                alias: 'nadia@panaderia.role.ec',
              })
            : id === MEMBER_OWNER
              ? ownerRow()
              : id === MEMBER_MANAGER
                ? managerRow([LOC_A, LOC_B])
                : memberRow({ id }),
      );
      repository.listMembersWithScope.mockResolvedValue([
        { row: memberRow({ id: MEMBER_STAFF }), locationIds: [LOC_A] },
        {
          row: memberRow({
            id: MEMBER_OUTSIDE,
            user_id: OUTSIDE_USER,
            label: 'Nadia',
          }),
          locationIds: [LOC_A, LOC_C],
        },
        { row: managerRow([LOC_A, LOC_B]), locationIds: [LOC_A, LOC_B] },
        { row: ownerRow(), locationIds: [] },
      ]);
    });

    it('el acceso de {A, C} NO está en la lista de un gerente de {A, B}', async () => {
      const members = await service.list(managerAB, BIZ);

      expect(members.map((m) => m.id)).toEqual([MEMBER_STAFF, MEMBER_MANAGER]);
      expect(members.map((m) => m.alias)).not.toContain(
        'nadia@panaderia.role.ec',
      );
    });

    it('y tampoco lo puede editar, ni para reducirle el alcance', async () => {
      // Reducir {A, C} a {A} sería «arreglarlo». No: el acceso sigue escribiendo
      // en C, y C está fuera del alcance del gerente. La contención se mira
      // ANTES de la escritura, no sobre el alcance que la escritura deja.
      await expect(
        service.update(managerAB, BIZ, MEMBER_OUTSIDE, {
          business_location_ids: [LOC_A],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.setScope).not.toHaveBeenCalled();
      expect(repository.updateMember).not.toHaveBeenCalled();
    });

    it('un empleado sin sucursales está contenido: no alcanza ninguna', async () => {
      // El conjunto vacío es subconjunto de todo, y es lo correcto: un acceso sin
      // sucursales no toca nada (§5.1), así que no hay por dónde ampliarlo.
      repository.locationIdsOfMember.mockImplementation(async (id: string) =>
        id === MEMBER_MANAGER ? [LOC_A, LOC_B] : id === MEMBER_STAFF ? [] : [],
      );
      repository.findMemberById.mockResolvedValue(
        memberRow({ id: MEMBER_STAFF }),
      );

      await service.update(managerAB, BIZ, MEMBER_STAFF, {
        session_ttl_hours: 12,
      });

      expect(repository.updateMember).toHaveBeenCalledWith(
        BIZ,
        MEMBER_STAFF,
        { session_ttl_hours: 12 },
        // La cuarta es el executor de la transacción: el PATCH del rol y el del
        // alcance tienen que commitear juntos.
        expect.anything(),
      );
    });

    it('un gerente no ve al dueño en la lista, ni aunque su alcance esté vacío', async () => {
      const members = await service.list(managerAB, BIZ);

      // El dueño no tiene filas de alcance, así que «contenido» lo admitiría por
      // el vacío. La exclusión es la frase del §8 —un gerente nunca administra
      // al dueño— y vive en el MISMO predicado que la lista y las escrituras,
      // porque son la misma regla leída de dos maneras.
      expect(members.map((m) => m.role)).not.toContain('owner');
    });

    it('no puede ampliar el alcance de un acceso contenido hasta una sucursal suya', async () => {
      await expect(
        service.update(managerAB, BIZ, MEMBER_STAFF, {
          business_location_ids: [LOC_A, LOC_C],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.setScope).not.toHaveBeenCalled();
    });

    it('sí puede mover un acceso contenido dentro de su propio alcance', async () => {
      await service.update(managerAB, BIZ, MEMBER_STAFF, {
        business_location_ids: [LOC_B],
        role: 'manager',
      });

      expect(repository.setScope).toHaveBeenCalledWith(
        expect.anything(),
        MEMBER_STAFF,
        [LOC_B],
      );
      expect(repository.updateMember).toHaveBeenCalledWith(
        BIZ,
        MEMBER_STAFF,
        { role: 'manager' },
        expect.anything(),
      );
    });

    it('no puede dar de alta a alguien con una sucursal que no gestiona', async () => {
      await expect(
        service.create(managerAB, BIZ, {
          label: 'Nadia',
          business_location_ids: [LOC_A, LOC_C],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(authAdmin.createUser).not.toHaveBeenCalled();
    });

    it('el dueño no está contenido por nada: ve y toca el negocio entero', async () => {
      repository.findMemberByUser.mockResolvedValue(ownerRow());
      repository.locationIdsOfMember.mockResolvedValue([]);
      repository.findMemberById.mockResolvedValue(
        memberRow({ id: MEMBER_OUTSIDE, user_id: OUTSIDE_USER }),
      );

      const members = await service.list(owner, BIZ);

      expect(members.map((m) => m.id)).toEqual([
        MEMBER_STAFF,
        MEMBER_OUTSIDE,
        MEMBER_MANAGER,
        MEMBER_OWNER,
      ]);
      await service.update(owner, BIZ, MEMBER_OUTSIDE, {
        business_location_ids: [LOC_C],
      });
      expect(repository.setScope).toHaveBeenCalledWith(
        expect.anything(),
        MEMBER_OUTSIDE,
        [LOC_C],
      );
    });

    it('dar de baja es del dueño: un gerente que lo intenta recibe 403 y no borra nada', async () => {
      await expect(
        service.remove(managerAB, BIZ, MEMBER_STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.softDeleteMember).not.toHaveBeenCalled();
      expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    });

    /**
     * LA MEDIDA, no el agujero: un gerente puede cortar su propio acceso.
     *
     * §8 no lo nombra y el predicado lo admite —su alcance lo contiene—, así que
     * esto es una decisión y necesita test tanto como el otro lado. El argumento
     * es que un dueño no puede ser desactivado por NADIE (`R0002`), o sea que
     * «uno siempre puede cortar lo suyo» ya es la regla del rol más privilegiado;
     * y un gerente que no puede irse de un negocio queda atrapado en él, que es un
     * fallo peor que el que el auto-ban podría causar. Está escrito en
     * `disableAccess` y en la decisión 4 del ADR-0013.
     */
    it('un gerente puede pausarse a sí mismo, y es a propósito', async () => {
      // El DTO que vuelve es la relectura de la fila YA escrita, así que el
      // doble tiene que servir la fila nueva en la segunda lectura.
      repository.findMemberById.mockResolvedValue({
        ...managerRow([LOC_A, LOC_B]),
        status: 'disabled',
      });
      repository.updateMember.mockResolvedValue({
        ...managerRow([LOC_A, LOC_B]),
        status: 'disabled',
      });

      const member = await service.disableAccess(
        managerAB,
        BIZ,
        MEMBER_MANAGER,
      );

      expect(repository.updateMember).toHaveBeenCalledWith(
        BIZ,
        MEMBER_MANAGER,
        {
          status: 'disabled',
        },
      );
      // El ban también: pausarse es cortar acceso y no sólo dejar de administer.
      expect(authAdmin.updateUserById).toHaveBeenCalledWith(MANAGER_USER, {
        ban_duration: '876000h',
      });
      expect(member.status).toBe('disabled');
    });

    it('pero NO puede pausar a otro gerente que esté fuera de su alcance', async () => {
      // La contraparte que hace que lo de arriba sea una medida y no una puerta.
      // Mismo rol, mismas dos sucursales compartidas, y una tercera que el que
      // llama no gestiona: la diferencia entre las dos mitades es `C`, no el rol.
      const otroGerente = memberRow({
        id: MEMBER_OUTSIDE,
        user_id: OUTSIDE_USER,
        role: 'manager',
        label: 'Nadia',
      });
      repository.findMemberById.mockResolvedValue(otroGerente);
      repository.locationIdsOfMember.mockImplementation(async (id: string) =>
        id === MEMBER_OUTSIDE ? [LOC_B, LOC_C] : [],
      );

      await expect(
        service.disableAccess(managerAB, BIZ, MEMBER_OUTSIDE),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.updateMember).not.toHaveBeenCalled();
      expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────── el PIN ─────────────────────────────────

  describe('el PIN se genera server-side, es de seis dígitos y se entrega una vez', () => {
    it('el PIN es un string de seis dígitos que el schema de la tarjeta acepta', async () => {
      const card = await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [],
      });

      expect(card.pin).toMatch(/^\d{6}$/);
      expect(BusinessMemberDeliveryCardSchema.parse(card)).toEqual(card);
      expect(authAdmin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ password: card.pin }),
      );
    });

    it('un cero a la izquierda sobrevive: 018902 tiene que poder representarse', async () => {
      // `randomInt` devuelve un entero, no un texto con ceros. Sin `padStart`, el
      // PIN `018902` saldría como `18902` y la persona recibiría un identificador
      // de cinco dígitos que además existe.
      const spy = jest
        .spyOn(nodeCrypto, 'randomInt')
        .mockReturnValue(18902 as never);
      try {
        const card = await service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [],
        });

        expect(card.pin).toBe('018902');
        expect(authAdmin.createUser).toHaveBeenCalledWith(
          expect.objectContaining({ password: '018902' }),
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('el rango es el de seis dígitos, no el de cinco', async () => {
      const spy = jest
        .spyOn(nodeCrypto, 'randomInt')
        .mockImplementation((min: number, max: number) => {
          expect(min).toBe(0);
          expect(max).toBe(1_000_000);
          return 999_999;
        });
      try {
        const card = await service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [],
        });
        expect(card.pin).toBe('999999');
      } finally {
        spy.mockRestore();
      }
    });

    it('ni la lista, ni un PATCH, ni una pausa, ni un alta de alias devuelven el PIN', async () => {
      const card = await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [LOC_A],
      });
      repository.listMembersWithScope.mockResolvedValue([
        { row: memberRow(), locationIds: [LOC_A] },
      ]);

      const results = [
        await service.list(owner, BIZ),
        await service.update(owner, BIZ, MEMBER_STAFF, {
          session_ttl_hours: 8,
        }),
        await service.disableAccess(owner, BIZ, MEMBER_STAFF),
        await service.enableAccess(owner, BIZ, MEMBER_STAFF),
        (await service.updateAlias(owner, BIZ, MEMBER_STAFF, {
          alias: 'carla@otra-panaderia.ec',
        })) satisfies UpdateBusinessMemberAliasResponseDto,
      ];

      for (const result of results) {
        expect(JSON.stringify(result)).not.toContain(card.pin);
        expect('pin' in (result as object)).toBe(false);
      }
    });

    it('ni una sola línea de log lleva el PIN', async () => {
      const card = await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [LOC_A],
      });
      await service.rotatePin(owner, BIZ, MEMBER_STAFF);

      expect(logs.length).toBeGreaterThan(0);
      for (const line of logs) {
        expect(JSON.stringify(line)).not.toContain(card.pin);
        expect(JSON.stringify(line)).not.toContain('carla@panaderia.role.ec');
      }
    });

    it('el PIN no está en ninguna columna: la tarjeta es el único lugar donde existe', async () => {
      await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [LOC_A],
      });

      const insert = repository.insertMember.mock.calls[0][1];
      expect(Object.keys(insert)).not.toContain('pin');
      expect(Object.keys(insert)).not.toContain('password');
    });
  });

  // ─────────────────────────────── compensación ───────────────────────────

  describe('el alta es una operación compensada', () => {
    it('si la membresía falla, se borra el auth.users que este request creó', async () => {
      repository.insertMember.mockRejectedValue(
        pgError('23505', { constraint_name: 'business_members_alias_key' }),
      );

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          alias: 'carla@panaderia.role.ec',
          business_location_ids: [],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(authAdmin.deleteUser).toHaveBeenCalledWith(NEW_AUTH_USER);
    });

    it('también cuando falla la escritura del alcance, no sólo la de la membresía', async () => {
      repository.setScope.mockRejectedValue(
        pgError('23505', { constraint_name: 'business_members_alias_key' }),
      );

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [LOC_A],
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      // El alcance va en la MISMA transacción que la membresía, así que el rollback
      // ya no dejó filas: lo que queda vivo es la cuenta. Sin este catch —el
      // `try` cubre las dos escrituras y no sólo la primera— el `auth.users`
      // quedaría huérfano detrás de un acceso que nadie puede ver.
      expect(authAdmin.deleteUser).toHaveBeenCalledWith(NEW_AUTH_USER);
    });

    it('si la compensación falla, el error original sigue siendo el que sale', async () => {
      repository.insertMember.mockRejectedValue(
        pgError('R0001', { message: 'el plan free admite hasta 2 miembros' }),
      );
      authAdmin.deleteUser.mockResolvedValue({ error: { message: 'boom' } });

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // Y la huérfana queda registrada con el id que support necesita.
      expect(JSON.stringify(logs)).toContain(
        'staff_access_compensation_failed',
      );
      expect(JSON.stringify(logs)).toContain(NEW_AUTH_USER);
    });

    it('una baja compensada NO borra el auth.users: no se creó en esta request', async () => {
      repository.updateMember.mockRejectedValue(
        pgError('23505', { constraint_name: 'business_members_alias_key' }),
      );

      await expect(
        service.updateAlias(owner, BIZ, MEMBER_STAFF, {
          alias: 'carla@otra.role.ec',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(authAdmin.deleteUser).not.toHaveBeenCalled();
      expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────── traducción de errores ────────────────────

  describe('los códigos de la base se traducen a algo que un dueño pueda leer', () => {
    it('23505 sobre business_members_alias_key es 409 y dice qué hacer', async () => {
      repository.insertMember.mockRejectedValue(
        pgError('23505', { constraint_name: 'business_members_alias_key' }),
      );

      const error = await service
        .create(owner, BIZ, { label: 'Carla', business_location_ids: [] })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toContain(
        'Ese alias ya está en uso',
      );
      expect((error as ConflictException).message).not.toContain('23505');
    });

    it('23505 sobre el alias de GoTrue también es 409, sin filtrar su prosa', async () => {
      authAdmin.createUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered' },
      });

      const error = await service
        .create(owner, BIZ, { label: 'Carla', business_location_ids: [] })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).toBe(
        'Ese alias ya está en uso.',
      );
      expect((error as ConflictException).message).not.toContain('registered');
    });

    it('R0001 nombra el plan y el tope, y los números salen del detail del trigger', async () => {
      repository.insertMember.mockRejectedValue(
        pgError('R0001', {
          message: 'el plan free admite hasta 2 miembros, no más',
          detail: `business=${BIZ} plan=free limit=2 current=3`,
        }),
      );

      const error = await service
        .create(owner, BIZ, { label: 'Carla', business_location_ids: [] })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const message = (error as UnprocessableEntityException).message;
      expect(message).toContain('el plan free admite hasta 2 miembros, no más');
      expect(message).toContain('plan free: admite hasta 2');
      expect(message).toContain('serían 3');
    });

    it('R0002 es el dueño intocable y NO es un problema de plan', async () => {
      repository.updateMember.mockRejectedValue(
        pgError('R0002', {
          message:
            'el dueño del negocio no se puede desactivar; degradalo a manager primero',
        }),
      );

      const error = await service
        .disableAccess(owner, BIZ, MEMBER_OWNER)
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const message = (error as UnprocessableEntityException).message;
      expect(message).toContain('degradalo a manager primero');
      expect(message).not.toContain('plan');
    });

    it('un R0002 al dar de baja NO banea a nadie: la fila sigue viva', async () => {
      repository.softDeleteMember.mockRejectedValue(
        pgError('R0002', {
          message:
            'el dueño del negocio no se puede dar de baja; degradalo primero',
        }),
      );
      repository.findMemberById.mockResolvedValue(ownerRow());

      await expect(
        service.remove(owner, BIZ, MEMBER_OWNER),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    });

    it('23505 de un segundo dueño es 422, no 409: no es una colisión, es un invariante', async () => {
      repository.insertMember.mockRejectedValue(
        pgError('23505', {
          constraint_name: 'business_members_one_owner_per_business',
        }),
      );

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('un código que no se conoce sube tal cual, para que un 500 lo investigate alguien', async () => {
      const boom = pgError('XX000', { message: 'internal' });
      repository.insertMember.mockRejectedValue(boom);

      const error = await service
        .create(owner, BIZ, { label: 'Carla', business_location_ids: [] })
        .catch((err: unknown) => err);

      expect(error).toBe(boom);
    });
  });

  // ──────────────────────────── rotar ≠ desactivar ─────────────────────────

  describe('rotar el PIN no es desactivar el acceso', () => {
    it('rotar cambia la contraseña y NO toca el ban ni el estado', async () => {
      await service.rotatePin(owner, BIZ, MEMBER_STAFF);

      expect(authAdmin.updateUserById).toHaveBeenCalledTimes(1);
      const [userId, attributes] = authAdmin.updateUserById.mock.calls[0];
      expect(userId).toBe(STAFF_USER);
      expect(attributes.ban_duration).toBeUndefined();
      expect(attributes.password).toMatch(/^\d{6}$/);
      expect(repository.updateMember).not.toHaveBeenCalled();
    });

    it('desactivar sí manda el ban de §8, y sólo él lo manda', async () => {
      await service.disableAccess(owner, BIZ, MEMBER_STAFF);

      expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
        status: 'disabled',
      });
      expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
        ban_duration: '876000h',
      });
    });

    it('reactivar levanta el ban con la forma que GoTrue entiende', async () => {
      await service.enableAccess(owner, BIZ, MEMBER_STAFF);

      expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
        status: 'active',
      });
      expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
        ban_duration: 'none',
      });
    });

    it('si el ban falla, la fila queda pausada y la request falla igual', async () => {
      authAdmin.updateUserById.mockResolvedValue({
        error: { message: 'auth unavailable' },
      });

      await expect(
        service.disableAccess(owner, BIZ, MEMBER_STAFF),
      ).rejects.toThrow(/no se pudieron cerrar las sesiones/);
      // La fila YA está pausada (RLS no concede nada), así que el reintento es el
      // arreglo y es idempotente. Decir «listo» con la tablet abierta sería peor.
      expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
        status: 'disabled',
      });
    });

    it('el PIN rotado llega en una tarjeta nueva, con el MISMO alias', async () => {
      const card = await service.rotatePin(owner, BIZ, MEMBER_STAFF);

      expect(card.alias).toBe(memberRow().alias);
      expect(card.pin).toMatch(/^\d{6}$/);
      expect(card.alias_warnings).toEqual([]);
    });
  });

  // ─────────────────────────────── dar de baja ────────────────────────────

  describe('dar de baja es lógico, y el alias no vuelve a la bolsa', () => {
    it('marca deleted_at en la membresía y en sus filas de alcance, y banea', async () => {
      await service.remove(owner, BIZ, MEMBER_STAFF);

      // `setScope(tx, id, [])` es el borrado lógico del alcance: sin esto la
      // fila de alcance queda viva y `can_manage_location` la seguiría leyendo.
      expect(repository.setScope).toHaveBeenCalledWith(
        expect.anything(),
        MEMBER_STAFF,
        [],
      );
      expect(repository.softDeleteMember).toHaveBeenCalledWith(
        expect.anything(),
        BIZ,
        MEMBER_STAFF,
      );
      expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
        ban_duration: '876000h',
      });
    });

    it('no borra físicamente nada: no hay DELETE en ninguna de las dos tablas', async () => {
      await service.remove(owner, BIZ, MEMBER_STAFF);

      expect(repository.softDeleteMember).toHaveBeenCalled();
      expect(authAdmin.deleteUser).not.toHaveBeenCalled();
    });

    it('el borrado físico de auth.users queda para una operación que no existe', async () => {
      const methods = Object.getOwnPropertyNames(StaffService.prototype);

      expect(methods).not.toContain('purge');
      expect(methods).not.toContain('hardDelete');
    });
  });

  // ───────────────────────────── editar el alias ──────────────────────────

  describe('editar el alias son dos columnas en dos sistemas', () => {
    it('actualiza business_members.alias y auth.users.email, y avisa del dominio real', async () => {
      // La respuesta se arma con una LECTURA nueva de la membresía (una consulta
      // más, para no devolver una fila que el service ya tenía en memoria), así
      // que el fixture trae el alias nuevo: lo que se assertea aquí son las dos
      // escrituras y el aviso.
      repository.findMemberById.mockImplementation(async () =>
        memberRow({ alias: 'carla.centro@panaderialafamilia.ec' }),
      );

      const response = await service.updateAlias(owner, BIZ, MEMBER_STAFF, {
        alias: 'carla.centro@panaderialafamilia.ec',
      });

      expect(repository.updateMember).toHaveBeenCalledWith(BIZ, MEMBER_STAFF, {
        alias: 'carla.centro@panaderialafamilia.ec',
      });
      expect(authAdmin.updateUserById).toHaveBeenCalledWith(STAFF_USER, {
        email: 'carla.centro@panaderialafamilia.ec',
        email_confirm: true,
      });
      expect(response.alias_warnings).toEqual([
        'alias_domain_can_receive_mail',
      ]);
      expect(response.member.alias).toBe('carla.centro@panaderialafamilia.ec');
    });

    it('un alias de role.ec no lleva aviso: ese correo no llega a ninguna bandeja', async () => {
      const response = await service.updateAlias(owner, BIZ, MEMBER_STAFF, {
        alias: 'carla.centro@panaderia.role.ec',
      });

      expect(response.alias_warnings).toEqual([]);
    });

    it('el PIN NO cambia al cambiar el alias: son dos hechos independientes', async () => {
      await service.updateAlias(owner, BIZ, MEMBER_STAFF, {
        alias: 'carla.nueva@panaderia.role.ec',
      });

      const [, attributes] = authAdmin.updateUserById.mock.calls[0];
      expect(attributes.password).toBeUndefined();
    });

    it('si GoTrue rechaza el correo, el alias de la membresía vuelve al anterior', async () => {
      authAdmin.updateUserById.mockResolvedValue({
        error: {
          message: 'A user with this email address has already been registered',
        },
      });

      await expect(
        service.updateAlias(owner, BIZ, MEMBER_STAFF, {
          alias: 'carla@otra.role.ec',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.updateMember).toHaveBeenLastCalledWith(
        BIZ,
        MEMBER_STAFF,
        {
          alias: memberRow().alias,
        },
      );
    });

    it('un alias que no es correo es un 400, no un 500 de GoTrue', async () => {
      await expect(
        service.updateAlias(owner, BIZ, MEMBER_STAFF, {
          alias: 'carla' as never,
        }),
      ).rejects.toThrow(/correo válido/);
      expect(authAdmin.updateUserById).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────── el alta ──────────────────────────────

  describe('el alta crea gerentes y empleados, nunca dueños', () => {
    it('role: owner es un 422 con la razón, y no se crea ninguna cuenta', async () => {
      const error = await service
        .create(owner, BIZ, {
          label: 'Co-dueña',
          role: 'owner',
          business_location_ids: [],
        })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).message).toContain(
        'El dueño es quien creó el negocio',
      );
      expect(authAdmin.createUser).not.toHaveBeenCalled();
    });

    it('promover a dueño por el PATCH también es un 422', async () => {
      await expect(
        service.update(owner, BIZ, MEMBER_STAFF, { role: 'owner' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repository.updateMember).not.toHaveBeenCalled();
    });

    it('sin role, la columna decide: es un empleado', async () => {
      await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [],
      });

      const insert = repository.insertMember.mock.calls[0][1];
      expect(insert.role).toBe('staff');
      expect(insert.session_ttl_hours).toBeUndefined();
    });

    it('el alias propuesto cuelga del slug y del nombre, bajo role.ec', async () => {
      const card = await service.create(owner, BIZ, {
        label: 'Karla Pérez',
        business_location_ids: [],
      });

      expect(card.alias).toBe('karla-perez@panaderia-familia.role.ec');
      expect(card.alias_warnings).toEqual([]);
    });

    it('el alias que escribe el dueño se respeta tal cual, sin normalizar', async () => {
      const card = await service.create(owner, BIZ, {
        label: 'Karla',
        alias: 'Karla.Centro@Panaderia.EC',
        business_location_ids: [],
      });

      expect(card.alias).toBe('Karla.Centro@Panaderia.EC');
      // Y avisa, porque `Panaderia.EC` no es un dominio de Rolé.
      expect(card.alias_warnings).toEqual(['alias_domain_can_receive_mail']);
    });

    it('una sucursal de otro negocio es 422 sobre el pedido, no 403 sobre quien llama', async () => {
      repository.findLocationIdsInBusiness.mockResolvedValue([LOC_A]);

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [LOC_A, LOC_C],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('un negocio que no existe es un 404 y no una membresía en la nada', async () => {
      repository.findBusiness.mockResolvedValue(null);

      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          business_location_ids: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authAdmin.createUser).not.toHaveBeenCalled();
    });

    it('la sesión sin expiración es de dueños y gerentes, no de empleados (§9.2)', async () => {
      await expect(
        service.create(owner, BIZ, {
          label: 'Carla',
          session_ttl_hours: 0,
          business_location_ids: [],
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // El mismo 0 sí vale para un gerente: es lo que necesita la tablet del
      // negocio, y la regla es del par (rol, ttl), no del ttl solo.
      await service.create(owner, BIZ, {
        label: 'Karla',
        role: 'manager',
        session_ttl_hours: 0,
        business_location_ids: [],
      });
      expect(repository.insertMember).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ session_ttl_hours: 0, role: 'manager' }),
      );
    });

    it('y el PATCH tampoco: el rol que decide es el de la fila, no el del cuerpo', async () => {
      // El caso de la FILA, no el del request: `update` no recibe `role`, así que
      // la regla se evalúa con `body.role ?? member.role`. Leyendo sólo el cuerpo,
      // un empleado podría recibir el `0` sin que nadie lo mirara — y nadie lo
      // vería hasta que quedara con la tablet abierta para siempre.
      repository.findMemberById.mockResolvedValue(memberRow({ role: 'staff' }));

      await expect(
        service.update(owner, BIZ, MEMBER_STAFF, { session_ttl_hours: 0 }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(repository.updateMember).not.toHaveBeenCalled();
    });

    it('la cuenta nace como perfil de negocio, que es lo que exige el trigger', async () => {
      await service.create(owner, BIZ, {
        label: 'Carla',
        business_location_ids: [],
      });

      expect(authAdmin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email_confirm: true,
          user_metadata: { role: 'business' },
        }),
      );
    });

    it('el cuerpo se valida con el schema de commons, no con un copia del formato', () => {
      // El tipo del cuerpo YA es el DTO inferido del schema; lo que se asserta
      // aquí es que el servicio no re-declara el vocabulario: no hay una lista
      // local de roles admitidos en el archivo.
      const body: CreateBusinessMemberDto = {
        label: 'Carla',
        business_location_ids: [],
      };
      expect(body.role).toBeUndefined();
    });
  });

  // ──────────────────────────────── la puerta ─────────────────────────────

  describe('la puerta pregunta rol, estado y sesión, en la sesión del servicio', () => {
    it('un empleado no administra los accesos', async () => {
      repository.findMemberByUser.mockResolvedValue(
        memberRow({ user_id: MANAGER_USER, role: 'staff' }),
      );

      await expect(service.list(managerAB, BIZ)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.create(owner, BIZ, { label: 'x', business_location_ids: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un acceso pausado no administra nada, ni siquiera su propia lista', async () => {
      repository.findMemberByUser.mockResolvedValue({
        ...ownerRow(),
        status: 'disabled',
      });

      await expect(service.list(owner, BIZ)).rejects.toThrow(/pausado/);
    });

    it('una sesión vencida no administra: es la misma promesa que RLS hace', async () => {
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A]));
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({ reason: 'session_expired' }),
      );

      await expect(service.list(managerAB, BIZ)).rejects.toThrow(/venció/);
    });

    it('una sesión con TTL y sin sello tampoco administra', async () => {
      // `can_manage_location` devuelve false para esto, y esta API escribe con
      // `service_role`: si el servicio lo ignorara, la promesa del §5.2 sería
      // cierta en el panel y falsa acá.
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A]));
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({ reason: 'session_never_stamped' }),
      );

      await expect(service.list(managerAB, BIZ)).rejects.toThrow(/venció/);
    });

    it('la fila en memoria NO puede contradecir a la base: la palabra es la de la función', async () => {
      // La fila dice «vencida» —48 h atrás con un TTL de 24— y la función dice
      // `ok`. Gana la función, porque es la misma que aplica `can_manage_location`
      // y la que el panel ve. Un test que decidiera al revés —«se permite porque
      // la fila parece viva»— estaría fijando la cuarta copia de la aritmética
      // que este arreglo quitó.
      repository.findMemberByUser.mockResolvedValue({
        ...managerRow([LOC_A]),
        session_ttl_hours: 24,
        last_authenticated_at: new Date(NOW.getTime() - 48 * HOUR),
      });
      repository.locationIdsOfMember.mockResolvedValue([LOC_A]);
      repository.sessionStateAsCaller.mockResolvedValue(sessionState());
      repository.listMembersWithScope.mockResolvedValue([
        { row: memberRow({ id: MEMBER_STAFF }), locationIds: [LOC_A] },
      ]);

      const members = await service.list(managerAB, BIZ);

      expect(members.map((m) => m.id)).toEqual([MEMBER_STAFF]);
    });

    it('una razón que esta API no conoce también cierra la puerta, y queda en el log', async () => {
      // La palabra es la de la base, y la base es la que puede agregar una. Fallar
      // hacia adentro es lo que hace el §5.2; el log es para que un panel
      // bloqueado tenga una línea que lo explique.
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A]));
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          reason: 'multiple_businesses',
          role: null,
          location_ids: [],
          business_ids: [BIZ, OTHER_BIZ],
        }),
      );

      await expect(service.list(managerAB, BIZ)).rejects.toThrow(/venció/);
      expect(logs).toContainEqual(
        expect.objectContaining({
          event: 'staff_session_reason_unknown',
          reason: 'multiple_businesses',
        }),
      );
    });

    it('un dueño con el modo «equipo propio» (ttl 0) no vence nunca', async () => {
      repository.findMemberByUser.mockResolvedValue({
        ...ownerRow(),
        session_ttl_hours: 0,
        last_authenticated_at: null,
      });
      repository.listMembersWithScope.mockResolvedValue([
        { row: memberRow(), locationIds: [] },
      ]);

      const members = await service.list(owner, BIZ);

      expect(members).toHaveLength(1);
    });

    it('quien no es miembro de este negocio no toca sus accesos', async () => {
      repository.findMemberByUser.mockResolvedValue(null);

      await expect(service.list(stranger, BIZ)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.listMembersWithScope).not.toHaveBeenCalled();
    });

    it('un admin de plataforma supervisa la lista y no escribe nada', async () => {
      repository.listMembersWithScope.mockResolvedValue([
        { row: memberRow(), locationIds: [LOC_A] },
        { row: managerRow([LOC_A, LOC_B]), locationIds: [LOC_A, LOC_B] },
        { row: ownerRow(), locationIds: [] },
      ]);

      const members = await service.list(admin, BIZ);
      expect(members.map((m) => m.id)).toEqual([
        MEMBER_STAFF,
        MEMBER_MANAGER,
        MEMBER_OWNER,
      ]);

      // Uno por uno y awaited: un array de promesas ya empezadas deja el rechazo
      // sin manejar en el camino y el test pasa por el motivo equivocado.
      await expect(
        service.create(admin, BIZ, { label: 'x', business_location_ids: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.update(admin, BIZ, MEMBER_STAFF, { role: 'manager' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.rotatePin(admin, BIZ, MEMBER_STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.disableAccess(admin, BIZ, MEMBER_STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.enableAccess(admin, BIZ, MEMBER_STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.remove(admin, BIZ, MEMBER_STAFF),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.updateAlias(admin, BIZ, MEMBER_STAFF, { alias: 'a@b.role.ec' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(authAdmin.createUser).not.toHaveBeenCalled();
      expect(repository.updateMember).not.toHaveBeenCalled();
      expect(repository.findMemberByUser).not.toHaveBeenCalled();
    });

    it('un memberId de otro negocio es un 404, no un 200 que no cambió nada', async () => {
      repository.findMemberById.mockResolvedValue(null);

      await expect(
        service.update(owner, OTHER_BIZ, MEMBER_STAFF, {
          session_ttl_hours: 4,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cada DTO que sale cumple el schema de commons', async () => {
      const member = await service.update(owner, BIZ, MEMBER_STAFF, {
        role: 'manager',
      });

      expect(BusinessMemberSchema.parse(member)).toEqual(member);
      expect(member.business_location_ids).toEqual([]);
    });
  });

  // ───────────────────────────── el sello de sesión ───────────────────────

  describe('POST /staff/session sella y explica, nunca se niega', () => {
    beforeEach(() => {
      // El sello devuelve la fila que el servicio ya tenía, con la marca nueva:
      // un mock que devolviera una fila de empleado haría que el estado
      // reportado fuera de otro acceso que el de quien preguntó.
      repository.stampSession.mockImplementation(
        async (_b: string, _u: string, at: Date) => ({
          ...managerRow([LOC_A]),
          last_authenticated_at: at,
        }),
      );
    });

    it('sella y devuelve lo que la función dijo, sin volver a calcularlo', async () => {
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A]));
      // Una fecha que NINGUNA aritmética de TTL puede producir: el TTL de la
      // fila es 24 h y el sello es `now`, así que un `sello + 24 h` en el
      // servicio no puede dar esta. Si alguien reintrodujera la aritmética, este
      // test se pone rojo; si sólo cambiara el SQL, la respuesta se mueve con él.
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          role: 'manager',
          location_ids: [LOC_A],
          expires_at: '2031-04-05T06:07:08.910000+00:00',
          reason: 'ok',
          business_ids: [BIZ],
        }),
      );

      const state = await service.stampSession(managerAB, BIZ);

      expect(repository.stampSession).toHaveBeenCalledWith(
        BIZ,
        MANAGER_USER,
        expect.any(Date),
      );
      // Campo por campo, no en bloque: un `toEqual` sobre el objeto entero
      // pasaría igual con los cinco campos cambiados a la vez, y el campo que
      // importa es `expires_at`.
      expect(state.expires_at).toBe('2031-04-05T06:07:08.910000+00:00');
      expect(state.reason).toBe('ok');
      expect(state.role).toBe('manager');
      expect(state.location_ids).toEqual([LOC_A]);
      expect(state.business_ids).toEqual([BIZ]);
      expect(StaffSessionStateSchema.parse(state)).toEqual(state);
    });

    it('el estado se lee DESPUÉS del sello, que es lo que hace que una vencida vuelva como ok', async () => {
      // El doble cambia de respuesta según haya pasado el sello, que es lo que
      // hace la base: una sesión vencida que entra de nuevo ya no está vencida
      // cuando se pregunta. Leído antes del sello, el panel le diría a un
      // gerente que acaba de entrar que su sesión venció — y sería verdad en un
      // idioma y falsa en el otro.
      let sealed = false;
      repository.stampSession.mockImplementation(async () => {
        sealed = true;
        return managerRow([LOC_A]);
      });
      repository.sessionStateAsCaller.mockImplementation(async () =>
        sealed
          ? sessionState({ expires_at: '2031-04-05T06:07:08.910000+00:00' })
          : sessionState({ reason: 'session_expired' }),
      );
      repository.findMemberByUser.mockResolvedValue(managerRow([LOC_A]));

      const state = await service.stampSession(managerAB, BIZ);

      expect(state.reason).toBe('ok');
      expect(state.expires_at).toBe('2031-04-05T06:07:08.910000+00:00');
      // Y por orden, no sólo por resultado: el orden de las llamadas es lo que
      // hace la promesa, y un resultado igual con las llamadas al revés sería un
      // test que pasa por casualidad.
      expect(
        repository.sessionStateAsCaller.mock.invocationCallOrder[0],
      ).toBeGreaterThan(repository.stampSession.mock.invocationCallOrder[0]);
    });

    it('sin membresía responde lo que la función responde, y NO es un 403', async () => {
      repository.findMemberByUser.mockResolvedValue(null);
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          role: null,
          location_ids: [],
          expires_at: null,
          reason: 'no_membership',
          business_ids: [],
        }),
      );

      const state = await service.stampSession(stranger, BIZ);

      expect(state.reason).toBe('no_membership');
      expect(state.role).toBeNull();
      expect(repository.stampSession).not.toHaveBeenCalled();
    });

    it('una membresía pausada se explica como disabled, que es otra salida', async () => {
      repository.findMemberByUser.mockResolvedValue(
        memberRow({ user_id: MANAGER_USER, status: 'disabled' }),
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

      const state = await service.stampSession(managerAB, BIZ);

      expect(state.reason).toBe('disabled');
      expect(state.role).toBeNull();
      expect(state.business_ids).toEqual([]);
      // A un acceso pausado no se le renueva la sesión: el sello es lo que revive
      // una sesión, y una fila que no concede nada no tiene sesión que revivir.
      expect(repository.stampSession).not.toHaveBeenCalled();
    });

    it('el modo sin expiración no inventa una fecha: la que no hay, se devuelve null', async () => {
      repository.findMemberByUser.mockResolvedValue(ownerRow());
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({ role: 'owner', expires_at: null, reason: 'ok' }),
      );

      const state = await service.stampSession(owner, BIZ);

      expect(state.expires_at).toBeNull();
      expect(state.reason).toBe('ok');
    });
  });

  // ─────────────────── el sello sin nombre de negocio ───────────────────

  /**
   * `POST /staff/session` con `business_id` ausente.
   *
   * ─── POR QUÉ ESTOS CASOS VIVEN ACÁ Y NO SÓLO EN EL SPEC DEL CONTROLADOR ──────
   *
   * Porque la decisión es de este archivo: la resolución del negocio sale de la
   * respuesta de `sessionStateAsCaller` y de nada más. Un controlador que
   * eligiera `body.business_id ?? OWNER` pasaría todos los tests de HTTP.
   */
  describe('sin `business_id` la resolución la hace la función, no el servicio', () => {
    it('pregunta SIN argumento primero, y sella el negocio que la función resolvió', async () => {
      // La PRIMERA llamada va con `null`: es la que pregunta cuáles son las
      // membresías del que llama. Un `toHaveBeenCalledWith(BIZ, …)` como única
      // aserción pasaría con una implementación que eligiera el negocio sola.
      repository.sessionStateAsCaller.mockImplementation(
        async (businessId: string | null) =>
          businessId === null
            ? sessionState({ business_ids: [BIZ] })
            : sessionState({ business_ids: [BIZ] }),
      );

      await service.stampSession(managerAB, null);

      expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
        1,
        null,
        MANAGER_USER,
      );
      // Y el sello usa el id que la base devolvió, no el primero de una lista.
      expect(repository.stampSession).toHaveBeenCalledWith(
        BIZ,
        MANAGER_USER,
        expect.any(Date),
      );
    });

    it('la segunda lectura va con el negocio ya resuelto, nunca con `null`', async () => {
      // La respuesta tiene que ser sobre la fila que se selló. Preguntar de nuevo
      // sin argumento después del sello volvería a resolver, y si entre las dos
      // llamadas la persona tivesse otra membresía, la respuesta hablaría de una
      // fila distinta de la que se renovó.
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({ business_ids: [BIZ] }),
      );

      await service.stampSession(managerAB, null);

      expect(repository.sessionStateAsCaller).toHaveBeenNthCalledWith(
        2,
        BIZ,
        MANAGER_USER,
      );
      expect(repository.sessionStateAsCaller).toHaveBeenCalledTimes(2);
    });

    it('con varias membresías NO sella: `multiple_businesses` con la lista', async () => {
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          role: null,
          location_ids: [],
          expires_at: null,
          reason: 'multiple_businesses',
          business_ids: [BIZ, OTHER_BIZ],
        }),
      );

      const state = await service.stampSession(owner, null);

      expect(state.reason).toBe('multiple_businesses');
      expect(state.business_ids).toEqual([BIZ, OTHER_BIZ]);
      // Sellar sería escribir `last_authenticated_at` en una fila elegida a ciegas:
      // renovar la sesión de un negocio en el que la persona quizá no está
      // trabajando es peor que no renovar ninguna.
      expect(repository.stampSession).not.toHaveBeenCalled();
      // Y una sola lectura, porque no hay segunda pregunta sin sello que la justifique.
      expect(repository.sessionStateAsCaller).toHaveBeenCalledTimes(1);
    });

    it('sin membresías tampoco sella, y contesta lo que la función respondió', async () => {
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          role: null,
          location_ids: [],
          expires_at: null,
          reason: 'no_membership',
          business_ids: [],
        }),
      );

      const state = await service.stampSession(stranger, null);

      expect(state.reason).toBe('no_membership');
      expect(repository.stampSession).not.toHaveBeenCalled();
    });

    it('la resolución y el sello son EL MISMO método que el caso nombrado', async () => {
      // Las dos formas de llamar terminan en `sealAndExplain`. Lo que se comprueba
      // acá es que la nombrada NO prepende una resolución previa: si lo hiciera,
      // una llamada con el negocio explícito pagaría un round-trip de más por
      // preguntar algo que ya sabía.
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({ business_ids: [BIZ] }),
      );

      await service.stampSession(managerAB, BIZ);

      expect(repository.sessionStateAsCaller).toHaveBeenCalledTimes(1);
      expect(repository.sessionStateAsCaller).toHaveBeenCalledWith(
        BIZ,
        MANAGER_USER,
      );
    });

    it('el caso sin nombre deja una línea de log con el motivo, no con un sello', async () => {
      // El log es lo que separa «no sellé porque no sabía» de «no sellé porque no
      // había nada», y sin él un panel atascado queda sin línea que lo explique.
      const entries = captureLogs();
      repository.sessionStateAsCaller.mockResolvedValue(
        sessionState({
          role: null,
          location_ids: [],
          expires_at: null,
          reason: 'multiple_businesses',
          business_ids: [BIZ, OTHER_BIZ],
        }),
      );

      await service.stampSession(owner, null);

      expect(entries).toContainEqual(
        expect.objectContaining({
          event: 'staff_session_unresolved',
          userId: OWNER_USER,
          reason: 'multiple_businesses',
          businessCount: 2,
        }),
      );
      expect(entries).not.toContainEqual(
        expect.objectContaining({ event: 'staff_session_stamped' }),
      );
    });
  });
});
