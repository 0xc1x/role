import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  BUSINESS_MEMBER_ROLES,
  BUSINESS_MEMBER_STATUSES,
  BusinessMemberSessionTtlHoursSchema,
} from '@0xc1x/role-commons';
import {
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * Los vocabularios de `business_members` contra los enums que los guardan.
 *
 * ─── POR QUÉ ESTE ARCHIVO, Y POR QUÉ NO VA DENTRO DE OTRO ─────────────────────
 *
 * `business-members.rls.db.spec.ts` prueba que los permisos SE EJECUTAN: que un
 * gerente no toca lo que no administra, que una sesión vencida pierde acceso, que
 * el dueño no se desactiva. `plan-limits.db.spec.ts` ata el catálogo de planes a
 * los triggers que lo aplican. Ninguno de los dos mira el hecho más básico de la
 * tabla: que los nombres que TypeScript le pone a la columna sean los nombres que
 * la columna tiene.
 *
 * Y el vacío no es inocuo. Borrar `manager` de `BUSINESS_MEMBER_ROLES` no rompe un
 * test: rompe el `PATCH` que degrada a un gerente, en producción, y el compilador
 * sigue conforme porque el `z.enum` se ajusta solo a la lista que le acaban de
 * acortar. Al revés, un valor nuevo en la base deja a la API sin forma de pedirlo
 * y a la UI sin forma de pintarlo, y el tipo de TypeScript no se entera porque el
 * tipo de TypeScript ES esta lista. El Plan 1 dejó anotado que nadie comprobaba
 * esto; acá queda comprobado.
 *
 * ─── POR QUÉ LAS DOS DIRECCIONES ─────────────────────────────────────────────
 *
 * Porque las dos mitades se rompen distinto y por motivos distintos. Un valor que
 * existe en TypeScript y no en la base no se puede GUARDAR: el `POST /staff`
 * revienta con un error de enum en medio de un alta. Un valor que existe en la
 * base y no en TypeScript no se puede PEDIR ni PINTAR, y ese fallo es el peor de
 * los dos porque no rompe nada: deja de aparecer en la lista y nadie sabe por qué.
 *
 * Por eso los dos `filter` van con su propio `expect` y no con un `toEqual` de
 * listas: el mensaje de un fallo tiene que decir de qué lado está la diferencia.
 *
 * ─── POR QUÉ EL ORDEN TAMBIÉN SE COMPARA ──────────────────────────────────────
 *
 * El `order by enumsortorder` de Postgres contra el orden del array es una
 * afirmación más fuerte que la de conjuntos, y es intencional: `pg_enum` ordena
 * como los escribió la migración, que es el orden de autoridad del §3.2
 * (`owner`, `manager`, `staff`). Si alguien reordena el enum en la base, el
 * `sortorder` se mueve con él y este archivo avisa, en vez de que un `sort` sobre
 * una enumación que nadie ha prometido usar como escala empiece a mentir en
 * silencio.
 *
 * ─── EL `CHECK` ES LA TERCERA COPIA, Y TAMBIÉN ESTÁ ATADA ─────────────────────
 *
 * `session_ttl_hours integer not null default 24 check (session_ttl_hours >= 0)`
 * es la regla que decide si `0` es una política de sesión o un error de dedo. El
 * schema de este paquete dice lo mismo desde el otro lado del alambre, y entre
 * los dos no había nada. Aquí se comprueban las tres cosas que pueden separarse:
 * que el `CHECK` exista y diga `>= 0` y no `> 0` (con `> 0` el modo «equipo
 * propio» del §9.2 desaparece de la base y el schema sigue aceptando el `0`), que
 * la base acepte el `0` y lo guarde, y que la función que cuenta la expiración
 * devuelva `NULL` para ese `0` en vez de una fecha pasada.
 */

let ctx: SupabaseTestDb;

/**
 * Un negocio `pro_plus`: sin topes, para que ningún trigger corte un probe.
 *
 * Una persona por probe, y no una para los tres, porque
 * `business_members_business_id_user_id_key` —de `20261014005756`— deja una
 * membresía por negocio y persona. Y `pro_plus` a propósito: el trigger de la §5.3
 * cuenta los miembros, y con un `free` un probe se toparía con `R0001`, un código
 * que no es el que se está midiendo y que hace que un fallo se lea como una
 * discrepancia del tope.
 *
 * El probe que tiene que FALLAR lleva su propia persona porque, si el `CHECK`
 * desapareciera, `deniedAs` commitea lo que escribió —es su asimetría documentada—
 * y una fila filtrada en el probe negativo rompería el de los defaults con un
 * `23505` que no tiene nada que ver con lo que se está midiendo.
 */
const BIZ = 'e5000000-0000-4000-8000-000000000001';
const USER_NO_EXPIRY = 'e6000000-0000-4000-8000-000000000001';
const USER_DEFAULTS = 'e6000000-0000-4000-8000-000000000002';
const USER_NEGATIVE = 'e6000000-0000-4000-8000-000000000003';

/** Los tres accesos del fixture, nombrados por lo que cada uno mide. */
const MEMBER_NO_EXPIRY = 'e7000000-0000-4000-8000-000000000001';
const MEMBER_DEFAULTS = 'e7000000-0000-4000-8000-000000000002';
const MEMBER_NEGATIVE = 'e7000000-0000-4000-8000-000000000003';

function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * Los valores de un enum de Postgres, en el orden en que la base los declara.
 *
 * `n.nspname = 'public'` y no sólo `t.typname`: un `business_member_role` creado
 * en otro esquema satisfaría una consulta que sólo compara el nombre, y el
 * archivo entero se volvería verde porque encontró el tipo equivocado.
 */
async function enumLabels(typeName: string): Promise<string[]> {
  return plainRows<{ label: string }>(
    await ctx.sql.unsafe(
      `select e.enumlabel as label
         from pg_type t
         join pg_enum e on e.enumtypid = t.oid
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public'
          and t.typname = '${typeName}'
        order by e.enumsortorder`,
    ),
  ).map((row) => row.label);
}

/**
 * Una lista de TypeScript y una de Postgres, o un fallo que dice cuál se movió.
 *
 * El anti-vacío va primero, pero es `> 0` y no una comparación de longitudes: una
 * comparación de longitudes se dispara antes que los dos `filter`, y su mensaje
 * —«no tiene los valores que espera»— es el menos útil de los tres, porque no
 * dice de qué lado está la diferencia. La pregunta que el conteo tiene que
 * responder es otra: ¿la consulta encontró el enum? Un `[]` de verdad —el tipo
 * renombrado, una migración que no corrió— tiene que sonar distinto de una
 * discrepancia real, y por eso es su propio `expect`.
 */
function assertSameVocabulary(
  typeName: string,
  fromDatabase: readonly string[],
  fromTypeScript: readonly string[],
) {
  expect(
    fromDatabase.length,
    `public.${typeName} no devolvió ningún valor: el tipo no existe con ese ` +
      'nombre en el esquema public, o este spec se quedó viejo. Las dos cosas se ' +
      'arreglan acá, no aflojando la comparación.',
  ).toBeGreaterThan(0);

  expect(
    fromTypeScript.filter((value) => !fromDatabase.includes(value)),
    `TypeScript tiene un valor que public.${typeName} no: la API lo puede pedir ` +
      'y la columna no lo puede guardar.',
  ).toEqual([]);

  expect(
    fromDatabase.filter((value) => !fromTypeScript.includes(value)),
    `public.${typeName} tiene un valor que TypeScript no: no se puede pedir, no ` +
      'se puede pintar y el tipo no lo conoce. La base manda acá —el schema es ' +
      'la copia que hay que mover, no la base.',
  ).toEqual([]);

  expect(
    fromDatabase,
    `el orden de public.${typeName} no es el del catálogo de TypeScript`,
  ).toEqual([...fromTypeScript]);
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // El perfil lo crea `handle_new_user` a partir del `auth.users`, que es lo que
    // hace la FK `business_members.user_id -> profiles(id)`.
    await tx.unsafe(
      `insert into auth.users (id, email)
         values ('${USER_NO_EXPIRY}', 'vocabulario-sin-expiracion@test'),
                ('${USER_DEFAULTS}', 'vocabulario-defaults@test'),
                ('${USER_NEGATIVE}', 'vocabulario-negativo@test')
       on conflict (id) do nothing`,
    );
    await tx.unsafe(`
      insert into public.businesses (id, name, type, slug)
      values ('${BIZ}', 'Vocabulario', 'restaurant', 'vocabulario');

      insert into public.business_plans_state (business_id, plan_code)
      values ('${BIZ}', 'pro_plus');
    `);
  });
});

