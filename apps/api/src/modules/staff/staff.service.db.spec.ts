import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  BUSINESS_PLAN_FEATURES,
  BUSINESS_PLAN_LIMITS,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import type { Database } from '../../database/database.module';
import {
  createSupabaseTestDb,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';
import {
  StaffRepository,
  type BusinessMemberInsert,
  type StaffDbExecutor,
} from './staff.repository';
import { StaffService } from './staff.service';
import type { StaffAuthAdmin } from './staff.tokens';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRADUCCIONES DE ERROR, CONTRA LA BASE DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `staff.service.spec.ts` traduce los códigos de Postgres con errores PELADOS:
 * `pgError('23505', {constraint_name: '…'})`. Eso prueba la traducción, pero no
 * que el error llegue con esa forma — y la forma que llega en producción es
 * otra: Drizzle envuelve todo error de consulta en un `DrizzleQueryError` que
 * copia SÓLO el `cause`, así que el `code`, el `constraint_name`, el `message`
 * y el `detail` viven un nivel más abajo.
 *
 * Con el doble de siempre, las cuatro traducciones de `mapWriteError` eran
 * CÓDIGO MUERTO: el dueño recibía un 500 genérico en vez de «Ese alias ya está
 * en uso en este negocio.» o de la negativa del plan con sus números. El
 * doble no lo puede ver, porque el doble lanza la forma que la base nunca
 * produce.
 *
 * ─── Y QUÉ HACE ESTE ARCHIVO ──────────────────────────────────────────────────
 *
 * Que la violación sea REAL: la inserción real del índice único, el `R0001` real
 * del trigger del tope y el `P0001` real del catálogo roto, cada uno pasando por
 * el repositorio de verdad —el query builder de Drizzle— y llegando al servicio
 * con la forma que tiene en producción. La traducción se prueba sobre el error
 * que la base produce, no sobre el que el test se le pidió a la base que
 * produzca.
 */

/** El admin de plataforma: la rama que no necesita sesión ni alcance. */
const platformAdmin: AuthUser = {
  id: 'e9000000-0000-4000-8000-000000000001',
  role: 'admin',
  email: null,
};

/** Un negocio SIN dueño: la rama de la plataforma puede dar de alta accesos. */
const BIZ_ALIAS = 'e1000000-0000-4000-8000-000000000001';
const BIZ_LIMIT = 'e1000000-0000-4000-8000-000000000002';
const BIZ_CATALOGUE = 'e1000000-0000-4000-8000-000000000003';

const USER_A = 'e2000000-0000-4000-8000-000000000001';
const USER_B = 'e2000000-0000-4000-8000-000000000002';
const USER_C = 'e2000000-0000-4000-8000-000000000003';
const USER_D = 'e2000000-0000-4000-8000-000000000004';

/** El alias que se repite: es el que choca con el índice único. */
const ALIAS_REPETIDO = 'repetido@negocio.role.ec';

let ctx: SupabaseTestDb;
let db: Database;
let client: postgres.Sql;

/**
 * LA COLA DE USUARIOS QUE ENTREGA EL DOBLE DE AUTH.
 *
 * El doble de Auth es lo único que este archivo falsea: la base es real, y
 * `auth.users` es real, y el alta escribe una fila de verdad. Lo que el doble
 * hace es PROMETER el id de una cuenta que ya existe en `auth.users` —porque
 * `public.profiles` lo crea el trigger `on_auth_user_created`, y la fila de
 * `business_members` apunta ahí.
 */
let authQueue: string[] = [];

const authAdmin: StaffAuthAdmin = {
  auth: {
    admin: {
      createUser: async () => {
        const id = authQueue.shift();
        if (!id) throw new Error('no hay usuario de Auth para este alta');
        return { data: { user: { id } }, error: null };
      },
      deleteUser: async () => ({ error: null }),
      updateUserById: async () => ({ error: null }),
    },
  },
};

/**
 * EL REPOSITORIO REAL, CON LA CARRERA DEL CATÁLOGO ABIERTA.
 *
 * La avería del catálogo roto se puede descubrir en DOS momentos: en la
 * pre-comprobación de la puerta —que pregunta al catálogo si el negocio tiene
 * la fila— o en el TRIGGER, si la fila se pierde ENTRE las dos. La segunda es
 * la carrera, y para abrirla sin depender del reloj, el `insertMember` de este
 * repositorio borra la fila del catálogo ANTES de insertar: exactamente lo que
 * hace un `delete` concurrente.
 *
 * El resto del repositorio es el de verdad, con la base de verdad.
 */
class RacingRepository extends StaffRepository {
  constructor(
    database: Database,
    private readonly beforeInsert: () => Promise<void>,
  ) {
    super(database);
  }

  override async insertMember(
    executor: StaffDbExecutor,
    values: BusinessMemberInsert,
  ) {
    await this.beforeInsert();
    return super.insertMember(executor, values);
  }
}

/** El servicio, con el logger callado: un test no es un stdout de producción. */
function buildService(repository: StaffRepository): StaffService {
  const service = new StaffService(repository, authAdmin);
  (service as unknown as { logger: unknown }).logger = {
    log: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  return service;
}

/** La fila de `business_members` de un empleado, escrita a mano. */
async function insertMember(
  id: string,
  businessId: string,
  userId: string,
  alias: string,
): Promise<void> {
  await ctx.sql.unsafe(
    `insert into public.business_members
       (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, created_at, deleted_at)
     values ('${id}', '${businessId}', '${userId}', 'staff', 'Empleada', '${alias}', 'active', 24, null, now(), null)`,
  );
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
  client = postgres(ctx.connectionString, { prepare: false });
  db = drizzle({ client });

  await ctx.sql.begin(async (tx) => {
    for (const [id, email] of [
      [USER_A, 'a@negocio.role.ec'],
      [USER_B, 'b@negocio.role.ec'],
      [USER_C, 'c@negocio.role.ec'],
      [USER_D, 'd@negocio.role.ec'],
    ] as const) {
      // El trigger `on_auth_user_created` crea el `public.profiles` que la
      // fila de `business_members` referencia.
      await tx.unsafe(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ('${id}', '${email}', '{"role":"business"}'::jsonb)
         on conflict (id) do nothing`,
      );
    }

    await tx.unsafe(
      `insert into public.businesses (id, name, type, slug)
       values ('${BIZ_ALIAS}',     'Alias repetido',   'restaurant', 'svc-alias'),
              ('${BIZ_LIMIT}',     'Tope de miembros', 'restaurant', 'svc-limit'),
              ('${BIZ_CATALOGUE}', 'Catálogo roto',     'restaurant', 'svc-catalogue')`,
    );

    // El negocio del tope se queda en `free` —sin fila de suscripción, que es
    // lo que lee el `coalesce` de la base— y `free` admite DOS miembros.
    await tx.unsafe(
      `insert into public.business_members
         (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, created_at, deleted_at)
       values ('e3000000-0000-4000-8000-000000000001', '${BIZ_ALIAS}', '${USER_A}', 'staff', 'Carla', '${ALIAS_REPETIDO}', 'active', 24, null, now(), null),
              ('e3000000-0000-4000-8000-000000000002', '${BIZ_LIMIT}', '${USER_A}', 'staff', 'Carla', 'a@negocio.role.ec', 'active', 24, null, now(), null),
              ('e3000000-0000-4000-8000-000000000003', '${BIZ_LIMIT}', '${USER_B}', 'staff', 'Karla', 'b@negocio.role.ec', 'active', 24, null, now(), null)`,
    );

    // El negocio de la carrera está en `pro`, para que el plan que falta sea
    // el suyo y no el `free` del `coalesce`.
    await tx.unsafe(
      `insert into public.subscriptions (business_id, plan_code)
       values ('${BIZ_CATALOGUE}', 'pro')`,
    );
  });
});

afterAll(async () => {
  await client.end();
  await ctx.stop();
});

/**
 * ─── EL ALIAS REPETIDO: EL `23505` DE VERDAD ─────────────────────────────────
 *
 * El índice `business_members_alias_key` es UNIQUE sobre `(business_id,
 * lower(alias))` y no excluye las filas dadas de baja: por eso el alias
 * quemado sigue quemado. El alta que choca es REAL, y el error que llega al
 * servicio es el `DrizzleQueryError` de Drizzle.
 */
describe('el alias repetido, con la violación real del índice', () => {
  test('es un 409 que dice qué hacer, y no un 500', async () => {
    authQueue = [USER_B];
    const service = buildService(new StaffRepository(db));

    const error = await service
      .create(platformAdmin, BIZ_ALIAS, {
        label: 'Carla',
        alias: ALIAS_REPETIDO,
        business_location_ids: [],
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).message).toBe(
      'Ese alias ya está en uso en este negocio.',
    );
    // Y no es un 500: el error de la base se-tradujo.
    expect(error).not.toBeInstanceOf(InternalServerErrorException);
  });
});

/**
 * ─── EL TOPE DEL PLAN: EL `R0001` DE VERDAD ──────────────────────────────────
 *
 * El trigger `enforce_business_member_limit` cuenta los miembros que no son
 * dueño y se niega cuando la escritura CRECE. El `free` admite dos, así que el
 * tercero es el que se topa con el tope —con el `R0001` y su `detail`, que
 * lleva los números que el panel dibuja.
 */
describe('el tope del plan, con el R0001 real del trigger', () => {
  test('es un 422 con el plan y los números del trigger', async () => {
    authQueue = [USER_C];
    const service = buildService(new StaffRepository(db));

    const error = await service
      .create(platformAdmin, BIZ_LIMIT, {
        label: 'Carla',
        alias: 'c@negocio.role.ec',
        business_location_ids: [],
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const message = (error as UnprocessableEntityException).message;
    // La prosa es la del trigger…
    expect(message).toContain('el plan free admite hasta 2 miembros, no más');
    // …y los números salen de su `detail`.
    expect(message).toContain('plan free: admite hasta 2');
    expect(message).toContain('serían 3');
  });
});

/**
 * ─── LA CARRERA DEL CATÁLOGO: EL `P0001` DE VERDAD ───────────────────────────
 *
 * El catálogo se pierde ENTRE la pre-comprobación de la puerta y el `INSERT`:
 * la puerta preguntó y el catálogo estaba entero, y el motor se niegue en voz
 * alta porque la fila ya no está. La respuesta tiene que ser la MISMA que la
 * de la pre-comprobación —un 500 de avería de configuración que nombra el
 * plan— y no un 500 genérico sin nombre.
 */
describe('la carrera del catálogo, con el P0001 real del trigger', () => {
  test('es el 500 del catálogo roto, con el plan nombrado', async () => {
    authQueue = [USER_D];
    const repository = new RacingRepository(db, async () => {
      await ctx.sql.unsafe(
        `delete from public.subscription_plans where code = 'pro'`,
      );
    });
    const service = buildService(repository);

    try {
      const error = await service
        .create(platformAdmin, BIZ_CATALOGUE, {
          label: 'Carla',
          alias: 'd@negocio.role.ec',
          business_location_ids: [],
        })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      const message = (error as InternalServerErrorException).message;
      expect(message).toContain('catálogo de planes está roto');
      expect(message).toContain('`pro`');
      // Y NO es la puerta del plan: un catálogo roto no se contesta como una
      // negativa.
      expect(error).not.toBeInstanceOf(UnprocessableEntityException);
    } finally {
      // El catálogo se vuelve a armar con el ESPEJO del contrato, no con
      // números escritos a mano.
      const limits = BUSINESS_PLAN_LIMITS.pro;
      await ctx.sql.unsafe(
        `insert into public.subscription_plans
           (code, audience, max_locations, max_members, is_active)
         values ('pro', 'business', ${limits.locations}, ${limits.members}, true)
         on conflict do nothing`,
      );
      for (const feature of BUSINESS_PLAN_FEATURES.pro) {
        await ctx.sql.unsafe(
          `insert into public.subscription_plan_features (plan_code, feature)
           values ('pro', '${feature}')
           on conflict do nothing`,
        );
      }
    }
  });
});