afterAll(async () => {
  await ctx.stop();
});

describe('los dos vocabularios de enum son la misma lista que en TypeScript', () => {
  test('business_member_role', async () => {
    assertSameVocabulary(
      'business_member_role',
      await enumLabels('business_member_role'),
      BUSINESS_MEMBER_ROLES,
    );
  });

  test('business_member_status', async () => {
    assertSameVocabulary(
      'business_member_status',
      await enumLabels('business_member_status'),
      BUSINESS_MEMBER_STATUSES,
    );
  });

  test('las dos columnas son esos enums, y no texto', async () => {
    // Sin esto el archivo pasa con la columna degradada a `text`: `pg_enum` sigue
    // teniendo los valores, la comparación de arriba sigue en verde, y la base
    // ya no impide guardar cualquier otra cosa. `typtype = 'e'` es lo que separa
    // «un enum» de «una columna que se parece a un enum».
    const columns = plainRows<{
      attname: string;
      typname: string;
      typtype: string;
    }>(
      await ctx.sql.unsafe(`
        select a.attname, t.typname, t.typtype
          from pg_attribute a
          join pg_class c on c.oid = a.attrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_type t on t.oid = a.atttypid
         where n.nspname = 'public'
           and c.relname = 'business_members'
           and a.attname in ('role', 'status')
           and a.attnum > 0
           and not a.attisdropped
         order by a.attname`),
    );

    expect(
      columns.map((c) => c.attname),
      'no se encontraron las dos columnas de enum de business_members. Si este ' +
        'spec no las lee, la mitad del archivo no está comparando nada.',
    ).toEqual(['role', 'status']);

    expect(columns.map((c) => [c.typname, c.typtype])).toEqual([
      ['business_member_role', 'e'],
      ['business_member_status', 'e'],
    ]);
  });
});

describe('el `session_ttl_hours >= 0` de la base y el del schema son el mismo', () => {
  test('el CHECK existe y es `>= 0`, no `> 0`', async () => {
    const checks = plainRows<{ conname: string; def: string }>(
      await ctx.sql.unsafe(`
        select con.conname, pg_get_constraintdef(con.oid) as def
          from pg_constraint con
          join pg_class c on c.oid = con.conrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'business_members'
           and con.contype = 'c'
           and pg_get_constraintdef(con.oid) like '%session_ttl_hours%'
         order by con.conname`),
    );

    expect(
      checks.map((c) => c.conname),
      'no se encontró el CHECK de session_ttl_hours. Con él ausente, ' +
        'BusinessMemberSessionTtlHoursSchema acepta un valor que la columna no: ' +
        'el contrato lo aprueba y la escritura revienta, que es un 500 donde el ' +
        'mismo dato debía haber producido un 400.',
    ).toEqual(['business_members_session_ttl_hours_check']);

    // El texto, y no una coincidencia floja: `> 0` también «no deja negativos», y
    // sin embargo borra el modo «equipo propio» del §9.2, que es un `0`.
    expect(checks[0]?.def.replace(/\s+/g, ' ').trim()).toBe(
      'CHECK ((session_ttl_hours >= 0))',
    );
  });

  test('la base acepta el 0, lo guarda, y el 0 significa «no expira»', async () => {
    // El control positivo va PRIMERO y sin `deniedAs`: si el `CHECK` se hubiera
    // endurecido a `> 0`, el insert revienta y el resto de este archivo nunca
    // mide nada. Un probe negativo que se apoya en un control que no existe es
    // verde por la razón equivocada.
    const rows = plainRows<{
      id: string;
      session_ttl_hours: number;
      role: string;
      status: string;
    }>(
      await ctx.sql.unsafe(`
        insert into public.business_members (id, business_id, user_id, role, label, alias, session_ttl_hours)
        values ('${MEMBER_NO_EXPIRY}', '${BIZ}', '${USER_NO_EXPIRY}', 'staff',
                'Equipo propio', 'vocabulario-sin-expiracion@test', 0)
        returning id, session_ttl_hours, role::text as role, status::text as status`),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.session_ttl_hours).toBe(0);

    // Y el `0` no es «venció ahora»: la función que cuenta la expiración —la
    // misma que consumen `can_manage_location`, `business_member_session_valid` y
    // `business_member_session_state`— devuelve `NULL` para ese TTL. Un `0` con
    // fecha pasada sería una sesión muerta desde que nació, que es una lectura
    // que el panel no puede tener.
    const [expiry] = plainRows<{
      no_expiry: string | null;
      turn: string | null;
    }>(
      await ctx.sql.unsafe(
        `select public.business_member_session_expires_at(0, now())::text as no_expiry,
                public.business_member_session_expires_at(24, now())::text as turn`,
      ),
    );

    expect(expiry?.no_expiry).toBeNull();
    expect(expiry?.turn).not.toBeNull();

    // El otro lado del alambre, con el mismo cero y el mismo menos uno. El
    // schema es el otro lado de la misma regla: los dos la dibujan, y este es el
    // punto donde se lee si la dibujaron en el mismo sitio.
    expect(BusinessMemberSessionTtlHoursSchema.safeParse(0).success).toBe(true);
    expect(BusinessMemberSessionTtlHoursSchema.safeParse(-1).success).toBe(
      false,
    );
  });

  test('la base rechaza el -1, y con el código del CHECK', async () => {
    const refusal = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(`
        insert into public.business_members (id, business_id, user_id, role, label, alias, session_ttl_hours)
        values ('${MEMBER_NEGATIVE}', '${BIZ}', '${USER_NEGATIVE}', 'staff', 'Negativo',
                'vocabulario-negativo@test', -1)`),
    );

    expect(
      refusal,
      'la base guardó un session_ttl_hours negativo. Esa membresía nace ya ' +
        'vencida, y es el modo de falla que el CHECK existe para cerrar. Si este ' +
        'test falla, el CHECK no está: el resto del archivo sigue valiendo y esta ' +
        'fila es basura que hay que limpiar a mano.',
    ).not.toBeNull();
    expect(refusal?.code).toBe('23514');
  });

  test('la fila que nace sola trae los defaults de la columna', async () => {
    // `CreateBusinessMemberSchema` deja `role`, `status` y `session_ttl_hours`
    // opcionales a propósito, para que la decisión viva en la columna y no en dos
    // schemas que se puedan apartar. Eso es un contrato con la base, así que se
    // mide: no se lee `pg_attrdef`, se inserta sin los tres campos y se lee lo que
    // quedó, porque un default declarado y un default aplicado son dos hechos.
    const rows = plainRows<{
      role: string;
      status: string;
      session_ttl_hours: number;
    }>(
      await ctx.sql.unsafe(`
        insert into public.business_members (id, business_id, user_id, label, alias)
        values ('${MEMBER_DEFAULTS}', '${BIZ}', '${USER_DEFAULTS}', 'Sin tocar',
                'vocabulario-defaults@test')
        returning role::text as role, status::text as status, session_ttl_hours`),
    );

    expect(rows[0]?.role).toBe('staff');
    expect(rows[0]?.status).toBe('active');
    expect(rows[0]?.session_ttl_hours).toBe(24);
  });
});
