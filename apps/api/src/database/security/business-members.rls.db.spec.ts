import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  splitStatements,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * Las tres tablas de acceso por sucursal y su perímetro, antes de que exista una
 * sola policy.
 *
 * ─── POR QUÉ ESTE ARCHIVO Y NO EL ESPEJO DE DRIZZLE ─────────────────────────
 *
 * Misma razón que `announcements.rls.db.spec.ts`: `apps/api/test/db.ts` construye
 * la base desde `apps/api/drizzle/`, y ese espejo filtra `CREATE POLICY`, los
 * `GRANT`/`REVOKE` y todo lo que toque `auth.uid()`. Es la base correcta para las
 * consultas del API y la base INCORRECTA para esto. Este archivo replayea
 * `supabase/migrations/` de verdad, con los roles `anon` / `authenticated` /
 * `service_role`.
 *
 * ─── LAS AUSENCIAS SON LA DECISIÓN, Y ESTE ARCHIVO LAS MIDE ──────────────────
 *
 * `business_members` y `business_member_locations` no tienen policy de INSERT, de
 * UPDATE ni de DELETE: el cliente solo las lee. Lo que frena la escritura es la
 * AUSENCIA de policy, que es justo lo que RLS sabe hacer, y es una decisión de
 * diseño del §6.3 del spec, no un archivo que se olvidó de escribirse. El conteo
 * de policies de abajo se aserta entero para que una policy de escritura que
 * apareciera más adelante salga como un diff de una línea y no como un
 * comportamiento nuevo que nadie miró.
 *
 * Ojo con el grant y la policy: son capas distintas. Que `anon` y `authenticated`
 * no tengan privilegio de escritura sobre la tabla es el ACL; que no lo consigan
 * aunque se lo den es la policy, y son dos paredes que hacen falta las dos. Este
 * archivo mide lo segundo —la policy ausente— y
 * `destructive-privileges.rls.db.spec.ts` mide, sobre el conjunto de `public`, las
 * tres que ninguna policy gobierna.
 *
 * ─── EL ÍNDICE ÚNICO DEL ALIAS, Y POR QUÉ ES POR NEGOCIO ───────────────────
 *
 * `business_members_alias_key` es UNIQUE sobre `(business_id, lower(alias))` y NO
 * lleva `where deleted_at is null`. Las dos mitades importan y se miden por
 * separado.
 *
 * El `business_id` está porque el alias identifica un acceso, no a una persona:
 * el mismo dueño que dirige seis negocios es SEIS filas de miembro con el MISMO
 * alias, y un índice global afirmaría algo falso — que una persona no puede estar
 * en dos negocios. En producción eso no es una hipótesis: `admin@fudi.app` es
 * dueño de 6 de los 16.
 *
 * Y no lleva predicado porque un índice parcial aquí sería un alias reciclable: la
 * fila dada de baja dejaría de bloquear el alias, y su `auth.users` podría seguir
 * vivo, así que el mismo identificador volvería a pertenecer a dos personas. El
 * índice se aserta por su FORMA y no por su nombre en el conjunto de los tres,
 * porque lo que hay que proteger es la unicidad, y un índice no único con el
 * nombre correcto pasa todo lo que no mira el `CREATE INDEX`.
 *
 * ─── LO QUE ESTE ARCHIVO NO PUEDE MEDIR, Y POR QUÉ ─────────────────────────
 *
 * Que la baja de una fila no conceda acceso por ningún camino —que un
 * `deleted_at` no abra la puerta ni aunque su `auth.users` siguiera vivo— no se
 * mide acá, porque todavía no hay helper ni policy que lo conceda: es lo que
 * escribe el paso 4 del §6.2 del spec, y es el paso que depende de esta
 * migración. Lo que sí se mide es la forma en que la tabla nace, que es la única
 * mitad de esa garantía que depende de este DDL y no de la siguiente.
 *
 * ─── EL BACKFILL, Y POR QUÉ ESTE ARCHIVO LO EJECUTA DE SU PROPIO LEDGER ─────
 *
 * El backfill es un cambio de DATOS, y los datos del ledger no llegan al replay:
 * los seeds de `auth.users` y de negocios son dos de las cuatro migraciones que
 * `KNOWN_REPLAY_FAILURES` declara irreproductibles, así que la base de prueba
 * empieza con cero filas en `business_ownership`. Una aserción de la forma
 * "todo dueño es un miembro owner" sobre ESA base es cierta antes y después del
 * backfill, y no distinguiría una migración de un archivo vacío.
 *
 * El fixture de las dos pruebas de acá se crea DESPUÉS del replay, y por eso el
 * backfill tiene que correr dentro de la prueba para alcanzarlo: se ejecuta
 * LEYÉNDOSE del archivo del ledger y con el mismo `splitStatements` que usa el
 * replay. Una copia del SQL pegada en la prueba probaría que la copia funciona,
 * y un día el archivo y la copia divergirían sin que nada se enterara.
 * `on conflict ... do nothing` es lo que hace posible esto: correr el backfill
 * dos veces sobre el mismo fixture es la operación que la migración promete
 * soportar, no un truco del test.
 */

let ctx: SupabaseTestDb;

/**
 * postgres.js contesta con un `RowList`, que es un array que además carga
 * metadatos de la consulta, y `toEqual` compara los metadatos también. Misma
 * normalización que los otros specs del directorio: spread.
 */
function plainRows<T>(result: readonly T[]): T[] {
  return [...result];
}

/** The sentinel that forces `rolledBack` to discard its transaction. */
const ROLLED_BACK = 'business-members.spec: rollback on purpose';

/**
 * Run `fn` in one transaction and hand back the SQLSTATE of the first statement
 * it refused with, or `null` if `fn` ran to the end — ALWAYS leaving nothing
 * behind.
 *
 * ─── Por qué no `deniedAs()` ────────────────────────────────────────────────
 *
 * Porque `deniedAs()` tiene una asimetría, y esta es justo la prueba donde esa
 * asimetría muerde: solo revierte la transacción cuando la sentencia es
 * RECHAZADA, así que en el camino de éxito commitea lo que escribió. El camino de
 * éxito de este test es la falla que el test existe para detectar —la constraint
 * ausente, con lo que el duplicado entra— y una fila commiteada ahí envenena los
 * tests de abajo, que cuentan filas de `business_members` sobre el mismo fixture.
 * Una prueba cuyo modo de falla deja basura convierte una línea roja en tres.
 *
 * ─── Por qué el `throw` es incondicional ────────────────────────────────────
 *
 * Porque una transacción que resuelve COMMITEA. La única forma de garantizar que
 * no sobreviva nada es no dejarla resolver nunca, así que el `throw` va después
 * del `try` y no dentro: tanto si algo falló como si no, la transacción se
 * descarta y lo que el test necesita —el código del error— ya quedó copiado
 * fuera.
 */
async function rolledBack(
  sql: Parameters<typeof as>[0],
  fn: (tx: Parameters<typeof as>[0]) => Promise<void>,
  impersonation?: { role: string; userId: string | null },
): Promise<string | null> {
  let refusal: string | null = null;
  try {
    await sql.begin(async (tx) => {
      try {
        // Las MISMAS dos sentencias que pone `as()`, y no una copia improvisada
        // de ellas: esta función existe justamente para que el INSERT que se
        // probea lo niegue el MISMO RLS que lo negaría en producción. Si las
        // reclamaciones se fixeran distinto acá, el test mediría una sesión que
        // no existe. Copiar el `set local role` de otra parte del archivo sería
        // una segunda cuenta del mismo cálculo, que es lo que esta ronda
        // acaba de eliminar de otro sitio.
        if (impersonation !== undefined) {
          await tx.unsafe(`set local role ${impersonation.role}`);
          if (impersonation.userId !== null) {
            await tx.unsafe(
              `select set_config('request.jwt.claim.sub', '${impersonation.userId}', true), ` +
                `set_config('request.jwt.claim.role', '${impersonation.role}', true), ` +
                `set_config('request.jwt.claims', '${JSON.stringify({
                  sub: impersonation.userId,
                  role: impersonation.role,
                })}', true)`,
            );
          }
        }
        await fn(tx as unknown as Parameters<typeof as>[0]);
      } catch (error) {
        refusal = (error as { code?: string }).code ?? '????';
      }
      throw new Error(ROLLED_BACK);
    });
  } catch (error) {
    // Anything else is a broken connection and has to surface: tragarse ese error
    // dejaría `refusal` en null y la aserción de abajo culparía a la constraint de
    // algo que no fue la constraint.
    if ((error as Error).message !== ROLLED_BACK) throw error;
  }
  return refusal;
}

// ─── EL FIXTURE DEL BACKFILL ────────────────────────────────────────────────
//
// TRES negocios y DOS dueños, sembrados por el camino real de la plataforma
// —`auth.users`, y el trigger `on_auth_user_created` escribe el `profiles` que
// `business_ownership.owner_id` exige— y una fila de `business_ownership` por
// negocio.
//
// Tres y no uno porque "exactamente una fila" necesita un denominador mayor de
// uno: con un solo dueño, un backfill que duplicara y otro que borrara darían el
// mismo conteo que el correcto.
//
// Y DOS dueños, con `OWNERS[0]` al frente de DOS negocios, porque esa es la
// forma de producción que rompe: `admin@fudi.app` es dueño de 6 de los 16. Con el
// índice global de alias, sembrar un solo dueño en dos negocios revienta con
// `23505` y el fixture entero se cae —que es la falla que motivó
// `20261014004804_business_members_alias_key_per_business`—, así que este archivo
// no la puede seguir teniendo por accidente.

const OWNERS: readonly { id: string; email: string }[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    email: 'owner-a@rls-business-members.test',
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    email: 'owner-b@rls-business-members.test',
  },
];

const BUSINESSES: readonly {
  id: string;
  name: string;
  slug: string;
  owner: number;
}[] = [
  {
    id: 'e1000000-0000-4000-8000-000000000001',
    name: 'RLS business members A',
    slug: 'rls-business-members-a',
    owner: 0,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000002',
    name: 'RLS business members B',
    slug: 'rls-business-members-b',
    owner: 1,
  },
  {
    id: 'e1000000-0000-4000-8000-000000000003',
    name: 'RLS business members C',
    slug: 'rls-business-members-c',
    owner: 0,
  },
];

/**
 * Suffix del archivo del ledger, sin versión: el timestamp lo asigna el servidor
 * al aplicar la migración, así que nombrarlo acá con la versión sería una
 * constante que hay que reescribir cada vez que la migración se re-sella.
 */
const BACKFILL_SUFFIX = '_backfill_business_members.sql';

/**
 * Walks up until it finds `supabase/migrations`, for the reason
 * `catalog-rpc-moderation-gate.spec.ts` gives at length: a fixed `..` count is
 * right for `src/` and wrong for the compiled copy under `dist/src/`, and a
 * throw at module load surfaces as "Unhandled error between tests" — a suite
 * that still reports green.
 */
function resolveMigrationsDir(): string {
  let dir = import.meta.dir;
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = join(dir, 'supabase', 'migrations');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `supabase/migrations not found walking up from ${import.meta.dir}. This ` +
      'spec reads the ledger; it cannot assert anything without it.',
  );
}

/**
 * The backfill's own statements, read from the ledger and split the way the
 * replay splits them.
 *
 * Throws rather than returning `[]` when the file is absent. A backfill that
 * inserts nothing would leave the invariant true for the wrong reason, and that
 * is the one failure this file exists to make impossible.
 */
function backfillStatements(): string[] {
  const dir = resolveMigrationsDir();
  const file = readdirSync(dir).find((f) => f.endsWith(BACKFILL_SUFFIX));
  if (!file) {
    throw new Error(
      `supabase/migrations holds no ${BACKFILL_SUFFIX}. The backfill this file ` +
        "asserts is the ledger's, and a copy of it here would prove that the " +
        'copy behaves.',
    );
  }
  return splitStatements(readFileSync(join(dir, file), 'utf8'));
}

/**
 * Run the backfill and COMMIT it, as `apply_migration` did.
 *
 * One transaction for the whole file, like the replay's per-file transaction:
 * a half-applied backfill is a state nobody should ever assert against.
 */
async function applyBackfill(): Promise<void> {
  await ctx.sql.begin(async (tx) => {
    for (const statement of backfillStatements()) {
      await tx.unsafe(statement);
    }
  });
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // Through `auth.users`, never straight into `profiles`: the only producer of
    // a profile is the `on_auth_user_created` trigger, so a hand-written profile
    // would be a fixture that cannot exist in production — and it is the trigger
    // that copies `email` into the profile the backfill reads the alias from.
    for (const owner of OWNERS) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${owner.id}', '${owner.email}')
         on conflict (id) do nothing`,
      );
    }
    for (const business of BUSINESSES) {
      await tx.unsafe(
        `insert into public.businesses (id, name, type, slug)
         values ('${business.id}', '${business.name}', 'restaurant', '${business.slug}')
         on conflict (id) do nothing`,
      );
    }
    // `business_ownership` se siembra a mano porque el trigger que lo escribe
    // (`trg_set_business_owner_from_jwt`) guarda con `(select auth.uid()) is not
    // null`, y esta transacción es la dueña del esquema sin JWT. Medido, no
    // supuesto: es lo mismo que hace `businesses.rls.db.spec.ts`.
    for (const business of BUSINESSES) {
      const owner = OWNERS[business.owner] as (typeof OWNERS)[number];
      await tx.unsafe(
        `insert into public.business_ownership (business_id, owner_id)
         values ('${business.id}', '${owner.id}')
         on conflict (business_id) do nothing`,
      );
    }
  });
});

afterAll(async () => {
  await ctx.stop();
});

describe('las tres tablas de staff nacen cerradas', () => {
  test('las tres tablas nuevas traen RLS y sin privilegios destructivos', async () => {
    const rls = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ relname: string; rls: boolean }[]>(
          `
          select c.relname, c.relrowsecurity as rls
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('business_members','business_member_locations','business_plans_state')
          order by c.relname`,
        )
        .then((rows) => plainRows(rows)),
    );
    expect(rls).toEqual([
      { relname: 'business_member_locations', rls: true },
      { relname: 'business_members', rls: true },
      { relname: 'business_plans_state', rls: true },
    ]);

    // El RLS habilitado no es la mitad de la obligación: TRUNCATE, TRIGGER y
    // REFERENCES no los gobierna ninguna policy, porque no hay `USING` que los
    // filtre. Se miden acá y no solo en `destructive-privileges.rls.db.spec.ts`
    // porque ese archivo afirma el conjunto —lo que importa es que las tres
    // tablas nuevas estén dentro— y este afirma las tres por nombre, que es lo
    // que dice qué tabla es cuál cuando el conjunto falla.
    const destructive = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ relname: string; priv: string }[]>(
          `
          select c.relname, p.priv
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral unnest(
            array['TRUNCATE', 'TRIGGER', 'REFERENCES']
          ) as p(priv)
          where n.nspname = 'public'
            and c.relname in ('business_members','business_member_locations','business_plans_state')
            and (has_table_privilege('anon', c.oid, p.priv)
              or has_table_privilege('authenticated', c.oid, p.priv))
          order by c.relname, p.priv`,
        )
        .then((rows) => plainRows(rows)),
    );
    expect(
      destructive.map((d) => `${d.relname}:${d.priv}`),
      'un rol cliente conserva un privilegio que ninguna policy puede filtrar ' +
        'sobre una de las tres tablas nuevas. Las tres traen su propio revoke ' +
        'porque 20260928181714 iteró pg_class por relrowsecurity y ya corrió.',
    ).toEqual([]);
  });

  test('el índice único de alias es por negocio y no recicla filas borradas', async () => {
    const idx = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ indexdef: string }[]>(
          `
          select indexdef from pg_indexes
          where schemaname = 'public'
            and tablename = 'business_members'
            and indexname = 'business_members_alias_key'`,
        )
        .then((rows) => plainRows(rows)),
    );
    // Un índice normal (no único) con este nombre perdería la garantía de §4.1.
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toContain('UNIQUE');

    // Y lo que hace única la fila: las DOS columnas, en ese orden. Dos
    // `toContain` sueltos pasarían contra un índice con una tercera columna o con
    // las columnas al revés, así que lo que se afirma es la lista de columnas
    // exacta. `business_id` va primero porque es el que hace la unicidad POR
    // NEGOCIO: el mismo dueño en seis negocios son seis accesos distintos, y un
    // índice global sobre `lower(alias)` solo no aplicaría.
    expect(
      idx[0].indexdef,
      'el índice único de alias tiene que ser sobre `(business_id, lower(alias))`. ' +
        'Un índice global sobre `lower(alias)` afirma que una persona no puede ' +
        'dirigir dos negocios, y en producción admin@fudi.app dirige seis.',
    ).toContain('(business_id, lower(alias))');

    // Y lo que la hace única de verdad: no filtra por `deleted_at`. Un `where
    // deleted_at is null` acá devolvería el alias a la bolsa en cuanto la fila se
    // da de baja, y el `auth.users` de esa fila puede seguir vivo: el mismo
    // identificador volvería a pertenecer a dos personas a la vez.
    expect(
      idx[0].indexdef,
      'el índice de alias lleva un predicado. Un índice único sobre ' +
        '`(business_id, lower(alias)) where deleted_at is null` deja reciclar el ' +
        'alias de una fila dada de baja, que es justo lo que §4.1 dice que no ' +
        'puede pasar.',
    ).not.toContain('WHERE');
  });

  test('una persona es UN miembro por negocio', async () => {
    const uniq = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ conname: string; def: string }[]>(
          `
          select conname, pg_get_constraintdef(oid) as def
          from pg_constraint
          where conrelid = 'public.business_members'::regclass
            and contype = 'u'
          order by conname`,
        )
        .then((rows) => plainRows(rows)),
    );

    // La DEFINICIÓN, no el conteo. `toEqual` sobre la lista entera dice las tres
    // cosas a la vez: que hay exactamente una, que se llama como dice el ledger, y
    // que es sobre esas dos columnas en ese orden. Un `expect(uniq).toHaveLength(1)`
    // pasaría contra una unique sobre `(user_id, business_id)`, que forbids las
    // mismas parejas pero no dice qué garantiza, y contra una unique sobre
    // `(business_id, role)`, que forbids algo que nadie decidió.
    expect(
      uniq.map((u) => ({ conname: u.conname, def: u.def })),
      'una persona es UN miembro por negocio con UN rol. Sin esta unicidad el ' +
        'API puede dar de alta dos membresías de la misma persona en el mismo ' +
        'negocio con roles distintos, y business_member_role() tendría que elegir ' +
        'una al azar. El alcance sobre varias sucursales son varias filas en ' +
        'business_member_locations, no varias membresías.',
    ).toEqual([
      {
        conname: 'business_members_business_id_user_id_key',
        def: 'UNIQUE (business_id, user_id)',
      },
    ]);

    // Y que la constraint MUERDA, que es distinto de que exista: una fila en el
    // catálogo que no impide nada es la mitad de la garantía.
    //
    // DOS inserts del MISMO par `(business_id, user_id)` con alias DISTINTOS. El
    // alias tiene que ser distinto a propósito: si fuera el mismo, el rechazo
    // podría venir del índice de alias y la prueba afirmaría algo que no midió.
    // Con alias distintos lo único que puede rechazar el segundo es la unicidad de
    // la pareja. Y son dos inserts y no un duplicado de una fila que ya existe
    // porque la tabla está vacía cuando corre este bloque: el backfill del
    // `describe` de abajo todavía no pasó, y una prueba atada a ese orden deja de
    // probar lo que dice en cuanto alguien reordena los bloques.
    const first = BUSINESSES[0] as (typeof BUSINESSES)[number];
    const owner = OWNERS[0] as (typeof OWNERS)[number];
    const membership = (alias: string) => `
      insert into public.business_members (business_id, user_id, role, label, alias)
      values ('${first.id}', '${owner.id}', 'staff', 'duplicado', '${alias}')`;
    const denial = await rolledBack(ctx.sql, async (tx) => {
      await tx.unsafe(membership('dup-a@rls-business-members.test'));
      await tx.unsafe(membership('dup-b@rls-business-members.test'));
    });
    expect(
      denial,
      'una segunda membresía del mismo dueño en el mismo negocio pasó. La ' +
        'constraint existe en el catálogo pero no impide nada.',
    ).toBe('23505');
  });

  test('business_members y business_member_locations no tienen policy de escritura', async () => {
    // Anti-vacuity primero: un conjunto vacío de policies es EXACTAMENTE lo que
    // devuelve una base donde las dos tablas no existen. El denominador se prueba
    // real antes de probar el numerador limpio, como en el resto del directorio.
    const tables = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ relname: string }[]>(
          `
          select c.relname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('business_members','business_member_locations')
          order by c.relname`,
        )
        .then((rows) => plainRows(rows)),
    );
    expect(
      tables.map((t) => t.relname),
      'una de las dos tablas no existe, así que "no tiene policy" es cierto por ' +
        'la razón equivocada: no hay nada que abrir.',
    ).toEqual(['business_member_locations', 'business_members']);

    // SOLO las policies de ESCRITURA. La aserción se escribió cuando las dos
    // tablas no tenían NINGUNA policy, y el filtro `cmd <> 'SELECT'` es lo que la
    // mantiene diciendo lo que su nombre dice desde que existen las tres de
    // lectura del §6.2: un conjunto de policies enteramente vacío seguiría
    // dando verde, y en una base donde las dos tablas no tienen ni una sola policy
    // ese `toEqual([])` es cierto por la razón equivocada — no hay nada que abrir.
    // El predicado escrito es el que sobrevive a las policies de lectura, y la
    // contraparte positiva — que existen EXACTAMENTE las tres del §6.2 y ninguna
    // más — está en el bloque de la §6.2 de este archivo.
    const policies = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ tablename: string; cmd: string }[]>(
          `
          select tablename, cmd
          from pg_policies
          where schemaname = 'public'
            and tablename in ('business_members','business_member_locations')
            and cmd <> 'SELECT'
          order by tablename, cmd`,
        )
        .then((rows) => plainRows(rows)),
    );

    // El conjunto vacío es la aserción. Una policy de escritura que apareciera
    // acá no sale como un fallo que nombre la tabla, sino como una lista que se
    // vació, y el lector tiene que mirar los nombres para saber cuál.
    expect(
      policies.map((p) => `${p.tablename}:${p.cmd}`),
      'business_members y business_member_locations no se escriben desde el ' +
        'cliente: el alta de accesos requiere service_role, que está fuera de ' +
        'una sesión normal. Lo que frena la escritura es la ausencia de policy, ' +
        'así que una que aparezca cambia el perímetro y tiene que verse.',
    ).toEqual([]);
  });
});

describe('el backfill de dueños', () => {
  /**
   * How many `business_members` rows the seeded owners hold right now.
   *
   * Read over the fixture's own businesses rather than with a global count: the
   * three tables above it are asserted on their SCHEMA, and a global count would
   * couple those tests to whatever the backfill test has already written.
   */
  function seededMemberRows(): Promise<number> {
    return as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ n: number }[]>(
          `
          select count(*)::int as n from public.business_members m
          where m.business_id in (${BUSINESSES.map((b) => `'${b.id}'`).join(', ')})`,
        )
        .then((rows) => plainRows(rows)[0]?.n ?? -1),
    );
  }

  test('todo dueño de business_ownership es un miembro owner', async () => {
    // Anti-vacuity first, and it is two assertions in one: the fixture exists,
    // and the backfill has not touched it yet. Without the second, `n = 0` is
    // also what a ledger where the backfill inserts nothing reports, and this
    // file would be green against a migration that moves nobody. This is why the
    // test seeds its own owners rather than trusting the replay: the replayed
    // database has zero `business_ownership` rows, because the two seed
    // migrations that would have carried them are the documented, irreproducible
    // ones in `KNOWN_REPLAY_FAILURES`.
    const owners = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ n: number }[]>(
        `select count(*)::int as n from public.business_ownership o
         where o.business_id in (${BUSINESSES.map((b) => `'${b.id}'`).join(', ')})`,
      ),
    );
    expect(
      plainRows(owners)[0]?.n,
      'el fixture de dueños no está en la base, así que "todo dueño es miembro" ' +
        'es cierto porque no hay dueños.',
    ).toBe(BUSINESSES.length);
    expect(
      await seededMemberRows(),
      'el backfill ya corrió sobre este fixture antes de tiempo: el test que ' +
        'sigue no va a poder distinguir una migración que funciona de una que no ' +
        'inserta nada.',
    ).toBe(0);

    await applyBackfill();

    const orphans = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ n: number }[]>(`
      select count(*)::int as n from public.business_ownership o
      where not exists (
        select 1 from public.business_members m
        where m.business_id = o.business_id
          and m.user_id = o.owner_id
          and m.role = 'owner'
          and m.deleted_at is null
      )`),
    );
    expect(orphans[0].n).toBe(0);

    // Y el otro lado de "exactamente una": cero es lo que dice que ningún dueño
    // se quedó atrás, y no dice nada de que no haya también filas de más. Un
    // backfill que duplicara por el `join` a `businesses` pasaría el `orphans`.
    expect(
      await seededMemberRows(),
      'el backfill produjo más de una fila de miembro por dueño, o menos de una. ' +
        'El conteo tiene que ser exactamente el de los dueños sembrados, y son ' +
        `${BUSINESSES.length} negocios y no ${OWNERS.length} dueños: el dueño ` +
        'repetido tiene que producir una fila por negocio.',
    ).toBe(BUSINESSES.length);
  });

  test('el miembro owner lleva el alias del correo y el label del negocio', async () => {
    await applyBackfill();

    // El `alias` es lo que la persona teclea y espeja `auth.users.email`: un
    // backfill que lo dejara vacío o duplicado no rompe una constraint visible,
    // rompe el acceso. Y el `label` del dueño es el NOMBRE DEL NEGOCIO, no el de
    // una persona: en la UI esa fila representa al dueño, no a un humano con
    // nombre.
    //
    // Y el dueño repetido aparece DOS veces con el MISMO alias, que es lo
    // correcto y no una excepción: el alias único es por negocio, así que un
    // dueño en dos negocios son dos accesos. Contra el índice global esto no
    // llegaba ni a la aserción.
    const rows = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<
          { business_id: string; role: string; label: string; alias: string }[]
        >(
          `
          select business_id, role::text, label, alias
          from public.business_members
          where business_id in (${BUSINESSES.map((b) => `'${b.id}'`).join(', ')})
          order by business_id`,
        )
        .then((r) => plainRows(r)),
    );

    expect(
      rows.map((m) => ({
        business_id: m.business_id,
        role: m.role,
        label: m.label,
        alias: m.alias,
      })),
    ).toEqual(
      BUSINESSES.map((business) => ({
        business_id: business.id,
        role: 'owner',
        label: business.name,
        alias: (OWNERS[business.owner] as (typeof OWNERS)[number]).email,
      })),
    );
  });

  test('el backfill se puede volver a correr sin duplicar miembros', async () => {
    await applyBackfill();
    await applyBackfill();

    // `on conflict (business_id, user_id) do nothing` es la mitad del contrato:
    // esta migración corre una vez por máquina, pero el archivo se replayea en
    // cada `db push` a un entorno que ya lo corrió, y una migración de datos que
    // no es re-ejecutable convierte cada replay en un error de unicidad.
    expect(await seededMemberRows()).toBe(BUSINESSES.length);
  });
});

describe('los helpers de permiso', () => {
  let ctx: SupabaseTestDb;

  const OWNER_A = '44444444-4444-4444-4444-444444444444';
  const MEMBER_STAFF_A = '66666666-6666-6666-6666-666666666666';
  const MEMBER_MANAGER = '77777777-7777-7777-7777-777777777777';
  const MEMBER_DISABLED = '88888888-8888-8888-8888-888888888888';
  const MEMBER_DELETED = '99999999-9999-9999-9999-999999999999';
  const MEMBER_STALE = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const BIZ_A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const BIZ_B = 'aaaaaaaa-0000-4000-8000-000000000002';
  const BIZ_C = 'aaaaaaaa-0000-4000-8000-000000000003';
  const BIZ_D = 'aaaaaaaa-0000-4000-8000-000000000004';
  const LOC_A = 'bbbbbbbb-0000-4000-8000-000000000001';
  const LOC_B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const LOC_BZ = 'cccccccc-0000-4000-8000-000000000001';

  const M_OWNER = 'd0000000-0000-4000-8000-000000000001';
  const M_STAFF = 'd0000000-0000-4000-8000-000000000002';
  const M_MANAGER = 'd0000000-0000-4000-8000-000000000003';
  const M_DISABLED = 'd0000000-0000-4000-8000-000000000004';
  const M_DELETED = 'd0000000-0000-4000-8000-000000000005';
  const M_STALE = 'd0000000-0000-4000-8000-000000000006';
  const M_STALE_OWNER = 'd0000000-0000-4000-8000-000000000007';
  const M_ETERNAL = 'd0000000-0000-4000-8000-000000000008';
  const M_UNSTAMPED = 'd0000000-0000-4000-8000-000000000009';
  const M_CROSS = 'd0000000-0000-4000-8000-00000000000a';
  const M_MULTI_A = 'd0000000-0000-4000-8000-00000000000b';
  const M_MULTI_B = 'd0000000-0000-4000-8000-00000000000c';
  const M_SHADOW_A = 'd0000000-0000-4000-8000-00000000000d';
  const M_SHADOW_B = 'd0000000-0000-4000-8000-00000000000e';
  const M_PAUSED = 'd0000000-0000-4000-8000-00000000000f';
  const M_SIDE_A = 'd0000000-0000-4000-8000-000000000010';
  const M_SIDE_B = 'd0000000-0000-4000-8000-000000000011';
  const M_PAUSED_DELETED = 'd0000000-0000-4000-8000-000000000012';

  const MEMBER_STALE_OWNER = 'aaaaaaaa-0000-4000-8000-00000000000b';
  const MEMBER_ETERNAL = 'aaaaaaaa-0000-4000-8000-00000000000c';
  const MEMBER_UNSTAMPED = 'aaaaaaaa-0000-4000-8000-00000000000d';
  const MEMBER_CROSS = 'aaaaaaaa-0000-4000-8000-00000000000e';
  const MEMBER_MULTI = 'aaaaaaaa-0000-4000-8000-00000000000f';
  const MEMBER_SHADOW = 'aaaaaaaa-0000-4000-8000-000000000010';
  const MEMBER_NOBODY = 'aaaaaaaa-0000-4000-8000-000000000011';
  const MEMBER_PAUSED = 'aaaaaaaa-0000-4000-8000-000000000012';
  const MEMBER_PAUSED_SIDE = 'aaaaaaaa-0000-4000-8000-000000000013';
  const MEMBER_PAUSED_DELETED = 'aaaaaaaa-0000-4000-8000-000000000014';

  beforeAll(async () => {
    ctx = await createSupabaseTestDb();

    await ctx.sql.begin(async (tx) => {
      for (const id of [
        OWNER_A,
        MEMBER_STAFF_A,
        MEMBER_MANAGER,
        MEMBER_DISABLED,
        MEMBER_DELETED,
        MEMBER_STALE,
        MEMBER_STALE_OWNER,
        MEMBER_ETERNAL,
        MEMBER_UNSTAMPED,
        MEMBER_CROSS,
        MEMBER_MULTI,
        MEMBER_SHADOW,
        MEMBER_NOBODY,
        MEMBER_PAUSED,
        MEMBER_PAUSED_SIDE,
        MEMBER_PAUSED_DELETED,
      ]) {
        await tx.unsafe(
          `insert into auth.users (id, email, raw_user_meta_data)
           values ('${id}', 'helper-${id}@test', '{"role":"business"}'::jsonb)
           on conflict (id) do nothing`,
        );
      }

      await tx.unsafe(
        `insert into public.businesses (id, name, type, slug)
         values ('${BIZ_A}', 'Helper Biz A', 'restaurant', 'helper-biz-a'),
                ('${BIZ_B}', 'Helper Biz B', 'restaurant', 'helper-biz-b'),
                ('${BIZ_C}', 'Helper Biz C', 'restaurant', 'helper-biz-c'),
                ('${BIZ_D}', 'Helper Biz D', 'restaurant', 'helper-biz-d')`,
      );

      // El catálogo de planes se mide sobre cuatro negocios y no sobre uno
      // mutado entre aserciones: BIZ_A es `pro`, BIZ_B es `pro_plus`, BIZ_C NO
      // tiene fila (ausente = `free`) y BIZ_D tiene una fila `pro` con
      // `deleted_at`, que también tiene que leerse como `free`.
      await tx.unsafe(
        `insert into public.business_plans_state (business_id, plan_code, deleted_at)
         values ('${BIZ_A}', 'pro', null),
                ('${BIZ_B}', 'pro_plus', null),
                ('${BIZ_D}', 'pro', now())`,
      );

      await tx.unsafe(
        `insert into public.business_ownership (business_id, owner_id)
         values ('${BIZ_A}', '${OWNER_A}')`,
      );

      await tx.unsafe(
        `insert into public.business_locations (id, business_id, name, address, latitude, longitude)
         values ('${LOC_A}', '${BIZ_A}', 'A main', 'Street', 40.41680000, -3.70380000),
                ('${LOC_B}', '${BIZ_A}', 'A second', 'Street2', 40.41680000, -3.70380000),
                ('${LOC_BZ}', '${BIZ_B}', 'B main', 'Street', 40.41680000, -3.70380000)`,
      );

      await tx.unsafe(
        `insert into public.business_members
           (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, created_at, deleted_at)
         values
           ('${M_OWNER}', '${BIZ_A}', '${OWNER_A}', 'owner', 'Owner', 'helper-owner@test', 'active', 24, now(), now(), null),
           ('${M_STAFF}', '${BIZ_A}', '${MEMBER_STAFF_A}', 'staff', 'Staff', 'helper-staff@test', 'active', 24, now(), now(), null),
           ('${M_MANAGER}', '${BIZ_A}', '${MEMBER_MANAGER}', 'manager', 'Manager', 'helper-manager@test', 'active', 24, now(), now(), null),
           ('${M_DISABLED}', '${BIZ_A}', '${MEMBER_DISABLED}', 'staff', 'Disabled', 'helper-disabled@test', 'disabled', 24, now(), now(), null),
           ('${M_DELETED}', '${BIZ_A}', '${MEMBER_DELETED}', 'staff', 'Deleted', 'helper-deleted@test', 'active', 24, now(), now(), now()),
           ('${M_STALE}', '${BIZ_A}', '${MEMBER_STALE}', 'staff', 'Stale', 'helper-stale@test', 'active', 24, now() - interval '26 hours', now(), null),
           ('${M_STALE_OWNER}', '${BIZ_A}', '${MEMBER_STALE_OWNER}', 'owner', 'Owner vencido', 'helper-owner-vencido@test', 'active', 24, now() - interval '3 days', now(), null),
           ('${M_ETERNAL}', '${BIZ_A}', '${MEMBER_ETERNAL}', 'staff', 'Equipo propio', 'helper-eterno@test', 'active', 0, now() - interval '10 years', now(), null),
           ('${M_UNSTAMPED}', '${BIZ_A}', '${MEMBER_UNSTAMPED}', 'staff', 'Sin sello', 'helper-sin-sello@test', 'active', 24, null, now(), null),
           ('${M_CROSS}', '${BIZ_A}', '${MEMBER_CROSS}', 'staff', 'Alcance cruzado', 'helper-cruzado@test', 'active', 24, now(), now(), null),
           ('${M_MULTI_A}', '${BIZ_A}', '${MEMBER_MULTI}', 'staff', 'Dos negocios A', 'helper-dos-a@test', 'active', 24, now(), now(), null),
           ('${M_MULTI_B}', '${BIZ_B}', '${MEMBER_MULTI}', 'staff', 'Dos negocios B', 'helper-dos-b@test', 'active', 24, now(), now(), null),
           ('${M_SHADOW_A}', '${BIZ_A}', '${MEMBER_SHADOW}', 'staff', 'Sombra activa', 'helper-sombra-a@test', 'active', 24, now(), now(), null),
           ('${M_SHADOW_B}', '${BIZ_B}', '${MEMBER_SHADOW}', 'staff', 'Sombra vieja', 'helper-sombra-b@test', 'disabled', 24, now(), now() - interval '2 days', null),
           ('${M_PAUSED}', '${BIZ_A}', '${MEMBER_PAUSED}', 'staff', 'Pausado', 'helper-pausado@test', 'disabled', 24, now(), now(), null),
           ('${M_SIDE_A}', '${BIZ_A}', '${MEMBER_PAUSED_SIDE}', 'staff', 'Activo con un negocio pausado', 'helper-pausado-lado-a@test', 'active', 24, now(), now(), null),
           ('${M_SIDE_B}', '${BIZ_B}', '${MEMBER_PAUSED_SIDE}', 'staff', 'Pausado en el otro', 'helper-pausado-lado-b@test', 'disabled', 24, now(), now(), null),
           ('${M_PAUSED_DELETED}', '${BIZ_A}', '${MEMBER_PAUSED_DELETED}', 'staff', 'Pausado y borrado', 'helper-pausado-borrado@test', 'disabled', 24, now(), now(), now())`,
      );

      await tx.unsafe(
        `insert into public.business_member_locations (member_id, location_id, deleted_at)
         values
           ('${M_STAFF}', '${LOC_A}', null),
           ('${M_MANAGER}', '${LOC_A}', null),
           ('${M_MANAGER}', '${LOC_B}', null),
           ('${M_DISABLED}', '${LOC_A}', null),
           ('${M_DELETED}', '${LOC_A}', null),
           ('${M_STALE}', '${LOC_A}', null),
           ('${M_ETERNAL}', '${LOC_A}', null),
           ('${M_UNSTAMPED}', '${LOC_A}', null),
           ('${M_CROSS}', '${LOC_BZ}', null),
           ('${M_MULTI_A}', '${LOC_A}', null),
           ('${M_MULTI_B}', '${LOC_BZ}', null),
           ('${M_SHADOW_A}', '${LOC_A}', null),
           ('${M_SHADOW_B}', '${LOC_BZ}', null),
           ('${M_PAUSED}', '${LOC_A}', null),
           ('${M_SIDE_A}', '${LOC_A}', null),
           ('${M_SIDE_B}', '${LOC_BZ}', null),
           ('${M_PAUSED_DELETED}', '${LOC_A}', null)`,
      );
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function canManage(
    userId: string,
    businessId: string,
    locationId: string,
  ) {
    const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ ok: boolean }[]>(
        `select public.can_manage_location('${businessId}', '${locationId}') as ok`,
      ),
    );
    return r[0].ok;
  }

  /**
   * The whole session-state object, as the client sees it.
   *
   * `businessId` null is the zero-arg call of the brief: it is only honest when
   * the person has exactly one active membership, and §5.2 spells out what the
   * other two cases return.
   */
  async function sessionState(
    userId: string,
    businessId: string | null = null,
  ) {
    const call = businessId
      ? `public.business_member_session_state('${businessId}')`
      : `public.business_member_session_state()`;
    const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ state: Record<string, unknown> }[]>(
        `select ${call} as state`,
      ),
    );
    return r[0].state;
  }

  /**
   * "¿esta sesión está viva para este negocio?", as the policies ask it.
   *
   * The `::uuid` matters for the same reason it does in `canManage`: the
   * argument is a bare string literal and Postgres would read the bare name as
   * the enum type of the same name rather than as a function call.
   */
  async function sessionValid(userId: string, businessId: string) {
    const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ ok: boolean }[]>(
        `select public.business_member_session_valid('${businessId}'::uuid) as ok`,
      ),
    );
    return r[0].ok;
  }

  /**
   * The caller's own role, read as `authenticated` so the grant is exercised.
   *
   * The `::uuid` on the argument is load bearing and not decoration: the
   * function is called `business_member_role`, which is ALSO the name of the
   * enum, and `name('literal')` is the generic type-cast production of the
   * grammar. With an untyped string literal Postgres does not look for a
   * function at all — it tries `business_member_role('aaaa…'::business_member_role)`
   * and answers `22P02 invalid input value for enum`. A uuid column or an
   * explicit cast resolves to the function, which is why the policies of the
   * §6.2 work and why a PostgREST `rpc/business_member_role` with a JSON string
   * does not.
   */
  async function memberRole(userId: string, businessId: string) {
    const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ role: string | null }[]>(
        `select public.business_member_role('${businessId}'::uuid)::text as role`,
      ),
    );
    return r[0].role;
  }

  /**
   * Every feature of the enum, resolved for one business.
   *
   * The keys come from `enum_range`, NOT from a hand-written list, so adding a
   * fourth `business_feature` shows up here as an extra key and the `toEqual`
   * below fails until someone says what it costs in each plan. A hand-written
   * list would quietly stop covering the new value.
   */
  async function featuresOf(userId: string, businessId: string) {
    const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ feature: string; ok: boolean }[]>(`
        select f.feature, public.business_has_feature('${businessId}', f.feature) as ok
        from unnest(enum_range(null::public.business_feature)) as f(feature)
        order by f.feature`),
    );
    return Object.fromEntries(plainRows(r).map((row) => [row.feature, row.ok]));
  }

  test('un staff solo administra las sucursales de su alcance', async () => {
    expect(await canManage(MEMBER_STAFF_A, BIZ_A, LOC_A)).toBe(true);
    expect(await canManage(MEMBER_STAFF_A, BIZ_A, LOC_B)).toBe(false);
    expect(await canManage(MEMBER_STAFF_A, BIZ_B, LOC_A)).toBe(false);
  });

  test('el owner administra todo el negocio y el manager también', async () => {
    expect(await canManage(OWNER_A, BIZ_A, LOC_A)).toBe(true);
    expect(await canManage(OWNER_A, BIZ_A, LOC_B)).toBe(true);
    expect(await canManage(MEMBER_MANAGER, BIZ_A, LOC_B)).toBe(true);
  });

  test('un acceso deshabilitado no administra nada', async () => {
    expect(await canManage(MEMBER_DISABLED, BIZ_A, LOC_A)).toBe(false);
  });

  test('un miembro borrado no administra nada', async () => {
    expect(await canManage(MEMBER_DELETED, BIZ_A, LOC_A)).toBe(false);
  });

  test('la sesión vencida se distingue de la no autorizada', async () => {
    const state = await sessionState(MEMBER_STALE);
    expect(state.reason).toBe('session_expired');
    // El rol sigue siendo staff: lo que venció es la sesión, no el derecho.
    expect(state.role).toBe('staff');
  });

  // ─── LA SUCURSAL TIENE QUE SER DEL NEGOCIO ─────────────────────────────────
  //
  // `business_member_locations.location_id` no lleva ninguna restricción que lo
  // ate al `business_id` del miembro, así que la fila malformada es
  // representable y el permiso tiene que comprobar el negocio de la sucursal por
  // su cuenta. Y la comprobación es para TODOS los roles: `owner` y `manager`
  // reciben el negocio entero, y el negocio entero no incluye las sucursales
  // del vecino.

  test('una fila de alcance que apunta a la sucursal de otro negocio no concede nada', async () => {
    // Anti-vacuity primero: la fila malformada EXISTE. Sin esto, el `false` de
    // abajo podría ser cierto porque el fixture no se sembró, que es el modo de
    // falla más probable de un `insert` con una columna equivocada.
    const scope = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ location_id: string; business_id: string }[]>(`
          select l.location_id, bl.business_id
          from public.business_member_locations l
          join public.business_locations bl on bl.id = l.location_id
          where l.member_id = '${M_CROSS}' and l.deleted_at is null`),
    );
    expect(
      plainRows(scope),
      'la fila de alcance cruzada no se sembró, así que el false de abajo no ' +
        'demuestra que la función la rechace: demuestra que no hay nada que rechazar.',
    ).toEqual([{ location_id: LOC_BZ, business_id: BIZ_B }]);

    expect(await canManage(MEMBER_CROSS, BIZ_A, LOC_BZ)).toBe(false);
    // Y los dos roles que reciben el negocio entero también la rechazan.
    expect(await canManage(OWNER_A, BIZ_A, LOC_BZ)).toBe(false);
    expect(await canManage(MEMBER_MANAGER, BIZ_A, LOC_BZ)).toBe(false);
  });

  test('una sucursal del propio negocio sigue valiendo para los tres roles', async () => {
    expect(await canManage(MEMBER_STAFF_A, BIZ_A, LOC_A)).toBe(true);
    expect(await canManage(MEMBER_MANAGER, BIZ_A, LOC_A)).toBe(true);
    expect(await canManage(OWNER_A, BIZ_A, LOC_A)).toBe(true);
  });

  // ─── EL TTL ES DE TODOS LOS ROLES ──────────────────────────────────────────
  //
  // El §5.2 no abre excepción para dueño ni gerente, y el §9.2 les ofrece el
  // modo equipo con `session_ttl_hours = 0`: se espera que su TTL venza. Un
  // dueño con la sesión de hace tres días no puede ver el panel diciendo
  // "venció tu sesión" mientras RLS le concede todo.

  test('el TTL vence para todos los roles y no inventa una expiración sin sello', async () => {
    expect(await canManage(MEMBER_STALE, BIZ_A, LOC_A)).toBe(false);
    expect(await canManage(MEMBER_STALE_OWNER, BIZ_A, LOC_A)).toBe(false);

    // `session_ttl_hours = 0` se salta la comprobación PARA TODOS, y el sello
    // puede tener diez años.
    expect(await canManage(MEMBER_ETERNAL, BIZ_A, LOC_A)).toBe(true);
    const eternal = await sessionState(MEMBER_ETERNAL);
    expect(eternal.reason).toBe('ok');
    expect(eternal.expires_at).toBeNull();

    // Una membresía sin sello NUNCA tuvo sesión que expirar. Decir `expired` con
    // `expires_at: null` le dice al panel que busque una fecha que no existe.
    expect(await canManage(MEMBER_UNSTAMPED, BIZ_A, LOC_A)).toBe(false);
    const unstamped = await sessionState(MEMBER_UNSTAMPED);
    expect(unstamped.reason).toBe('session_never_stamped');
    expect(unstamped.expires_at).toBeNull();

    // Y `session_expired` llega con la fecha en que de verdad venció.
    const expired = await sessionState(MEMBER_STALE);
    expect(expired.reason).toBe('session_expired');
    expect(expired.expires_at).not.toBeNull();
  });

  // ─── LA QUE AUTORIZA Y LA QUE EXPLICA CUENTAN LA MISMA HISTORIA ─────────────
  //
  // No basta con medir las dos por separado: la mitad del defecto que se está
  // corrigiendo es justamente que cada una por su cuenta parecía correcta. Esta
  // matriz ata las dos en cada persona, y por eso falla si el TTL se acorta a
  // `staff`, si se invierte el `> 0`, o si una de las dos se queda con la copia
  // vieja de la regla.
  //
  // OJO CON EL ALCANCE DE ESTA MATRIZ. `granted === (reason === 'ok')` es la
  // invariante para quien tiene UNA membresía activa, que es toda la lista de
  // acá. `multiple_businesses`, `no_membership` y `disabled` son razones de
  // SELECCIÓN, no de autorización: un dueño de dos negocios no es `ok` en la
  // llamada sin argumento y aun así administra BIZ_A, y un pausado no administra
  // nada pero tampoco es un desconocido. Meter a esas personas en esta matriz las
  // haría fallar por la razón equivocada, y el próximo que lo lea va a ir a
  // buscar un bug de permisos donde solo hay una razón de selección.

  test('la que autoriza y la que explica nunca se contradicen', async () => {
    const personas: readonly { id: string; label: string }[] = [
      { id: OWNER_A, label: 'owner con sesión al día' },
      { id: MEMBER_STAFF_A, label: 'staff con sesión al día' },
      { id: MEMBER_MANAGER, label: 'manager con sesión al día' },
      { id: MEMBER_ETERNAL, label: 'staff sin TTL' },
      { id: MEMBER_STALE, label: 'staff con sesión vencida' },
      { id: MEMBER_STALE_OWNER, label: 'owner con sesión vencida' },
      { id: MEMBER_UNSTAMPED, label: 'staff sin sello' },
    ];
    for (const persona of personas) {
      const state = await sessionState(persona.id);
      const granted = await canManage(persona.id, BIZ_A, LOC_A);
      expect(
        granted,
        `${persona.label}: can_manage_location dijo ${granted} sobre LOC_A y ` +
          `session_state dijo "${state.reason}". Una de las dos está contando ` +
          'una historia que la otra no cuenta.',
      ).toBe(state.reason === 'ok');
    }
  });

  // ─── EL TERCER HELPERS DE SESIÓN, Y QUE NO SE SEPARE DEL QUE EXPLICA ───────
  //
  // `business_member_session_valid` es el helper que `20261015024825` colgó de
  // las policies que resuelven POR ROL, que hasta entonces no tenían TTL: una
  // sesión vencida entraba igual a `business_hours`, a `coupons`, a la fila del
  // negocio y a la lista del equipo.
  //
  // El riesgo de un segundo que cuenta la expiración es que se aparte del
  // primero. Si esta cuenta dijera "viva" donde la otra dice "vencida", el
  // panel le explicaría al usuario una salida que las policies no le negaron, y
  // nadie se enteraría: no hay error, hay una sesión que dura de más.
  //
  // Esta matriz es la del §5.2 entera y ata las dos por persona, así que falla
  // si alguien acorta el TTL a `staff`, si invierte el `> 0`, o si una de las
  // dos se queda con una cuenta vieja.

  test('la que autoriza por rol y la que explica nunca se contradicen', async () => {
    const personas: readonly { id: string; label: string }[] = [
      { id: OWNER_A, label: 'owner con sesión al día' },
      { id: MEMBER_MANAGER, label: 'manager con sesión al día' },
      { id: MEMBER_STAFF_A, label: 'staff con sesión al día' },
      { id: MEMBER_ETERNAL, label: 'staff sin TTL' },
      { id: MEMBER_STALE, label: 'staff con sesión vencida' },
      { id: MEMBER_STALE_OWNER, label: 'owner con sesión vencida' },
      { id: MEMBER_UNSTAMPED, label: 'staff sin sello' },
    ];
    for (const persona of personas) {
      const state = await sessionState(persona.id);
      const valid = await sessionValid(persona.id, BIZ_A);
      expect(
        valid,
        `${persona.label}: session_valid dijo ${valid} y session_state dijo ` +
          `"${state.reason}". Una de las dos está contando una historia que la ` +
          'otra no cuenta, y la que va a equivocar es la que concede.',
      ).toBe(state.reason === 'ok');
    }

    // ─── LA CUENTA ESTÁ EN UN SITIO, Y ESO SE AFIRMA SOBRE EL CATÁLOGO ─────────
    //
    // tres cuentan la misma historia. Es una línea
    // de defensa de último recurso: si dos copias de la aritmética se apartan,
    // la matriz falla cuando alguien tropieza con el caso, no cuando alguien
    // reintroduce el duplicado. Lo que hace falta es que la redundancia no exista.
    //
    // Por eso esto mira el CUERPO de las cuatro funciones y no su respuesta:
    // exactamente una puede tener escrita la cuenta, y las otras tres tienen que
    // llamarla.
    //
    // Y se afirma la SUSTANCIA —`security definer`, `search_path = ''`, la lista
    // de argumentos, la volatilidad— y no el texto entero del `functiondef`. Un
    // cuerpo pegado con sus saltos de línea y sus espacios falla el test con un
    // reformateo que no cambia una sola cosa del comportamiento, y un test que se
    // rompe por eso enseña a ignorar los que importan.
    const ttlShapes = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<
        {
          fn: string;
          args: string;
          secdef: boolean;
          volatile: string;
          search_path: string | null;
          computes_inline: boolean;
          calls_shared: boolean;
        }[]
      >(`
        select p.proname as fn,
               pg_get_function_identity_arguments(p.oid) as args,
               p.prosecdef as secdef,
               p.provolatile as volatile,
               p.proconfig::text as search_path,
               pg_get_functiondef(p.oid) like '%interval ''1 hour''%' as computes_inline,
               pg_get_functiondef(p.oid) like '%business_member_session_expires_at%'
                 as calls_shared
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('business_member_session_expires_at',
                            'business_member_session_valid',
                            'can_manage_location',
                            'business_member_session_state')
        order by p.proname`),
    );
    expect(
      plainRows(ttlShapes),
      'la cuenta de la expiración volvió a estar copiada, o dejó de estar ' +
        'compartida. Exactamente UNA función puede tener escrita la aritmética ' +
        '—`business_member_session_expires_at`— y las otras tres tienen que ' +
        'llamarla. Con dos copias, la que autoriza y la que explica pueden dejar ' +
        'de contar la misma historia, y el §5.2 dice que no pueden.',
    ).toEqual([
      {
        fn: 'business_member_session_expires_at',
        args: 'p_session_ttl_hours integer, p_last_authenticated_at timestamp with time zone',
        secdef: false,
        volatile: 'i',
        search_path: '{"search_path=\\"\\""}',
        computes_inline: true,
        calls_shared: true,
      },
      {
        fn: 'business_member_session_state',
        args: 'p_business_id uuid',
        secdef: true,
        volatile: 's',
        search_path: '{"search_path=\\"\\""}',
        computes_inline: false,
        calls_shared: true,
      },
      {
        fn: 'business_member_session_valid',
        args: 'p_business_id uuid',
        secdef: true,
        volatile: 's',
        search_path: '{"search_path=\\"\\""}',
        computes_inline: false,
        calls_shared: true,
      },
      {
        fn: 'can_manage_location',
        args: 'p_business_id uuid, p_location_id uuid',
        secdef: true,
        volatile: 's',
        search_path: '{"search_path=\\"\\""}',
        computes_inline: false,
        calls_shared: true,
      },
    ]);

    // Y la cuenta compartida dice lo mismo que la de `can_manage_location` para
    // los mismos tres casos raros: sin TTL, sin sello y vencida. Es la misma
    // pregunta con tres respuestas y un solo lugar donde está escrita.
    //
    // Se pregunta como `authenticated`, que es el rol con el grant y el mismo
    // con el que el motor evalúa las policies. Como `service_role` daría el
    // mismo resultado, y así también se comprueba que el grant está donde tiene
    // que estar y no sólo en una base que tiene privileges de fábrica.
    const expires = await as(ctx.sql, 'authenticated', OWNER_A, (tx) =>
      tx.unsafe<{ ttl: number; hours_ago: number | null; expires: boolean }[]>(`
        select ttl,
               hours_ago,
               public.business_member_session_expires_at(
                 ttl,
                 case when hours_ago is null then null
                      else now() - (hours_ago * interval '1 hour') end
               ) is not null as expires
        from (values (0, 500::int), (24, 500::int), (24, 1::int), (24, null::int))
             as t(ttl, hours_ago)`),
    );
    expect(
      plainRows(expires).map((r) => ({
        ttl: r.ttl,
        hours_ago: r.hours_ago,
        expires: r.expires,
      })),
      'la cuenta compartida de la expiración no distingue los tres casos raros: ' +
        'sin TTL no hay fecha, vencida la hay, y sin sello tampoco.',
    ).toEqual([
      { ttl: 0, hours_ago: 500, expires: false },
      { ttl: 24, hours_ago: 500, expires: true },
      { ttl: 24, hours_ago: 1, expires: true },
      { ttl: 24, hours_ago: null, expires: false },
    ]);
  });

  // ─── LA MEMBRESÍA QUE RESPONDE SE ELIGE ENTRE LAS ACTIVAS ───────────────────

  test('sin argumento la membresía se elige entre las activas, y se avisa cuando hay varias', async () => {
    const multi = await sessionState(MEMBER_MULTI);
    expect(multi.reason).toBe('multiple_businesses');
    expect(multi.role).toBeNull();
    expect(multi.location_ids).toEqual([]);
    expect(multi.business_ids).toEqual([BIZ_A, BIZ_B]);

    // Con el negocio explícito sí responde, y la lista es la de ESE negocio.
    const scoped = await sessionState(MEMBER_MULTI, BIZ_A);
    expect(scoped.reason).toBe('ok');
    expect(scoped.role).toBe('staff');
    expect(scoped.location_ids).toEqual([LOC_A]);
    expect(scoped.business_ids).toEqual([BIZ_A]);

    // La fila deshabilitada es MÁS VIEJA y no puede tapar la activa. Es el mismo
    // bug por otro camino: `order by created_at limit 1` sin `status` en el
    // predicado devuelve el negocio equivocado.
    const shadow = await sessionState(MEMBER_SHADOW);
    expect(shadow.role).toBe('staff');
    expect(shadow.reason).toBe('ok');
    expect(shadow.business_ids).toEqual([BIZ_A]);

    const nobody = await sessionState(MEMBER_NOBODY);
    expect(nobody.reason).toBe('no_membership');
    expect(nobody.role).toBeNull();
    expect(nobody.business_ids).toEqual([]);
  });

  // ─── PAUSAR NO ES NO CONOCER ───────────────────────────────────────────────
  //
  // La razón de existir de esta función es que el panel explique la salida en
  // vez de mostrar un error genérico, y `no_membership` ES el error genérico: el
  // vocabulario del panel ya distingue **pausar** de **dar de baja**, y
  // "disabled corta acceso de inmediato" es requisito de verificación.

  test('una membresía pausada se explica como pausa, no como desconocido', async () => {
    const paused = await sessionState(MEMBER_PAUSED);
    expect(paused.reason).toBe('disabled');
    // `role: null` y sin ubicaciones: la versión anterior devolvía el rol y las
    // sucursales de una membresía a la que ya le revocaron el acceso, y eso es
    // más información de la que necesita un mensaje de "te pausaron".
    expect(paused.role).toBeNull();
    expect(paused.location_ids).toEqual([]);
    expect(paused.expires_at).toBeNull();
    // El negocio pausado no es un negocio en el que se pueda actuar.
    expect(paused.business_ids).toEqual([]);

    // La pausa no abre ningún otro camino: el permiso sigue en false.
    expect(await canManage(MEMBER_PAUSED, BIZ_A, LOC_A)).toBe(false);
    // Y con el negocio explícito la respuesta es la misma.
    expect((await sessionState(MEMBER_PAUSED, BIZ_A)).reason).toBe('disabled');
  });

  test('pausado en un negocio no tapa la membresía activa de otro', async () => {
    // Esta es la combinación que decide dónde va la fila pausada: si se
    // consultara antes de la selección por `status`, esta persona recibiría
    // `disabled` y nunca llegaría al `ok` que BIZ_A le debe.
    const side = await sessionState(MEMBER_PAUSED_SIDE);
    expect(side.reason).toBe('ok');
    expect(side.role).toBe('staff');
    expect(side.location_ids).toEqual([LOC_A]);
    // `business_ids` es la lista de negocios en los que se puede actuar, y una
    // fila pausada no entra en ella.
    expect(side.business_ids).toEqual([BIZ_A]);
    expect(await canManage(MEMBER_PAUSED_SIDE, BIZ_A, LOC_A)).toBe(true);

    // Y el negocio pausado, preguntado de uno en uno, sí responde "disabled".
    const pausedSide = await sessionState(MEMBER_PAUSED_SIDE, BIZ_B);
    expect(pausedSide.reason).toBe('disabled');
    expect(pausedSide.role).toBeNull();
    expect(pausedSide.business_ids).toEqual([]);
    expect(await canManage(MEMBER_PAUSED_SIDE, BIZ_B, LOC_BZ)).toBe(false);
  });

  test('una fila borrada no es una pausa: es nada', async () => {
    // Pausada Y borrada. El sondeo de la fila pausada exige `deleted_at is null`
    // porque una fila borrada no concede nada por ningún camino, pero tampoco es
    // "te pausaron".
    const deleted = await sessionState(MEMBER_PAUSED_DELETED);
    expect(deleted.reason).toBe('no_membership');
    expect(deleted.role).toBeNull();
    expect(deleted.business_ids).toEqual([]);

    // Y la de `MEMBER_DELETED`, que está activa y borrada, tampoco se confunde
    // con una pausa.
    const softDeleted = await sessionState(MEMBER_DELETED);
    expect(softDeleted.reason).toBe('no_membership');
    expect(softDeleted.business_ids).toEqual([]);
  });

  // ─── EL ROL, Y QUIÉN LO PUEDE PREGUNTAR ────────────────────────────────────

  test('el rol se devuelve para el que pregunta, y solo para el', async () => {
    expect(await memberRole(MEMBER_STAFF_A, BIZ_A)).toBe('staff');
    expect(await memberRole(MEMBER_MANAGER, BIZ_A)).toBe('manager');
    expect(await memberRole(OWNER_A, BIZ_A)).toBe('owner');

    // La sesión vencida NO le quita el rol a nadie: lo que venció es la sesión.
    expect(await memberRole(MEMBER_STALE, BIZ_A)).toBe('staff');
    expect(await memberRole(MEMBER_STALE_OWNER, BIZ_A)).toBe('owner');

    // La revocación y el borrado sí: no hay rol porque no hay acceso.
    expect(await memberRole(MEMBER_DISABLED, BIZ_A)).toBeNull();
    expect(await memberRole(MEMBER_DELETED, BIZ_A)).toBeNull();

    // Y de un negocio en el que no es miembro no hay rol.
    expect(await memberRole(MEMBER_STAFF_A, BIZ_B)).toBeNull();
    expect(await memberRole(MEMBER_NOBODY, BIZ_A)).toBeNull();
  });

  test('las policies de la §6.2 necesitan poder llamar a business_member_role', async () => {
    const acl = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<
        {
          fn: string;
          args: string;
          authenticated: boolean;
          anon: boolean;
        }[]
      >(`
          select p.proname as fn,
                 pg_get_function_identity_arguments(p.oid) as args,
                 has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
                 has_function_privilege('anon', p.oid, 'execute') as anon
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('business_member_role', 'can_manage_location',
                              'business_has_feature', 'business_member_session_state',
                              'business_member_session_valid')
          order by p.proname`),
    );

    // Las CINCO, con su firma exacta. Una sexta fila sería una sobrecarga
    // vieja sin revocar: `session_state()` sin argumento y
    // `session_state(p_business_id uuid default null)` se vuelven ambiguas en
    // la llamada de cero argumentos, que es exactamente la del brief.
    expect(
      plainRows(acl).map((r) => ({
        fn: r.fn,
        args: r.args,
        authenticated: r.authenticated,
        anon: r.anon,
      })),
      'las policies de la §6.2 se escriben como ' +
        "`public.business_member_role(business_id) in ('owner','manager')` y las " +
        'evalúa el motor como `authenticated`. Sin este grant, un SELECT de ' +
        'lectura revienta con 42501 permission denied en tiempo de consulta.',
    ).toEqual([
      {
        fn: 'business_has_feature',
        args: 'p_business_id uuid, p_feature business_feature',
        authenticated: true,
        anon: false,
      },
      {
        fn: 'business_member_role',
        args: 'p_business_id uuid',
        authenticated: true,
        anon: false,
      },
      {
        fn: 'business_member_session_state',
        args: 'p_business_id uuid',
        authenticated: true,
        anon: false,
      },
      {
        // El quinto: `20261015024825` lo colgó de las once policies que
        // resuelven por rol, así que sin su grant esas once revientan con 42501
        // en tiempo de consulta, igual que las otras cuatro.
        fn: 'business_member_session_valid',
        args: 'p_business_id uuid',
        authenticated: true,
        anon: false,
      },
      {
        fn: 'can_manage_location',
        args: 'p_business_id uuid, p_location_id uuid',
        authenticated: true,
        anon: false,
      },
    ]);
  });

  // ─── EL CATÁLOGO DE PLANES ─────────────────────────────────────────────────
  //
  // `business_has_feature` es ejecutable por el cliente, gobierna los dos
  // triggers de límites de la §5.3 y lleva el catálogo a mano dentro de SQL. La
  // celda equivocada no rompe nada visible: solo le cobra de más a un plan o le
  // regala una feature de otro.

  test('el catálogo plan → feature es el del §4.5, celda por celda', async () => {
    const expected: readonly {
      label: string;
      business: string;
      features: Record<string, boolean>;
    }[] = [
      {
        label: 'free por ausencia de fila',
        business: BIZ_C,
        features: {
          staff_access: true,
          payments: false,
          visibility_plus: false,
        },
      },
      {
        label: 'free por fila borrada',
        business: BIZ_D,
        features: {
          staff_access: true,
          payments: false,
          visibility_plus: false,
        },
      },
      {
        label: 'pro',
        business: BIZ_A,
        features: {
          staff_access: true,
          payments: true,
          visibility_plus: false,
        },
      },
      {
        label: 'pro_plus',
        business: BIZ_B,
        features: {
          staff_access: true,
          payments: true,
          visibility_plus: true,
        },
      },
    ];

    for (const row of expected) {
      expect(
        await featuresOf(MEMBER_STAFF_A, row.business),
        `el plan ${row.label} no resuelve igual que BUSINESS_PLAN_FEATURES.`,
      ).toEqual(row.features);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * LAS POLICIES DE LA §6.2, Y LOS TRES RPCs QUE RESOLVÍAN AL DUEÑO A MANO.
 *
 * ─── POR QUÉ ESTE BLOQUE, Y POR QUÉ NO ES EL DE ARRIBA ──────────────────────
 *
 * El bloque de los helpers probó que las funciones DICEN la verdad. Este bloque
 * prueba que algo las CONSUME: que las policies de negocio —offers, pedidos,
 * sucursales, y las que no tienen columna de sucursal— y los tres RPCs que
 * aceptan al dueño resuelven por membresía, y no por una fila que el plan 1 va a
 * borrar.
 *
 * ─── EL ORDEN, Y POR QUÉ LAS DOS MITADES ESTÁN AFIRMADAS ─────────────────────
 *
 * El §6.2 pone el orden como invariante: primero las policies nuevas, después se
 * retiran las viejas. Un orden al revés deja al dueño sin panel. Así que la
 * mitad nueva y la mitad vieja conviven, y CONVIVIR es lo que hay que medir: este
 * bloque afirma el conjunto nuevo completo por nombre, y afirma que el conjunto
 * viejo que resuelve por `business_ownership` sigue siendo exactamente el que
 * había antes —19 policies en 12 tablas, medido, no estimado—.
 *
 * El residuo viejo NO es deuda que este bloque perdona: es la fila del ledger que
 * se recoge en la migración siguiente, que es la que hace `drop table`. Afirmar
 * el número exacto es lo que convierte ese `drop` en un diff de una línea: si
 * cambia sin esa migración, alguien escribió una policy a mano.
 *
 * ─── QUIÉN ES QUIÉN EN ESTE FIXTURE ──────────────────────────────────────────
 *
 * `business_ownership` tiene UNA fila: la del dueño de POL_BIZ. No hay fila para
 * el gerente ni para el staff, y esa ausencia es el experimento: las policies
 * viejas no les dicen nada, así que todo lo que vean aquí lo ven por las
 * nuevas. Si el gerente viera algo sin haber fila de dueño, el único camino
 * posible sería la policy nueva.
 *
 * El dueño, en cambio, tiene los dos caminos. Es la mitad de la paridad que este
 * bloque mide: el dueño conserva el acceso que ya tenía (una regresión aquí sería
 * un panel vacío) y encima gana el camino nuevo.
 */
describe('las policies y los RPCs resuelven por membresía', () => {
  let ctx: SupabaseTestDb;

  const POL_OWNER = 'f0000000-0000-4000-8000-000000000001';
  const POL_MANAGER = 'f0000000-0000-4000-8000-000000000002';
  const POL_STAFF = 'f0000000-0000-4000-8000-000000000003';
  const POL_OUTSIDER = 'f0000000-0000-4000-8000-000000000004';
  const POL_CONSUMER = 'f0000000-0000-4000-8000-000000000005';
  const POL_CONSUMER2 = 'f0000000-0000-4000-8000-000000000006';
  const POL_DELETED = 'f0000000-0000-4000-8000-000000000007';
  const POL_PAUSED = 'f0000000-0000-4000-8000-000000000008';
  /**
   * Un dueño con la sesión VENCIDA.
   *
   * Existe para el TTL de las policies que resuelven por ROL, que hasta
   * `20261015024825` no lo tenían en ninguna parte: `business_member_role` no
   * tiene rama de expiración, así que esta persona entraba igual a
   * `business_hours`, a `coupons`, a la fila del negocio y a la lista del
   * equipo. Se usa dueño y no cajero a propósito, porque dueño y gerente son los
   * que reciben el negocio entero y son los que más se habrían servido de la
   * puerta.
   */
  const POL_STALE_OWNER = 'f0000000-0000-4000-8000-000000000009';

  const POL_BIZ = 'f1000000-0000-4000-8000-000000000001';
  const POL_OTHER_BIZ = 'f1000000-0000-4000-8000-000000000002';
  const POL_LOC_A = 'f2000000-0000-4000-8000-000000000001';
  const POL_LOC_B = 'f2000000-0000-4000-8000-000000000002';
  const POL_LOC_OTHER = 'f2000000-0000-4000-8000-000000000003';
  const POL_LOC_NEW = 'f2000000-0000-4000-8000-000000000004';
  /**
   * Una sucursal del propio negocio, cerrada.
   *
   * Existe por un motivo de medición: "Anyone can view active business locations"
   * deja ver TODA sucursal activa de la base, así que un `select` no distingue
   * entre la policy vieja y la nueva. Con una cerrada, la diferencia se ve: el
   * catálogo público no la enseña y la policy por ubicación sí.
   */
  const POL_LOC_CLOSED = 'f2000000-0000-4000-8000-000000000005';

  const M_OWNER = 'f3000000-0000-4000-8000-000000000001';
  const M_MANAGER = 'f3000000-0000-4000-8000-000000000002';
  const M_STAFF = 'f3000000-0000-4000-8000-000000000003';
  const M_OUTSIDER = 'f3000000-0000-4000-8000-000000000004';
  const M_DELETED = 'f3000000-0000-4000-8000-000000000005';
  const M_PAUSED = 'f3000000-0000-4000-8000-000000000006';
  const M_STALE_OWNER = 'f3000000-0000-4000-8000-000000000007';

  const OFFER_A = 'f4000000-0000-4000-8000-000000000001';
  const OFFER_B = 'f4000000-0000-4000-8000-000000000002';
  const OFFER_OTHER = 'f4000000-0000-4000-8000-000000000003';
  /**
   * Una oferta CERRADA de la otra sucursal.
   *
   * Mismo motivo que `POL_LOC_CLOSED`: "Anyone can view active offers" deja ver
   * toda oferta activa de la base, así que un `select` no distingue la policy
   * nueva de la vieja. Con una cerrada, la diferencia se ve, y la respuesta
   * correcta es que el cajero de A no la vea y el gerente sí: la sucursal no es
   * suya, aunque la oferta exista.
   */
  const OFFER_CLOSED = 'f4000000-0000-4000-8000-000000000004';
  const CATEGORY = 'f4000000-0000-4000-8000-00000000000a';
  /**
   * Una segunda categoría, que existe solo para el test de `offer_categories`.
   *
   * `offer_categories` es una tabla puente de dos columnas y su clave primaria es
   * `(offer_id, category_id)`, así que no hay una fila "suelta" que insertar o
   * borrar sin tocar una que ya existe. Con dos categorías, cada aserción mueve
   * una fila propia y el fixture de las demás pruebas queda intacto.
   */
  const CATEGORY_2 = 'f4000000-0000-4000-8000-000000000014';
  const HOUR = 'f4000000-0000-4000-8000-00000000000b';
  const COUPON = 'f4000000-0000-4000-8000-00000000000c';
  const PAYOUT = 'f4000000-0000-4000-8000-00000000000d';
  const PAYMENT_INTENT = 'f4000000-0000-4000-8000-00000000000e';
  const PAYMENT_INTENT_OTHER = 'f4000000-0000-4000-8000-00000000000f';
  const NO_SUCH_ORDER = 'f9000000-0000-4000-8000-000000000000';

  /**
   * Los pedidos, por letra. El estado de cada uno es el que su prueba necesita,
   * y NINGUNA prueba comparte un pedido con otra que lo muta: `cancel_order` y
   * `set_order_status` escriben de verdad, y un test que dependiera del orden de
   * ejecución estaría midiendo el orden en vez de la política.
   *
   *   A   LOC_A  pending            el staff cancela el de su sucursal
   *   B   LOC_B  pending            el staff NO toca el de la otra sucursal
   *   C   LOC_A  confirmed          el consumidor cancela el suyo
   *   D   LOC_A  confirmed          el consumidor NO cancela el de otro
   *   E   LOC_A  completed          un pedido recogido no se cancela
   *   F   LOC_A  pending            el gerente avanza a confirmed
   *   G   LOC_A  ready_for_pickup   `picked_up` está reservada al sistema
   *   H   LOC_A  completed          un pedido completado no retrocede
   *   I   LOC_B  pending            la sucursal ajena no se toca
   *   J   OTHER  confirmed          el negocio ajeno no se toca
   *   K   LOC_A  pending            el mismo estado no es una transición
   *   L   LOC_A  pending            un estado que no existe se rechaza antes
   *   M   LOC_A  ready_for_pickup   el código bueno cierra el pedido
   *   N   LOC_A  ready_for_pickup   el código malo no
   *   O   LOC_A  pending            el pedido no está listo para recoger
   *   P   OTHER  ready_for_pickup   la sucursal del vecino, código incluido
   */
  const ORDER: Record<string, string> = {
    A: 'f5000000-0000-4000-8000-000000000001',
    B: 'f5000000-0000-4000-8000-000000000002',
    C: 'f5000000-0000-4000-8000-000000000003',
    D: 'f5000000-0000-4000-8000-000000000004',
    E: 'f5000000-0000-4000-8000-000000000005',
    F: 'f5000000-0000-4000-8000-000000000006',
    G: 'f5000000-0000-4000-8000-000000000007',
    H: 'f5000000-0000-4000-8000-000000000008',
    I: 'f5000000-0000-4000-8000-000000000009',
    J: 'f5000000-0000-4000-8000-00000000000a',
    K: 'f5000000-0000-4000-8000-00000000000b',
    L: 'f5000000-0000-4000-8000-00000000000c',
    M: 'f5000000-0000-4000-8000-00000000000d',
    N: 'f5000000-0000-4000-8000-00000000000e',
    O: 'f5000000-0000-4000-8000-00000000000f',
    P: 'f5000000-0000-4000-8000-000000000010',
  };
  /**
   * Los pedidos de cada sucursal, por letra.
   *
   * Tres grupos y no dieciséis filas a mano: casi todas las aserciones de este
   * bloque son "ve las de A y no las de B", y el reparto por sucursal es la
   * variable que se está midiendo.
   */
  const AT_A: readonly string[] = [
    'A',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'K',
    'L',
    'M',
    'N',
    'O',
  ];
  const AT_B: readonly string[] = ['B', 'I'];
  const AT_OTHER: readonly string[] = ['J', 'P'];
  const orderIds = (keys: readonly string[]): string[] =>
    keys.map((key) => ORDER[key] as string).sort();

  beforeAll(async () => {
    ctx = await createSupabaseTestDb();

    await ctx.sql.begin(async (tx) => {
      // Las tres mismas claves de Vault que `orders.rls.db.spec.ts` siembra, y por
      // la misma razón: `trg_offer_created_push` y `trg_order_event_push` son
      // AFTER INSERT y `invoke_internal_edge_function` levanta `P0001` sin
      // ellas. Sin las tres no se inserta ni una oferta ni un pedido, y este
      // bloque no tiene qué medir.
      for (const [name, value] of [
        ['supabase_url', 'https://dispatch-stub.invalid'],
        ['supabase_anon_key', 'rls-membership-stub-anon-key'],
        ['internal_secret', 'rls-membership-internal-secret'],
      ] as const) {
        await tx.unsafe(
          `insert into vault.secrets (name, secret) values ('${name}', '${value}')
           on conflict (name) do update set secret = excluded.secret`,
        );
      }

      for (const [name, id] of [
        ['owner', POL_OWNER],
        ['manager', POL_MANAGER],
        ['staff', POL_STAFF],
        ['outsider', POL_OUTSIDER],
        ['consumer', POL_CONSUMER],
        ['consumer2', POL_CONSUMER2],
        ['deleted', POL_DELETED],
        ['paused', POL_PAUSED],
        ['stale-owner', POL_STALE_OWNER],
      ] as const) {
        await tx.unsafe(
          `insert into auth.users (id, email) values ('${id}', '${name}@rls-membership.test')
           on conflict (id) do nothing`,
        );
      }

      await tx.unsafe(`
        insert into public.businesses (id, name, type, slug)
        values ('${POL_BIZ}',       'RLS membership biz',   'restaurant', 'rls-membership-biz'),
               ('${POL_OTHER_BIZ}', 'RLS membership other', 'restaurant', 'rls-membership-other');

        -- UNA fila de dueño, y solo una. Es el experimento: el gerente y el
        -- staff no son dueños de nada, así que cualquier fila que vean vino de
        -- una policy nueva.
        insert into public.business_ownership (business_id, owner_id)
        values ('${POL_BIZ}', '${POL_OWNER}');

        -- El plan NO es decorativo, y desde que los triggers de crecimiento
        -- existen es la razón por la que este negocio puede existir con la
        -- forma que tiene: DOS sucursales activas y TRES membresías que no son
        -- del dueño. Bajo 'free' —1 sucursal y 2 miembros— ese fixture es
        -- imposible de construir, porque el trigger rechazaría la segunda
        -- sucursal y el tercer acceso. Un negocio con dos sucursales es un
        -- negocio 'pro', que es lo que da el §4.5.
        insert into public.business_plans_state (business_id, plan_code)
        values ('${POL_BIZ}', 'pro');

        -- Aprobados y activos porque enforce_offer_business_availability baja
        -- is_active a false de una oferta de un negocio que no lo esté. La
        -- business_finance que usa accrue_order_earnings la escribe el trigger
        -- de bootstrap; no hay que sembrarla.
        update public.business_moderation
           set verification_status = 'approved'
         where business_id in ('${POL_BIZ}', '${POL_OTHER_BIZ}');

        insert into public.business_locations (id, business_id, name, address, latitude, longitude, is_active)
        values ('${POL_LOC_A}',     '${POL_BIZ}',       'A',     'Street A', 40.41680000, -3.70380000, true),
               ('${POL_LOC_B}',     '${POL_BIZ}',       'B',     'Street B', 40.41680000, -3.70380000, true),
               ('${POL_LOC_OTHER}', '${POL_OTHER_BIZ}', 'Other', 'Street O', 40.41680000, -3.70380000, true),
               ('${POL_LOC_CLOSED}','${POL_BIZ}',       'Closed','Street X', 40.41680000, -3.70380000, false);
      `);

      await tx.unsafe(`
        insert into public.business_members
          (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, created_at, deleted_at)
        values
          ('${M_OWNER}',   '${POL_BIZ}',       '${POL_OWNER}',   'owner',   'Dueño',    'membership-owner@test',   'active',   24, now(), now(), null),
          ('${M_MANAGER}', '${POL_BIZ}',       '${POL_MANAGER}', 'manager', 'Gerente',  'membership-manager@test', 'active',   24, now(), now(), null),
          ('${M_STAFF}',   '${POL_BIZ}',       '${POL_STAFF}',   'staff',   'Cajero',   'membership-staff@test',   'active',   24, now(), now(), null),
          ('${M_OUTSIDER}','${POL_OTHER_BIZ}', '${POL_OUTSIDER}','owner',   'Dueño',    'membership-outsider@test','active',   24, now(), now(), null),
          ('${M_DELETED}', '${POL_BIZ}',       '${POL_DELETED}', 'staff',   'Dado de baja', 'membership-baja@test', 'active',   24, now(), now(), now()),
          ('${M_PAUSED}',  '${POL_BIZ}',       '${POL_PAUSED}',  'staff',   'Pausado',  'membership-pausado@test', 'disabled', 24, now(), now(), null),
          -- Vencida: TTL de 24 horas con el sello de hace dos días. Es una
          -- membresía activa y es 'owner', así que lo único que la separa de un
          -- dueño que entra por todas partes es la sesión.
          ('${M_STALE_OWNER}', '${POL_BIZ}',   '${POL_STALE_OWNER}', 'owner', 'Dueño vencido', 'membership-vencido@test', 'active', 24, now() - interval '48 hours', now(), null);

        -- El staff solo de A. El gerente de las dos, porque owner y manager
        -- reciben el negocio entero y can_manage_location lo dice así; la
        -- pregunta de "otra sucursal" se responde contra POL_LOC_OTHER, que es de
        -- OTRO negocio, y contra el staff, que sí está acotado.
        insert into public.business_member_locations (member_id, location_id, deleted_at)
        values
          ('${M_STAFF}',   '${POL_LOC_A}',     null),
          ('${M_MANAGER}', '${POL_LOC_A}',     null),
          ('${M_MANAGER}', '${POL_LOC_B}',     null),
          ('${M_DELETED}', '${POL_LOC_A}',     null),
          ('${M_PAUSED}',  '${POL_LOC_A}',     null),
          -- Una fila de alcance BORRADA de una membresía VIVA. Es la que mide el
          -- 'deleted_at is null' de 20261015024825 puesto sobre la fila que se
          -- está LEYENDO: la de M_DELETED de más arriba la escondía el exists
          -- sobre la fila ajena, que es otro filtro y ya estaba. Acá la membresía
          -- está activa, así que sin el filtro de la fila propia esta se vería.
          ('${M_PAUSED}',  '${POL_LOC_B}',     now()),
          ('${M_OUTSIDER}','${POL_LOC_OTHER}', null);
      `);

      await tx.unsafe(`
        insert into public.categories (id, name, slug, active)
        values ('${CATEGORY}', 'RLS membership category', 'rls-membership-category', true),
               ('${CATEGORY_2}', 'RLS membership category 2', 'rls-membership-category-2', true);

        insert into public.offers
          (id, business_id, business_location_id, title, original_price, discounted_price,
           stock, initial_stock, pickup_start, pickup_end, is_active)
        values ('${OFFER_A}',     '${POL_BIZ}',       '${POL_LOC_A}',     'RLS offer A',     10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true),
               ('${OFFER_B}',     '${POL_BIZ}',       '${POL_LOC_B}',     'RLS offer B',     10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true),
               ('${OFFER_OTHER}', '${POL_OTHER_BIZ}', '${POL_LOC_OTHER}', 'RLS offer other', 10.00, 4.00, 5, 5, now(), now() + interval '3 hours', true),
               ('${OFFER_CLOSED}','${POL_BIZ}',       '${POL_LOC_B}',     'RLS offer closed',10.00, 4.00, 5, 5, now(), now() + interval '3 hours', false);

        insert into public.offer_categories (offer_id, category_id)
        values ('${OFFER_A}', '${CATEGORY}'),
               ('${OFFER_OTHER}', '${CATEGORY}');
      `);

      for (const [key, userId, businessId, locationId, offerId, status] of [
        ['A', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'pending'],
        ['B', POL_CONSUMER2, POL_BIZ, POL_LOC_B, OFFER_B, 'pending'],
        ['C', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'confirmed'],
        ['D', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'confirmed'],
        ['E', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'completed'],
        ['F', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'pending'],
        ['G', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'ready_for_pickup'],
        ['H', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'completed'],
        ['I', POL_CONSUMER2, POL_BIZ, POL_LOC_B, OFFER_B, 'pending'],
        [
          'J',
          POL_CONSUMER2,
          POL_OTHER_BIZ,
          POL_LOC_OTHER,
          OFFER_OTHER,
          'confirmed',
        ],
        ['K', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'pending'],
        ['L', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'pending'],
        ['M', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'ready_for_pickup'],
        ['N', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'ready_for_pickup'],
        ['O', POL_CONSUMER, POL_BIZ, POL_LOC_A, OFFER_A, 'pending'],
        [
          'P',
          POL_CONSUMER2,
          POL_OTHER_BIZ,
          POL_LOC_OTHER,
          OFFER_OTHER,
          'ready_for_pickup',
        ],
      ] as const) {
        // La columna `business_location_id` no se escribe: la deriva
        // `trg_set_order_business_location` de la oferta, que es lo que hace
        // `reserve_offer` también. Compartir oferta entre pedidos de la misma
        // sucursal es representable (solo `reserve_offer` lo rechaza) y deja el
        // reordenamiento de stock de la cancelación medido en una sola fila.
        await tx.unsafe(`
          insert into public.orders
            (id, user_id, offer_id, business_id, order_number, status, price,
             original_price, pickup_code, commission_rate, platform_fee, net_amount)
          values ('${ORDER[key]}', '${userId}', '${offerId}', '${businessId}',
                  'POL-${key}', '${status}', 4.00, 10.00, 'PICKUP-${key}',
                  0.4000, 0.4000, 3.2000);
        `);
      }

      await tx.unsafe(`
        insert into public.payment_intents (id, order_id, gateway, amount, currency, status, idempotency_key)
        values ('${PAYMENT_INTENT}',       '${ORDER.A}', 'stripe', 4.00, 'USD', 'approved', 'f7000000-0000-4000-8000-000000000001'),
               ('${PAYMENT_INTENT_OTHER}', '${ORDER.B}', 'stripe', 4.00, 'USD', 'approved', 'f7000000-0000-4000-8000-000000000002');

        insert into public.business_hours (id, business_id, day, open_time, close_time, is_closed)
        values ('${HOUR}',  '${POL_BIZ}', 'monday', '08:00', '20:00', false);

        insert into public.coupons (id, business_id, code, name, type, value)
        values ('${COUPON}', '${POL_BIZ}', 'RLSPOL', 'RLS membership coupon', 'percentage', 10.00);

        insert into public.payouts (id, business_id, period_start, period_end, gross_amount, platform_fee, net_amount, status)
        values ('${PAYOUT}', '${POL_BIZ}', current_date - 30, current_date - 1, 100.00, 40.00, 60.00, 'pending');
      `);
      // `business_notification_preferences` no se siembra: la escribe
      // `trg_create_business_notification_preferences` al insertar el negocio, y
      // sembrarla a mano sería un fixture que en producción no puede existir.
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  /** The ids a session can see through one table, sorted. */
  async function idsSeenBy(userId: string | null, query: string) {
    const rows = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ id: string }[]>(query),
    );
    return plainRows(rows)
      .map((r) => r.id)
      .sort();
  }

  /** One RPC call as a signed-in user, returned whole. */
  async function callRpc(userId: string, call: string) {
    const rows = await as(ctx.sql, 'authenticated', userId, (tx) =>
      tx.unsafe<{ result: Record<string, unknown> }[]>(
        `select ${call} as result`,
      ),
    );
    return (plainRows(rows)[0]?.result ?? {}) as Record<string, unknown>;
  }

  /** The status column of an order, read as the schema owner. */
  async function statusOf(orderId: string): Promise<string | undefined> {
    const rows = await ctx.sql.unsafe<{ status: string }[]>(
      `select status from public.orders where id = '${orderId}'`,
    );
    return plainRows(rows)[0]?.status;
  }

  // ─── LA PARIDAD: LAS NUEVAS ESTÁN, LAS VIEJAS SIGUEN AL LADO ─────────────────
  //
  // El conjunto nuevo se afirma COMPLETO y por nombre, no por conteo: un conteo
  // pasaría con tres policies cambiada de sitio, y el nombre es lo que un
  // revisor lee. El conjunto viejo se afirma por lo MISMO, porque su valor está
  // en que sea exactamente el de antes: ese es el invariante del §6.2.

  test('ninguna policy de negocio resuelve por business_ownership, y las viejas siguen exactamente las 19 que había', async () => {
    const membership = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ tablename: string; policyname: string; cmd: string }[]>(
        `
        select tablename, policyname, cmd from pg_policies
        where schemaname = 'public'
          and (qual like '%can_manage_location%'
            or with_check like '%can_manage_location%'
            or qual like '%business_member_role%'
            or with_check like '%business_member_role%')
        order by tablename, policyname`,
      ),
    );

    expect(
      plainRows(membership)
        .map((p) => `${p.tablename}:${p.policyname}:${p.cmd}`)
        .sort(),
      'una policy de negocio resuelve el acceso por un helper que no es de ' +
        'pertenencia, o falta la que debería estar. La lista completa está en ' +
        'el §6.2 y las veinte y pico entradas son lo que este bloque mide.',
    ).toEqual([
      'business_hours:Members can manage business hours:ALL',
      'business_locations:Members can delete business locations:DELETE',
      'business_locations:Members can insert business locations:INSERT',
      'business_locations:Members can update business locations:UPDATE',
      'business_locations:Members can view business locations:SELECT',
      'business_member_locations:Owners and managers view member scope:SELECT',
      'business_members:Owners and managers view business members:SELECT',
      'business_notification_preferences:Members can insert own notification preferences:INSERT',
      'business_notification_preferences:Members can update own notification preferences:UPDATE',
      'business_notification_preferences:Members can view own notification preferences:SELECT',
      'businesses:Members can update business:UPDATE',
      'businesses:Members can view business:SELECT',
      'coupons:Members can manage coupons:ALL',
      'offer_categories:Members can delete offer categories:DELETE',
      'offer_categories:Members can insert offer categories:INSERT',
      'offers:Members can delete own offers:DELETE',
      'offers:Members can insert own offers:INSERT',
      'offers:Members can update own offers:UPDATE',
      'offers:Members can view own offers:SELECT',
      'order_events:Members can view own order events:SELECT',
      'orders:Members can view own orders:SELECT',
      'payment_intents:Members can view own payment intents:SELECT',
      'payouts:Members can view own payouts:SELECT',
      'profiles:Members can view their order customers:SELECT',
    ]);

    // Y el residuo viejo, que es lo que la migración siguiente retira con el
    // `drop table`. MEDIDO: 19, en 12 tablas. El brief decía "unas 20"; lo que
    // hay en la base son diecinueve, y el número va escrito porque es el que
    // hace que el `drop` sea un diff de una línea.
    const legacy = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ tablename: string; policyname: string; cmd: string }[]>(
          `
          select tablename, policyname, cmd from pg_policies
          where schemaname = 'public'
            and (qual like '%business_ownership%' or with_check like '%business_ownership%')
          order by tablename, policyname`,
        )
        .then((rows) => plainRows(rows)),
    );

    expect(
      legacy.map((p) => `${p.tablename}:${p.policyname}:${p.cmd}`),
      'el conjunto de policies que resuelve por business_ownership cambió sin ' +
        'que nadie lo decidiera. Su número solo baja cuando la migración que ' +
        'hace `drop table public.business_ownership` corre; si baja antes, ' +
        'alguien dejó al dueño sin panel, y si sube, alguien escribió una policy ' +
        'a mano.',
    ).toEqual([
      'business_hours:Owners can manage own business hours:ALL',
      'business_locations:Owners can manage own business locations:ALL',
      'business_notification_preferences:Business owners insert own notification preferences:INSERT',
      'business_notification_preferences:Business owners update own notification preferences:UPDATE',
      'business_notification_preferences:Business owners view own notification preferences:SELECT',
      'businesses:Owners can update own businesses:UPDATE',
      'businesses:Owners can view own businesses:SELECT',
      'coupons:Owners can manage own coupons:ALL',
      'offer_categories:Owners can delete offer categories:DELETE',
      'offer_categories:Owners can insert offer categories:INSERT',
      'offers:Owners can delete own offers:DELETE',
      'offers:Owners can insert own offers:INSERT',
      'offers:Owners can update own offers:UPDATE',
      'offers:Owners can view own offers:SELECT',
      'order_events:Business can view own order events:SELECT',
      'orders:Business can view own orders:SELECT',
      'payment_intents:Business can view own payment intents:SELECT',
      'payouts:Business can view own payouts:SELECT',
      'profiles:Businesses can view their order customers:SELECT',
    ]);
  });

  // ─── LA FORMA DEL PREDICADO, Y A QUIÉN LE HABLA ─────────────────────────────
  //
  // `TO authenticated` y no `TO public` como las viejas. No es una diferencia de
  // permisos: una sesión anónima no tiene fila en `business_members` —su
  // `user_id` no puede ser el `auth.uid()` de una sesión sin JWT—, así que el
  // predicado nunca le concede nada. Lo que cambia es a quién leen estas dos
  // capas cuando alguien lee el catálogo.

  test('las policies nuevas son para authenticated y no nombran business_ownership', async () => {
    const rows = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<
        {
          tablename: string;
          policyname: string;
          roles: string[];
          permissive: string;
          qual: string | null;
          with_check: string | null;
        }[]
      >(
        `
        select tablename, policyname, roles, permissive, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and policyname like 'Members can%'
        order by tablename, policyname`,
      ),
    );

    const all = plainRows(rows);
    expect(
      all.length,
      'no hay 23 policies "Members can…" donde el §6.2 dice que las hay.',
    ).toBe(23);

    for (const policy of all) {
      expect(
        policy.roles,
        `${policy.tablename}:${policy.policyname} habla con alguien que no es ` +
          'una sesión de panel.',
      ).toEqual(['authenticated']);
      expect(
        policy.permissive,
        `${policy.tablename}:${policy.policyname} es RESTRICTIVE. Las policies ` +
          'permissivas se unen con OR, que es lo que hace posible que las viejas ' +
          'y las nuevas den lo mismo durante la convivencia del §6.2; una ' +
          'restrictiva se aplica al final y anularía a las dos.',
      ).toBe('PERMISSIVE');

      const body = `${policy.qual ?? ''}\n${policy.with_check ?? ''}`;
      expect(
        body.includes('business_ownership'),
        `${policy.tablename}:${policy.policyname} todavía resuelve el dueño por ` +
          'la tabla que la migración siguiente borra.',
      ).toBe(false);
    }
  });

  // ─── LA LECTURA DE LAS TABLAS DE NEGOCIO, POR SUCURSAL ─────────────────────

  test('el staff ve su sucursal y no la otra, en cada tabla que se resuelve por ubicación', async () => {
    // `profiles` sale del mismo predicado que `orders` —el cliente de un pedido—,
    // más la policy de "mi propio perfil", así que el conjunto del cajero es su
    // cliente de A y su propia fila. Y `POL_CONSUMER2` NO está: su único pedido en
    // LOC_B es de la otra sucursal, y el de LOC_OTHER es de otro negocio.
    const expectations: readonly {
      table: string;
      sql: string;
      staff: string[];
      manager: string[];
      outsider: string[];
    }[] = [
      {
        table: 'offers',
        sql: `select id::text as id from public.offers order by id`,
        // Las tres activas se ven por catálogo público, para todo el mundo. La que
        // mide es la cerrada de la otra sucursal: el gerente entra por su policy y
        // el cajero de A no.
        staff: [OFFER_A, OFFER_B, OFFER_OTHER],
        manager: [OFFER_A, OFFER_B, OFFER_OTHER, OFFER_CLOSED],
        outsider: [OFFER_A, OFFER_B, OFFER_OTHER],
      },
      {
        table: 'orders',
        sql: `select id::text as id from public.orders order by id`,
        staff: orderIds(AT_A),
        manager: orderIds([...AT_A, ...AT_B]),
        outsider: orderIds(AT_OTHER),
      },
      {
        table: 'payment_intents',
        sql: `select id::text as id from public.payment_intents order by id`,
        staff: [PAYMENT_INTENT],
        manager: [PAYMENT_INTENT, PAYMENT_INTENT_OTHER],
        outsider: [],
      },
      {
        table: 'profiles',
        sql: `select id::text as id from public.profiles order by id`,
        staff: [POL_CONSUMER, POL_STAFF],
        manager: [POL_CONSUMER, POL_CONSUMER2, POL_MANAGER],
        outsider: [POL_CONSUMER2, POL_OUTSIDER],
      },
    ];

    for (const { table, sql, staff, manager, outsider } of expectations) {
      expect(
        await idsSeenBy(POL_STAFF, sql),
        `${table}: el cajero de LOC_A no ve exactamente lo de su sucursal.`,
      ).toEqual([...staff].sort());
      // Owner y manager reciben el negocio entero: es lo que dice
      // `can_manage_location`, y lo que el bloque de helpers ya midió.
      expect(
        await idsSeenBy(POL_MANAGER, sql),
        `${table}: el gerente tiene el negocio entero y nada del vecino.`,
      ).toEqual([...manager].sort());
      expect(
        await idsSeenBy(POL_OUTSIDER, sql),
        `${table}: el de fuera.`,
      ).toEqual([...outsider].sort());
    }

    // `order_events` se mide aparte porque los ids los genera el trigger: se
    // pregunta por los pedidos cuyos eventos ve cada quien, no por el id del
    // evento, que no es de este archivo para poder predecirlo.
    const eventsOf = (viewer: string, keys: readonly string[]) =>
      idsSeenBy(
        viewer,
        `select order_id::text as id from public.order_events
          where order_id in (${orderIds(keys)
            .map((id) => `'${id}'`)
            .join(', ')})`,
      );
    expect(
      await eventsOf(POL_STAFF, AT_B),
      'el cajero de LOC_A lee los eventos de los pedidos de LOC_B.',
    ).toEqual([]);
    expect(await eventsOf(POL_STAFF, AT_A)).toEqual(orderIds(AT_A));
    // Y el gerente, que tiene el negocio entero, tampoco cruza al vecino.
    expect(
      await eventsOf(POL_MANAGER, AT_OTHER),
      'el gerente lee los eventos de los pedidos del negocio vecino.',
    ).toEqual([]);
  });

  // ─── LAS TABLAS SIN COLUMNA DE SUCURSAL: EL ROL, Y SOLO EL ROL ─────────────
  //
  // No hay ubicación que acotar, así que el predicado es de negocio. Y es de
  // ROL, no "cualquier miembro": un cajero no abre ni los horarios ni los cupones
  // de un negocio que no administra.
  //
  // CON UNA ADVERTENCIA QUE ESTE ARCHIVO MIDE Y NO ESCRIBE: dos de estas cuatro
  // tablas ya eran públicas de lectura antes de esta migración —
  // "Anyone can view business hours" es `using (true)` y "Anyone can view active
  // coupons" filtra por `is_active`—, así que un `select` NO demuestra que la
  // policy nueva conceda nada ahí. Donde la lectura sí es el dato es en `payouts`
  // y en las preferencias, que no tienen policy pública; en las otras dos lo que
  // cambia es la ESCRITURA, y por eso se afirma con un `update`.

  test('owner y gerente administran las tablas del negocio, y el staff no', async () => {
    const publicReads: readonly { name: string; sql: string; row: string }[] = [
      {
        name: 'business_hours',
        sql: `select id::text as id from public.business_hours order by id`,
        row: HOUR,
      },
      {
        name: 'coupons',
        sql: `select id::text as id from public.coupons order by id`,
        row: COUPON,
      },
    ];
    const privateReads: readonly { name: string; sql: string; row: string }[] =
      [
        {
          name: 'payouts',
          sql: `select id::text as id from public.payouts order by id`,
          row: PAYOUT,
        },
        {
          name: 'business_notification_preferences',
          sql: `select business_id::text as id from public.business_notification_preferences order by business_id`,
          row: POL_BIZ,
        },
      ];

    // Las que el catálogo no publica: aquí la lectura ES la policy nueva.
    for (const table of privateReads) {
      expect(
        await idsSeenBy(POL_OWNER, table.sql),
        `${table.name}: el dueño perdió el acceso que ya tenía. Esta migración es ` +
          'aditiva y no puede quitárselo a nadie.',
      ).toEqual([table.row]);
      expect(
        await idsSeenBy(POL_MANAGER, table.sql),
        `${table.name}: el gerente no entra. Es un miembro activo del negocio, y ` +
          'esta tabla no tiene sucursal que acotar: su predicado es el rol.',
      ).toEqual([table.row]);
      expect(
        await idsSeenBy(POL_STAFF, table.sql),
        `${table.name}: un cajero leyó una tabla que se resuelve por rol.`,
      ).toEqual([]);
    }

    // Las que ya eran públicas: la lectura no dice nada, y la escritura sí.
    for (const table of publicReads) {
      expect(
        await idsSeenBy(POL_OWNER, table.sql),
        `${table.name}: el dueño perdió una lectura que tenía.`,
      ).toEqual([table.row]);
      expect(
        await idsSeenBy(POL_STAFF, table.sql),
        `${table.name}: dejó de ser pública de lectura. Esta migración es ` +
          'aditiva y no quita políticas viejas.',
      ).toEqual([table.row]);
    }

    const writes: readonly { name: string; sql: string }[] = [
      {
        name: 'business_hours',
        sql: `update public.business_hours set open_time = '09:00' where id = '${HOUR}' returning id::text`,
      },
      {
        name: 'coupons',
        sql: `update public.coupons set name = 'RLS membership coupon (gerente)' where id = '${COUPON}' returning id::text`,
      },
      {
        name: 'business_notification_preferences',
        sql: `update public.business_notification_preferences set push_enabled = false where business_id = '${POL_BIZ}' returning business_id::text`,
      },
      // `payouts` NO está en esta lista a propósito: su policy vieja era de solo
      // lectura y esta migración no la ensancha. Las liquidaciones las escribe
      // generate_payouts con service_role, y abrirle la escritura al panel sería
      // ensanchar el perímetro sin que nadie lo pidiera.
    ];

    for (const write of writes) {
      expect(
        await as(ctx.sql, 'authenticated', POL_MANAGER, (tx) =>
          tx.unsafe<{ id: string }[]>(write.sql),
        ).then((rows) => plainRows(rows).map((r) => r.id)),
        `${write.name}: el gerente no administra la tabla del negocio.`,
      ).toHaveLength(1);
      expect(
        await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
          tx.unsafe<{ id: string }[]>(write.sql),
        ).then((rows) => plainRows(rows).map((r) => r.id)),
        `${write.name}: un cajero la modificó. La tabla se resuelve por rol y el ` +
          'cajero no tiene ninguno de esos dos.',
      ).toEqual([]);
    }

    // Y borrar, que es la otra mitad de "administrar".
    expect(
      await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
        tx.unsafe<{ id: string }[]>(
          `delete from public.coupons where id = '${COUPON}' returning id::text`,
        ),
      ).then((rows) => plainRows(rows)),
      'un cajero borró un cupón.',
    ).toEqual([]);
  });

  test('la fila del negocio se actualiza por rol, y la policy de dueño sigue ahí', async () => {
    // La fila de `businesses` no tiene sucursal, así que su predicado es el rol.
    // Y el dueño la conserva por los DOS caminos: la policy vieja y la nueva.
    // Perder el viejo sería el modo de falla del §6.2, y por eso el dueño se
    // prueba contra una escritura —que la policy vieja sí concede— y no contra
    // una lectura, que el catálogo público ya le daba.
    const updated = await as(ctx.sql, 'authenticated', POL_MANAGER, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.businesses set name = 'RLS membership biz (gerente)'
          where id = '${POL_BIZ}' returning id::text`,
      ),
    );
    expect(plainRows(updated).map((r) => r.id)).toEqual([POL_BIZ]);

    const staff = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.businesses set name = 'RLS membership biz (cajero)'
          where id = '${POL_BIZ}' returning id::text`,
      ),
    );
    expect(
      plainRows(staff),
      'un cajero renombró el negocio. Su alcance es una sucursal, no el negocio.',
    ).toEqual([]);

    // El dueño, por la policy vieja, que es la que sigue en pie.
    const owner = await as(ctx.sql, 'authenticated', POL_OWNER, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.businesses set name = 'RLS membership biz'
          where id = '${POL_BIZ}' returning id::text`,
      ),
    );
    expect(
      plainRows(owner).map((r) => r.id),
      'el dueño perdió la fila de su negocio. La convivencia del §6.2 significa ' +
        'que las dos policies conceden, no que la nueva reemplaza a la vieja.',
    ).toEqual([POL_BIZ]);
  });

  // ─── LAS SUCURSALES: LEER ES POR UBICACIÓN, CREAR ES POR ROL ───────────────
  //
  // El lugar donde un `FOR ALL` con `can_manage_location(business_id, id)` se
  // rompe: la fila que se está insertando todavía no existe, así que el helper
  // responde que no y el panel se queda sin poder crear una sucursal. Por eso
  // INSERT es una policy aparte y por rol.
  test('leer y modificar sucursales es por ubicación; crearlas, por rol', async () => {
    const seeLocations = `select id::text as id from public.business_locations order by id`;

    // La cerrada es la que mide. El catálogo público enseña toda sucursal
    // activa, así que lo que diferencia la policy nueva es la que NO aparece ahí:
    // el gerente entra por la suya, el cajero no porque su alcance es LOC_A, y el
    // de fuera tampoco porque no es de su negocio.
    const active = [POL_LOC_A, POL_LOC_B, POL_LOC_OTHER].sort();
    expect(await idsSeenBy(POL_STAFF, seeLocations)).toEqual(active);
    expect(await idsSeenBy(POL_OUTSIDER, seeLocations)).toEqual(active);
    expect(await idsSeenBy(POL_MANAGER, seeLocations)).toEqual(
      [...active, POL_LOC_CLOSED].sort(),
    );
    expect(await idsSeenBy(POL_OWNER, seeLocations)).toEqual(
      [...active, POL_LOC_CLOSED].sort(),
    );

    // Modificar: el de su sucursal sí, el de la otra no. Cero filas, no un error:
    // una policy de UPDATE que no casa filtra la fila y no dice nada.
    const renamed = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set name = 'A (cajero)'
          where id = '${POL_LOC_A}' returning id::text`,
      ),
    );
    expect(plainRows(renamed).map((r) => r.id)).toEqual([POL_LOC_A]);
    const other = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set name = 'B (cajero)'
          where id = '${POL_LOC_B}' returning id::text`,
      ),
    );
    expect(plainRows(other)).toEqual([]);
    await ctx.sql.unsafe(
      `update public.business_locations set name = 'A' where id = '${POL_LOC_A}'`,
    );

    // Crear: el cajero no, el gerente sí. Y esta es la prueba de que la
    // separación de policies no cerró por accidente la puerta que el panel usa.
    const staffInsert = await deniedAs(
      ctx.sql,
      'authenticated',
      POL_STAFF,
      (tx) =>
        tx.unsafe(
          `insert into public.business_locations (id, business_id, name, address, latitude, longitude)
         values ('${POL_LOC_NEW}', '${POL_BIZ}', 'C', 'Street C', 40.41680000, -3.70380000)`,
        ),
    );
    expect(
      staffInsert,
      'un cajero creó una sucursal. Crear sucursales es de dueño y gerente.',
    ).not.toBeNull();

    const managerInsert = await as(
      ctx.sql,
      'authenticated',
      POL_MANAGER,
      (tx) =>
        tx.unsafe<{ id: string }[]>(
          `insert into public.business_locations (id, business_id, name, address, latitude, longitude)
         values ('${POL_LOC_NEW}', '${POL_BIZ}', 'C', 'Street C', 40.41680000, -3.70380000)
         returning id::text`,
        ),
    );
    expect(
      plainRows(managerInsert).map((r) => r.id),
      'el gerente no pudo crear una sucursal. `can_manage_location` se llama con ' +
        'el id de una fila que todavía no existe, así que el INSERT NO puede ' +
        'usarlo: por eso es una policy aparte y por rol.',
    ).toEqual([POL_LOC_NEW]);

    // Y la fila nueva entra en el perímetro del gerente sin tocar nada más.
    expect(await idsSeenBy(POL_MANAGER, seeLocations)).toEqual(
      [...active, POL_LOC_CLOSED, POL_LOC_NEW].sort(),
    );

    // ─── BORRAR SUCURSAL: DE DUEÑO, NO DE GERENTE ───────────────────────────
    //
    // El §5.1 dice `manager → todo el negocio, EXCEPTO borrar sucursales`, y
    // `20261015015012` le dio esa policy con `can_manage_location`, que devuelve
    // true para el gerente. `20261015024825` la aprieta a `owner`.
    //
    // Y no es una regresión: la policy que ésta reemplaza —la de
    // `business_ownership`— era de dueño solamente, así que un gerente que
    // borraba una sucursal antes tampoco podía.
    //
    // Y el costo de dejarlo pasar era de los que no se ven en un log:
    // `business_member_locations_location_id_fkey` es `ON DELETE CASCADE`, así
    // que el gerente que borraba una sucursal se llevaba por delante la fila de
    // alcance de cada cajero que apuntaba a ella. Después del drop de
    // `business_ownership` esta es la única puerta a DELETE que tiene el
    // sistema, y es de dueño.

    // La fila descartable es la que el gerente acaba de crear más arriba
    // (`POL_LOC_NEW`): existe, es de este negocio y no tiene cascadas que
    // matar, así que es la que se usa para medir el borrado.

    // El cajero no.
    const staffDelete = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `delete from public.business_locations where id = '${POL_LOC_NEW}' returning id::text`,
      ),
    );
    expect(
      plainRows(staffDelete).map((r) => r.id),
      'un cajero borró una sucursal.',
    ).toEqual([]);

    // El gerente tampoco, y aquí la forma de la denegación NO es la del INSERT de
    // arriba: un DELETE denied por RLS no levanta 42501, filtra la fila y
    // devuelve cero. Por eso se mide por el conteo de filas que volvió y no con
    // `deniedAs`, que mide el error.
    const managerDelete = await as(
      ctx.sql,
      'authenticated',
      POL_MANAGER,
      (tx) =>
        tx.unsafe<{ id: string }[]>(
          `delete from public.business_locations where id = '${POL_LOC_NEW}' returning id::text`,
        ),
    );
    expect(
      plainRows(managerDelete).map((r) => r.id),
      'un gerente borró una sucursal. El §5.1 le da todo el negocio EXCEPTO ' +
        'esto, y `business_member_locations` va en cascada: cada fila de ' +
        'alcance de cada cajero de esa sucursal desaparece con ella.',
    ).toEqual([]);

    // Y la fila sigue ahí, que es lo que hace la aserción anterior válida: un
    // `deniedAs` que negara por un motivo raro, como un error de sintaxis,
    // dejaría la misma fila y pasaría igual.
    expect(
      await ctx.sql
        .unsafe<{ n: number }[]>(
          `select count(*)::int as n from public.business_locations where id = '${POL_LOC_NEW}'`,
        )
        .then((rows) => plainRows(rows)[0]?.n),
      'la sucursal que el gerente no podía borrar no llegó a crearse, así que ' +
        'el rechazo de arriba no midió lo que dice medir.',
    ).toBe(1);

    // El dueño sí, y sigue teniendo el negocio entero para hacerlo.
    const ownerDelete = await as(ctx.sql, 'authenticated', POL_OWNER, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `delete from public.business_locations where id = '${POL_LOC_NEW}' returning id::text`,
      ),
    );
    expect(
      plainRows(ownerDelete).map((r) => r.id),
      'el dueño no pudo borrar una sucursal de su negocio. El §5.1 le da el ' +
        'negocio entero, y borrar sucursales es la única operación de esa lista.',
    ).toEqual([POL_LOC_NEW]);

    await ctx.sql.unsafe(
      `delete from public.business_locations where id = '${POL_LOC_NEW}'`,
    );
  });

  // ─── LA CATEGORÍA DE UNA OFERTA SE ADMINISTRA CON LA OFERTA ──────────────────
  //
  // `offer_categories` es la tabla puente y su predicado no mira la fila que se
  // escribe sino la OFERTA que hay detrás. Es el único caso del §6.2 donde la
  // tabla no lleva `business_id`, y por eso su policy es la que más se parece a
  // "esto se concede por otra tabla".
  //
  // Sin este bloque la pareja de policies de esta tabla se afirmaba solo por su
  // nombre en el catálogo, y eso NO alcanza: un `using (true)` con el nombre
  // correcto pasa la aserción de forma y abre la tabla entera. Lo que lo mide es
  // que el cajero de A escriba en la oferta de A y no en la de B —el mismo
  // negocio, otra sucursal—, porque esa es la fila que distingue
  // `can_manage_location(business, location)` de un `business_id` a secas.
  //
  // La lectura no se mide aquí porque "Anyone can view offer categories" es
  // `using (true)`: el catálogo público ya la concedía y una lectura no
  // distinguiría la policy nueva de nada. Lo nuevo de esta tabla es la escritura.

  test('una categoría se enlaza y se desvincula por la sucursal de su oferta', async () => {
    const link = (offerId: string) =>
      `insert into public.offer_categories (offer_id, category_id)
       values ('${offerId}', '${CATEGORY_2}') returning offer_id::text`;

    // El cajero de LOC_A enlaza la categoría de la oferta de SU sucursal.
    const own = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(link(OFFER_A)),
    );
    expect(
      plainRows(own).map((r) => r.offer_id),
      'el cajero no pudo clasificar una oferta de su propia sucursal. El §6.2 da ' +
        'esta escritura por membresía, y el panel la usa.',
    ).toEqual([OFFER_A]);

    // Y no la de la OTRA sucursal del MISMO negocio: mismo `business_id`, distinto
    // `business_location_id`. Esta es la fila que separa el helper de un
    // `business_id` a secas, y la que no habría detectado un predicado holgado.
    const sameBusiness = await deniedAs(
      ctx.sql,
      'authenticated',
      POL_STAFF,
      (tx) => tx.unsafe(link(OFFER_B)),
    );
    expect(
      sameBusiness,
      'el cajero de LOC_A clasificó una oferta de LOC_B. Las dos sucursales son ' +
        'del mismo negocio, así que esta aserción solo se sostiene si el predicado ' +
        'mira la ubicación de la oferta y no el negocio de la oferta.',
    ).not.toBeNull();

    // Ni la del negocio vecino, que es el caso que sí habría atrapado un
    // predicado por negocio.
    const otherBusiness = await deniedAs(
      ctx.sql,
      'authenticated',
      POL_STAFF,
      (tx) => tx.unsafe(link(OFFER_OTHER)),
    );
    expect(
      otherBusiness,
      'el cajero de LOC_A clasificó una oferta de otro negocio.',
    ).not.toBeNull();

    // El gerente administra el negocio entero, así que las dos sucursales son suyas.
    const managerLink = await as(ctx.sql, 'authenticated', POL_MANAGER, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(link(OFFER_B)),
    );
    expect(
      plainRows(managerLink).map((r) => r.offer_id),
      'el gerente no pudo clasificar una oferta de su negocio.',
    ).toEqual([OFFER_B]);

    // Y el dueño también, por los DOS caminos: su alcance es el negocio entero,
    // como para el resto de las tablas sin ubicación. Se mide sobre un DELETE de
    // una fila del fixture en vez de un INSERT porque `(OFFER_A, CATEGORY)` ya
    // existe —la clave primaria es `(offer_id, category_id)`— y volver a
    // insertarla daría 23505 por unicidad, que probaría el índice y no la policy.
    const ownerUnlink = await as(ctx.sql, 'authenticated', POL_OWNER, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(
        `delete from public.offer_categories
          where offer_id = '${OFFER_A}' and category_id = '${CATEGORY}'
          returning offer_id::text`,
      ),
    );
    expect(
      plainRows(ownerUnlink).map((r) => r.offer_id),
      'el dueño perdió el acceso que ya tenía. Esta migración es aditiva: la ' +
        'policy vieja por `business_ownership` sigue concediéndosela.',
    ).toEqual([OFFER_A]);
    // Se restituye, para no dejar el fixture por debajo de lo que el resto del
    // archivo espera encontrar.
    await ctx.sql.unsafe(
      `insert into public.offer_categories (offer_id, category_id)
       values ('${OFFER_A}', '${CATEGORY}')`,
    );

    // Desvincular es la otra mitad del permiso, y se comporta distinto del
    // INSERT: un DELETE que no casa el predicado FILTRA la fila y devuelve cero,
    // en vez de levantar 42501. Son dos maneras de denegar y se miden por separado.
    const unlinked = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(
        `delete from public.offer_categories
          where offer_id = '${OFFER_A}' and category_id = '${CATEGORY_2}'
          returning offer_id::text`,
      ),
    );
    expect(
      plainRows(unlinked).map((r) => r.offer_id),
      'el cajero no pudo quitar la categoría de una oferta de su sucursal.',
    ).toEqual([OFFER_A]);

    const otherBranch = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(
        `delete from public.offer_categories
          where offer_id = '${OFFER_B}' returning offer_id::text`,
      ),
    );
    expect(
      plainRows(otherBranch),
      'el cajero desvinculó la categoría de una oferta de la OTRA sucursal del ' +
        'mismo negocio. El predicado mira la ubicación de la oferta.',
    ).toEqual([]);

    const otherBiz = await as(ctx.sql, 'authenticated', POL_STAFF, (tx) =>
      tx.unsafe<{ offer_id: string }[]>(
        `delete from public.offer_categories
          where offer_id = '${OFFER_OTHER}' returning offer_id::text`,
      ),
    );
    expect(
      plainRows(otherBiz),
      'el cajero desvinculó la categoría de una oferta de otro negocio.',
    ).toEqual([]);

    // El estado que queda dice las dos cosas a la vez: los INSERT concedidos
    // escribieron y los denegados no dejaron rastro. Si uno de los `deniedAs`
    // negara por el motivo equivocado, esta lista no sería la que se afirma.
    // Queda solo la fila del gerente: la del cajero la borró la aserción de arriba.
    const rows = await ctx.sql.unsafe<{ offer_id: string }[]>(
      `select offer_id::text from public.offer_categories
        where category_id = '${CATEGORY_2}' order by offer_id`,
    );
    expect(
      plainRows(rows).map((r) => r.offer_id),
      'las filas de offer_categories no son las que el fixture y estas ' +
        'aserciones dicen que hay.',
    ).toEqual([OFFER_B]);
  });

  // ─── LA SESIÓN VENCIDA NO ENTA POR NINGUNA POLICY QUE RESUELVA POR ROL ─────
  //
  // El encabezado de `20261015015012` decía que la comprobación de sesión
  // aplicaba a todos los roles, dueño y gerente incluidos. Para las siete tablas
  // que pasan por `can_manage_location` era verdad, porque ese helper tiene el
  // TTL. Para las que resuelven por `business_member_role` era falso: esa
  // función es `where business_id = … and user_id = auth.uid() and deleted_at is
  // null and status = 'active' limit 1` y no tiene una sola mención al TTL.
  //
  // Esta persona es dueña, su membresía está activa y su sesión venció hace dos
  // días. Debe entrar por cero de las once.

  test('una sesión vencida no entra por ninguna de las policies que resuelven por rol', async () => {
    // Las que la lectura SÍ prueba, porque no tienen policy pública: `payouts` y
    // la lista del equipo con sus alias.
    const seePayouts = `select id::text as id from public.payouts order by id`;
    const seeTeam = `select id::text as id from public.business_members order by id`;

    // Anti-vacuity: el dueño AL DIA entra por las dos. Sin esto, un `[]` de
    // arriba podría ser cierto porque el fixture no se sembró.
    expect(await idsSeenBy(POL_OWNER, seePayouts)).toEqual([PAYOUT]);
    expect(await idsSeenBy(POL_OWNER, seeTeam)).toContain(M_STALE_OWNER);

    // Y el dueño vencido no entra en ninguna de las dos. En la lista del
    // equipo ve UNA fila, la suya propia, y esa es la policy
    // `Members can view own membership`, que es `user_id = auth.uid()` y no
    // concede nada sobre el negocio: `20261015024825` no le puso TTL a propósito,
    // porque un panel al que le acaba de vencer la sesión tiene que poder leer
    // su propia fila para poder explicar la salida. Lo que se afirma es que no
    // ve a NADIE MÁS.
    expect(
      await idsSeenBy(POL_STALE_OWNER, seePayouts),
      'una sesión vencida leyó `payouts`. Su policy resuelve por rol y el rol ' +
        'no lleva el TTL; `20261015024825` le colgó `business_member_session_valid`.',
    ).toEqual([]);
    expect(
      await idsSeenBy(POL_STALE_OWNER, seeTeam),
      'una sesión vencida listó el equipo, con los alias que son correos de ' +
        'auth.users. Es el mismo TTL faltante, del otro lado.',
    ).toEqual([M_STALE_OWNER]);

    // Y las que hay que probar ESCRIBIENDO, porque `business_hours` y `coupons`
    // ya eran públicas de lectura y un `select` no distinguiría nada.
    const writes: readonly { name: string; sql: string }[] = [
      {
        name: 'business_hours',
        sql: `update public.business_hours set open_time = '07:00' where id = '${HOUR}' returning id::text`,
      },
      {
        name: 'coupons',
        sql: `update public.coupons set name = 'vencido' where id = '${COUPON}' returning id::text`,
      },
      {
        name: 'businesses',
        sql: `update public.businesses set name = 'vencido' where id = '${POL_BIZ}' returning id::text`,
      },
      {
        name: 'business_notification_preferences',
        sql: `update public.business_notification_preferences set push_enabled = false where business_id = '${POL_BIZ}' returning business_id::text`,
      },
    ];
    for (const write of writes) {
      expect(
        await as(ctx.sql, 'authenticated', POL_STALE_OWNER, (tx) =>
          tx.unsafe<{ id: string }[]>(write.sql),
        ).then((rows) => plainRows(rows).map((r) => r.id)),
        `${write.name}: una sesión vencida lo modificó. Es una de las policies ` +
          'que resuelven por rol, y el rol no mira la sesión.',
      ).toEqual([]);
    }

    // Y crear sucursales, que es la puerta de INSERT por rol.
    //
    // El CÓDIGO se afirma, no sólo que hubo un error: `not.toBeNull()` lo
    // satisface cualquier cosa, y esta aserción tiene que poder decir QUÉ
    // frontera está probando. Un `42501` es RLS negando el INSERT; un `23505`
    // sería una llave repetida y no probaría nada de permisos.
    //
    // Y el id es de ESTE test y no el que la prueba anterior dejó usar: aquella
    // borra `POL_LOC_NEW` al final, así que si esa aserción suya se rompiera
    // sola, acá el INSERT revienta por duplicado —con `23505`— y esta prueba se
    // pondría verde por el motivo equivocado.
    //
    // ─── POR QUÉ `rolledBack` Y NO `deniedAs` ─────────────────────────────────
    //
    // Porque `deniedAs` commitea en el camino de éxito, y el camino de éxito acá
    // ES la falla que el test existe para detectar. Con `deniedAs`, el día que RLS
    // deje de negar, el INSERT se commitea, la aserción del código tira, y el
    // cinturón de más abajo —que comprueba que la fila no quedó— no llega a
    // ejecutarse nunca: se cae justo en el único caso para el que existe. El
    // cinturón que nunca corre es peor que no tenerlo, porque parece una
    // garantía.
    //
    // `rolledBack` descarta la transacción SIEMPRE, así que la fila no puede
    // filtrarse pase lo que pase, y el cinturón se vuelve alcanzable.
    const staleLocation = 'f2000000-0000-4000-8000-000000000006';
    const staleInsert = await rolledBack(
      ctx.sql,
      async (tx) => {
        await tx.unsafe(
          `insert into public.business_locations (id, business_id, name, address, latitude, longitude)
           values ('${staleLocation}', '${POL_BIZ}', 'C', 'Street C', 40.41680000, -3.70380000)`,
        );
      },
      { role: 'authenticated', userId: POL_STALE_OWNER },
    );

    // El cinturón va PRIMERO, y el orden no es decorativo: es la única forma de
    // que sea alcanzable cuando el INSERT se cuela. Va antes porque después de
    // la aserción del código ya no se llega, y ese es precisamente el caso que
    // el cinturón tiene que cubrir.
    //
    // Y dice dos cosas a la vez: que la fila no quedó, y que la sonda no dejó
    // nada atrás. Si alguien cambia `rolledBack` por un helper que commitea,
    // esta es la aserción que lo nota.
    expect(
      await ctx.sql
        .unsafe<{ n: number }[]>(
          `select count(*)::int as n from public.business_locations where id = '${staleLocation}'`,
        )
        .then((rows) => plainRows(rows)[0]?.n),
      'el INSERT del dueño con la sesión vencida dejó una sucursal detrás, o la ' +
        'sonda se cambió por un helper que commitea en vez de descartar.',
    ).toBe(0);

    expect(
      staleInsert,
      'una sesión vencida creó una sucursal, o el INSERT no se denegó por RLS. ' +
        'El INSERT por rol no miraba la sesión. Si esto es `23505` en vez de ' +
        '`42501`, la fila ya existía y la aserción está probando una llave, no un ' +
        'permiso; si es `null`, el INSERT pasó y la sesión vencida no se respetó.',
    ).toBe('42501');

    // Y BORRAR la sucursal, que además es de dueño: las dos condiciones.
    // Filtra a cero filas en vez de levantar, como todo DELETE bajo RLS.
    const staleDelete = await as(
      ctx.sql,
      'authenticated',
      POL_STALE_OWNER,
      (tx) =>
        tx.unsafe<{ id: string }[]>(
          `delete from public.business_locations where id = '${POL_LOC_B}' returning id::text`,
        ),
    );
    expect(
      plainRows(staleDelete).map((r) => r.id),
      'una sesión vencida borró una sucursal. Esta policy pide owner Y sesión, ' +
        'y el `can_manage_location` de en medio ya cubría la segunda; lo que se ' +
        'comprueba acá es que el owner de la sesión vencida no la esquive.',
    ).toEqual([]);

    // Y el dueño al día sigue entrando por todo lo anterior. Sin esta mitad, las
    // aserciones de arriba se podrían cumplir con una policy rota.
    expect(await idsSeenBy(POL_OWNER, seePayouts)).toEqual([PAYOUT]);
    const ownerStillWrites = await as(
      ctx.sql,
      'authenticated',
      POL_OWNER,
      (tx) =>
        tx.unsafe<{ id: string }[]>(
          `update public.business_hours set open_time = '08:00' where id = '${HOUR}' returning id::text`,
        ),
    );
    expect(
      plainRows(ownerStillWrites).map((r) => r.id),
      'el dueño con la sesión al día dejó de administrar el negocio. ' +
        '`business_member_session_valid` tiene que estar dejando pasar a quien ' +
        'está en regla.',
    ).toEqual([HOUR]);
  });

  // ─── LAS TRES POLICIES DE LECTURA DE LAS TABLAS DE ACCESO ─────────────────
  //
  // Del §6.3: el cliente solo lee. Lo que frena la escritura es la AUSENCIA de
  // policy, y esa ausencia se mide en el bloque de arriba; lo que se mide acá es
  // a QUIÉN leen las tres de lectura.

  test('las membresías se leen por rol, la propia fila por su dueño, y la borrada no se ve', async () => {
    const allMembers = `select id::text as id from public.business_members order by id`;
    const ownScope = `select member_id::text || ':' || location_id::text as id
                        from public.business_member_locations order by 1`;

    // El cajero ve su propia fila y nada más. Y "nada más" incluye la fila
    // borrada: no es suya, y aunque lo fuera, `deleted_at is null` la esconde.
    expect(await idsSeenBy(POL_STAFF, allMembers)).toEqual([M_STAFF]);

    // El gerente ve el negocio entero, y ahí hay una fila PAUSADA que la
    // policy de lectura deja pasar y una BORRADA que ya no. La diferencia entre
    // las dos es deliberada y es el §6.3: `deleted_at is null` se filtra sobre
    // la fila que se está listando, y `status` no, porque una membresía pausada
    // sigue siendo una membresía y el panel la tiene que poder pintar para
    // explicar por qué ese cajero no entra.
    //
    // La fila borrada se va de la lista porque su `alias` espeja el correo de
    // `auth.users`, y una persona que se fue del equipo no tiene por qué seguir
    // dejando su correo de acceso en la lista que el panel dibuja. Antes de
    // `20261015024825` seguía ahí: el `deleted_at is null` que pedía el §6.3
    // estaba escrito, pero aplicado a la fila AJENA del `exists`, no a la que se
    // estaba leyendo. Venía del SQL del brief, y era un hueco del brief.
    expect(await idsSeenBy(POL_MANAGER, allMembers)).toEqual(
      [M_OWNER, M_MANAGER, M_STAFF, M_PAUSED, M_STALE_OWNER].sort(),
    );
    expect(await idsSeenBy(POL_OWNER, allMembers)).toEqual(
      [M_OWNER, M_MANAGER, M_STAFF, M_PAUSED, M_STALE_OWNER].sort(),
    );

    // El de fuera ve su negocio y no éste.
    expect(await idsSeenBy(POL_OUTSIDER, allMembers)).toEqual([M_OUTSIDER]);
    // Y un consumidor sin membresía no ve nada.
    expect(await idsSeenBy(POL_CONSUMER, allMembers)).toEqual([]);

    // El alcance, en cambio, se acota a dueño y gerente, y las filas
    // borradas desaparecen de él por DOS filtros distintos que esta lista mide
    // los dos: el `exists` pide `m.deleted_at is null` sobre la fila AJENA (la
    // de M_DELETED, cuya membresía está dada de baja) y el `20261015024825` puso
    // además `deleted_at is null` sobre la fila PROPIA (la de M_PAUSED en
    // LOC_B, cuya membresía está viva y solo su alcance está borrado).
    expect(await idsSeenBy(POL_MANAGER, ownScope)).toEqual(
      [
        `${M_STAFF}:${POL_LOC_A}`,
        `${M_MANAGER}:${POL_LOC_A}`,
        `${M_MANAGER}:${POL_LOC_B}`,
        `${M_PAUSED}:${POL_LOC_A}`,
      ].sort(),
    );
    // El cajero no ve ni su propio alcance por esta policy: lo pide con
    // `business_member_session_state()`, que es la función que el panel ya llama.
    expect(await idsSeenBy(POL_STAFF, ownScope)).toEqual([]);

    // Y ni una palabra de las dos tablas para un desconocido.
    expect(await idsSeenBy(POL_CONSUMER, ownScope)).toEqual([]);
  });

  test('las dos tablas de acceso no se escriben desde el cliente, ni por un dueño', async () => {
    // La policy de lectura es de dueño y gerente, y aun así la escritura falla:
    // el permiso de escribir no viene de una policy de lectura. Sin policy de
    // INSERT, RLS no tiene nada que conceder y Postgres lo dice con 42501.
    const asManager = await deniedAs(
      ctx.sql,
      'authenticated',
      POL_MANAGER,
      (tx) =>
        tx.unsafe(
          `insert into public.business_members (business_id, user_id, role, label, alias)
           values ('${POL_BIZ}', '${POL_CONSUMER}', 'staff', 'Alta desde el panel', 'alta@test')`,
        ),
    );
    expect(
      asManager,
      'un gerente dio de alta un acceso. El alta requiere service_role, que no ' +
        'existe en una sesión de panel.',
    ).not.toBeNull();

    const scope = await deniedAs(ctx.sql, 'authenticated', POL_MANAGER, (tx) =>
      tx.unsafe(
        `insert into public.business_member_locations (member_id, location_id)
         values ('${M_STAFF}', '${POL_LOC_B}')`,
      ),
    );
    expect(
      scope,
      'un gerente amplió el alcance de un cajero. Ampliar el alcance de alguien ' +
        'es escribir la tabla que le dice a `can_manage_location` qué puede ver.',
    ).not.toBeNull();
  });

  // ─── LOS TRES RPCs ─────────────────────────────────────────────────────────
  //
  // Los tres aceptan hoy al dueño con un `exists` escrito a mano sobre
  // `business_ownership`, y los tres los recrea esta migración con el helper.
  // Lo que no cambia es TODO lo demás: la matriz de estados, los códigos de error
  // y los grants EXECUTE. Un código de error distinto es una outage de otra
  // feature, no un detalle de estilo.

  test('cancel_order: la sucursal manda, y la matriz de estados sigue siendo la misma', async () => {
    // El cajero cancela el pedido de SU sucursal y repone el stock.
    const cancelled = await callRpc(
      POL_STAFF,
      `public.cancel_order(null, '${ORDER.A}', '${POL_BIZ}')`,
    );
    expect(cancelled).toEqual({
      success: true,
      order_id: ORDER.A,
      status: 'cancelled',
    });
    expect(await statusOf(ORDER.A)).toBe('cancelled');
    const stock = await ctx.sql.unsafe<{ stock: number }[]>(
      `select stock from public.offers where id = '${OFFER_A}'`,
    );
    expect(
      plainRows(stock)[0]?.stock,
      'cancelar no repuso el stock. La semántica de la matriz no es lo que esta ' +
        'migración toca, y tocarla sería cambiar algo que nadie pidió.',
    ).toBe(6);

    // El mismo cajero, el pedido de la otra sucursal: se le dice que no.
    const refused = await callRpc(
      POL_STAFF,
      `public.cancel_order(null, '${ORDER.B}', '${POL_BIZ}')`,
    );
    expect(refused.error).toBe('NOT_ORDER_OWNER');
    expect(await statusOf(ORDER.B)).toBe('pending');

    // Y el pedido de un negocio que ni es el suyo.
    const stranger = await callRpc(
      POL_STAFF,
      `public.cancel_order(null, '${ORDER.J}', '${POL_OTHER_BIZ}')`,
    );
    expect(stranger.error).toBe('NOT_ORDER_OWNER');

    // La matriz: desde `picked_up`, `completed` o `cancelled` no se cancela.
    for (const key of ['E', 'H']) {
      const refusedState = await callRpc(
        POL_MANAGER,
        `public.cancel_order(null, '${ORDER[key]}', '${POL_BIZ}')`,
      );
      expect(
        refusedState.error,
        `cancel_order sobre un pedido en ${await statusOf(ORDER[key])} cambió la ` +
          'matriz de estados. Esta migración cambia QUIÉN puede, no QUÉ puede.',
      ).toBe('CANNOT_CANCEL');
    }

    // La ruta del consumidor, que no lleva `p_business_id` y no pasa por el helper.
    const own = await callRpc(
      POL_CONSUMER,
      `public.cancel_order('${POL_CONSUMER}', '${ORDER.C}', null)`,
    );
    expect(own.success).toBe(true);
    const stolen = await callRpc(
      POL_CONSUMER2,
      `public.cancel_order('${POL_CONSUMER2}', '${ORDER.D}', null)`,
    );
    expect(
      stolen.error,
      'un consumidor canceló el pedido de otro. La ruta del consumidor se ' +
        'comprueba con `p_user_id`, que no es lo que esta migración tocó.',
    ).toBe('NOT_ORDER_OWNER');
  });

  test('set_order_status: el ciclo de vida y sus tres filas de "no"', async () => {
    // La transición buena, y el estado del que sale se escribe de verdad.
    const moved = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.F}', 'confirmed')`,
    );
    expect(moved).toEqual({
      success: true,
      order_id: ORDER.F,
      status: 'confirmed',
    });
    expect(await statusOf(ORDER.F)).toBe('confirmed');

    // `picked_up` está reservada al sistema, aunque la matriz del ciclo la permita
    // desde `ready_for_pickup`: la reserva es posterior a la matriz y no se toca.
    const system = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.G}', 'picked_up')`,
    );
    expect(system).toEqual({
      success: false,
      error: 'INVALID_TRANSITION',
      message: 'Transición reservada al sistema',
    });
    expect(await statusOf(ORDER.G)).toBe('ready_for_pickup');

    // Un pedido completado no retrocede.
    const backwards = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.H}', 'confirmed')`,
    );
    expect(backwards.error).toBe('INVALID_TRANSITION');
    expect(await statusOf(ORDER.H)).toBe('completed');

    // La misma transición sobre un estado idéntico se distingue de la prohibida.
    const same = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.K}', 'pending')`,
    );
    expect(same).toEqual({
      success: false,
      error: 'INVALID_TRANSITION',
      message: 'El pedido ya está en ese estado',
    });

    // Un estado que no existe se rechaza ANTES de mirar el pedido.
    const label = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.L}', 'teleportado')`,
    );
    expect(label).toEqual({
      success: false,
      error: 'INVALID_STATUS',
      message: 'Estado inválido',
    });

    // Un pedido de la otra sucursal y un pedido del otro negocio: los dos con el
    // mismo error que daba el `exists` viejo, porque el mensaje travels to the
    // cliente y alguien lo compara.
    const otherBranch = await callRpc(
      POL_STAFF,
      `public.set_order_status('${ORDER.I}', 'confirmed')`,
    );
    expect(otherBranch).toEqual({
      success: false,
      error: 'NOT_ORDER_OWNER',
      message: 'No eres el dueño de este pedido',
    });
    const otherBusiness = await callRpc(
      POL_MANAGER,
      `public.set_order_status('${ORDER.J}', 'ready_for_pickup')`,
    );
    expect(otherBusiness.error).toBe('NOT_ORDER_OWNER');
    expect(await statusOf(ORDER.I)).toBe('pending');
    expect(await statusOf(ORDER.J)).toBe('confirmed');
  });

  test('validate_pickup_code: el permiso va por sucursal y el orden de los errores se respeta', async () => {
    // El camino bueno: el gerente cierra el pedido de su negocio y el estado se
    // escribe. El pago entra por `accrue_order_earnings`, así que esto no es un
    // UPDATE de mentira.
    const validated = await callRpc(
      POL_MANAGER,
      `public.validate_pickup_code('${ORDER.M}', 'PICKUP-M')`,
    );
    expect(validated).toEqual({
      success: true,
      order_id: ORDER.M,
      status: 'completed',
    });
    expect(await statusOf(ORDER.M)).toBe('completed');

    // ─── EL REGISTRO DE ESTA RECOGIDA, Y LAS DOS COSAS QUE TIENE QUE DECIR ────
    //
    // Lo que sigue afirma DOS propiedades distintas sobre el mismo evento, y las
    // dos importan: que no haya vuelto el duplicado, y que la frase que el
    // duplicado cargaba no se haya perdido con él.
    //
    // `20261015015012` quitó de este RPC un `insert` manual en `order_events`. El
    // `update` de arriba dispara `on_order_status_change`, que escribe el evento
    // por su cuenta, así que la versión vieja dejaba DOS filas de "completado" por
    // cada recogida validada. Quitar el `insert` arregló el número, pero ese
    // `insert` además cargaba `metadata = {"method": "pickup_code"}`, que el
    // trigger no puede saber: no fue él quien validó el código. Ese `method` no
    // está en ninguna otra parte de la base, y sin él "cuántos pedidos se
    // completaron por código y cuántos los completó el negocio" deja de ser
    // respondible desde la tabla de auditoría, sin dejar rastro de que lo fuera.
    //
    // `20261015022233` lo restituye anotando la fila que el trigger ya escribió.
    // Queda un solo evento, y dice las dos cosas.

    // ── (1) LA SUPUESTA QUE SOSTIENE EL CONTEO, HECHA EXPLÍCITA ──────────────
    //
    // "un solo evento" solo quiere decir algo si el trigger dispara UNA vez por
    // fila y el UPDATE de arriba toca UNA fila. La primera es un hecho del
    // catálogo, no un paso de este archivo, así que se afirma: si alguien pasa el
    // trigger a nivel de sentencia, o lo duplica, esta prueba lo dice en vez de
    // seguir dando verde por casualidad.
    const triggerShape = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ row_level: boolean; total: number }[]>(`
        select (t.tgtype & 1) = 1 as row_level, count(*)::int as total
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'orders'
          and not t.tgisinternal and t.tgname = 'on_order_status_change'
        group by 1`),
    );
    expect(
      plainRows(triggerShape),
      '`on_order_status_change` dejó de ser UN trigger FOR EACH ROW sobre orders. ' +
        'Si pasa a ser de sentencia, o si hay más de uno con ese nombre, cada ' +
        'cambio de estado puede escribir más de un evento y el conteo de abajo ' +
        'deja de significar "uno".',
    ).toEqual([{ row_level: true, total: 1 }]);

    // ── (2) EL CONTEO: NI UNA FILA DE MÁS ────────────────────────────────────
    const events = await ctx.sql.unsafe<{ status: string; n: number }[]>(
      `select status::text as status, count(*)::int as n
         from public.order_events where order_id = '${ORDER.M}'
        group by status order by status`,
    );
    // La fila `ready_for_pickup` es la del INSERT del fixture, que dispara el
    // mismo trigger; no forma parte de lo que se mide. Lo que se mide es que el
    // paso a `completed` produzca UN evento y no dos.
    expect(
      plainRows(events),
      'la recogida no dejó exactamente un evento de "completado". El INSERT ' +
        'explícito que la versión anterior de este RPC tenía se quitó ' +
        'justamente porque el trigger `on_order_status_change` ya inserta; si ' +
        'aquí hay dos "completado", alguien lo volvió a poner.',
    ).toEqual([
      { status: 'completed', n: 1 },
      { status: 'ready_for_pickup', n: 1 },
    ]);

    // ── (3) LA FRASE: LA FILA SIGUE DICIENDO QUE FUE POR CÓDIGO ──────────────
    //
    // Se afirma el `metadata` ENTERO y no `metadata->>'method'` suelto, porque la
    // regla es que se fusiona: `source` y `method` son dos hechos distintos del
    // mismo evento, y una implementación que reemplazara el objeto entero
    // perdería `source` —el mismo error que se le atribuye al duplicado, del
    // otro lado—. Las dos claves tienen que estar.
    const marked = await ctx.sql.unsafe<
      { metadata: Record<string, unknown> }[]
    >(`select metadata from public.order_events
        where order_id = '${ORDER.M}' and status = 'completed'`);
    expect(
      plainRows(marked).map((e) => e.metadata),
      'el evento de la recogida perdió el `method: "pickup_code"`, o dejó de ' +
        'decir `source: "database"`. El `method` responde "esta recogida se ' +
        'validó por código y no por confirmación del negocio", y no está en ' +
        'ninguna otra parte de la base: si se pierde aquí, se pierde para siempre.',
    ).toEqual([{ source: 'database', method: 'pickup_code' }]);

    // ── (4) Y QUE LA ANOTACIÓN NO SE DERAME A LOS OTROS EVENTOS ──────────────
    //
    // La corrección de `20261015022233` es un `update` sobre `order_events`, y un
    // `update` sin alcance es el peor de los dos lados posibles. Este evento lo
    // escribió el INSERT del fixture y no lo validó ningún código, así que no
    // lleva `method`: es la fila de más sobre la que el `where` tiene que
    // aparecer `status = 'completed'` para no agarrarla.
    const others = await ctx.sql.unsafe<{ status: string; method: unknown }[]>(
      `select status::text as status, metadata->>'method' as method
         from public.order_events
        where order_id = '${ORDER.M}' and status <> 'completed'
        order by status`,
    );
    expect(
      plainRows(others),
      'la frase "pickup_code" se coló en un evento que no viene de una recogida ' +
        'validada por código. El `update` que la escribe tiene que quedar acotado ' +
        'al evento de este paso a completed.',
    ).toEqual([{ status: 'ready_for_pickup', method: null }]);
    // El código equivocado se dice antes que el estado.
    const wrongCode = await callRpc(
      POL_MANAGER,
      `public.validate_pickup_code('${ORDER.N}', 'no-es-el-codigo')`,
    );
    expect(wrongCode).toEqual({
      success: false,
      error: 'INVALID_CODE',
      message: 'Código de recogida inválido',
    });
    expect(await statusOf(ORDER.N)).toBe('ready_for_pickup');

    // El pedido no está listo.
    const notReady = await callRpc(
      POL_MANAGER,
      `public.validate_pickup_code('${ORDER.O}', 'PICKUP-O')`,
    );
    expect(notReady).toEqual({
      success: false,
      error: 'INVALID_STATUS',
      message: 'El pedido no está listo para recoger',
    });

    // ── EL CÓDIGO ES OBLIGATORIO, Y `null` NO ES UN CÓDIGO ───────────────────
    //
    // `pickup_code` es NOT NULL, pero `p_pickup_code` lo elige quien llama y
    // PostgREST le pasa un `null` de JSON tal cual. Con `<>`, `'ABC123' <> null`
    // da NULL, y en un `if` NULL es lo mismo que FALSE: la rama no se tomaba y
    // el pedido se completaba sin código. El defecto es de `20260615195645`, pero
    // mientras la puerta era del dueño no cambiaba nada observable; ahora la
    // puerta es `can_manage_location` y la abre el cajero de la sucursal, que
    // además accruea ingresos al hacerlo.
    //
    // Se mide como el exploit que es: el CAJERO, no el gerente, porque el
    // gerente ya podía completar el pedido con el código o sin él y no le
    // costaba nada. Y se mide sobre el pedido de SU MISMA sucursal, porque si
    // fuera de otra el `UNAUTHORIZED` de permiso taparía el agujero y la prueba
    // pasaría por la razón equivocada.
    //
    // Se usa ORDER.N, que es el mismo pedido que mide el "código equivocado" de
    // más abajo, y está vivo después de estas dos: las dos lo niegan, así que
    // no lo mueven. El camino bueno ya lo mide el happy path de ORDER.M, arriba,
    // con el código correcto y el gerente.
    const nullCode = await callRpc(
      POL_STAFF,
      `public.validate_pickup_code('${ORDER.N}', null)`,
    );
    expect(
      nullCode,
      'un cajero completó un pedido de su sucursal pasando `null` como código. ' +
        'Con `<>`, `pickup_code <> null` da NULL y el IF no se toma, así que la ' +
        'función caía al update. Tiene que ser `is distinct from`.',
    ).toEqual({
      success: false,
      error: 'INVALID_CODE',
      message: 'Código de recogida inválido',
    });

    // El estado de verdad, no el jsonb que devolvió la función: una función
    // puede devolver un error Y haber escrito.
    expect(
      await statusOf(ORDER.N),
      'el pedido se completó con `null` de código. Esta aserción mira el estado ' +
        'de verdad, no la respuesta.',
    ).toBe('ready_for_pickup');

    // Y el mismo caso con un código equivocado de verdad, porque
    // `is distinct from` tiene que manejar los dos: no basta con que el nulo
    // salte, tiene que seguir saltando el que no es igual.
    const wrongNonNull = await callRpc(
      POL_STAFF,
      `public.validate_pickup_code('${ORDER.N}', 'no-es-el-codigo')`,
    );
    expect(
      wrongNonNull,
      'un código no nulo y equivocado dejó de dar INVALID_CODE al cambiar el ' +
        'comparador por `is distinct from`.',
    ).toEqual({
      success: false,
      error: 'INVALID_CODE',
      message: 'Código de recogida inválido',
    });
    expect(await statusOf(ORDER.N)).toBe('ready_for_pickup');

    // Y el negocio del vecino: nada de eso, ni siquiera con el código bueno.
    const neighbour = await callRpc(
      POL_MANAGER,
      `public.validate_pickup_code('${ORDER.P}', 'PICKUP-P')`,
    );
    expect(neighbour).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'No tienes permiso para validar este pedido',
    });
    expect(await statusOf(ORDER.P)).toBe('ready_for_pickup');

    // Y un pedido que no existe dice `UNAUTHORIZED` y no `ORDER_NOT_FOUND`, que es
    // lo que decía la versión con el `exists`: el permiso se comprueba antes de
    // que exista el pedido, y un cliente que ramifica sobre el código depende de
    // ese orden.
    const missing = await callRpc(
      POL_MANAGER,
      `public.validate_pickup_code('${NO_SUCH_ORDER}', 'lo-que-sea')`,
    );
    expect(missing).toEqual({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'No tienes permiso para validar este pedido',
    });
  });

  test('los grants EXECUTE de los tres RPCs no se mueven', async () => {
    // MEDIDO en la base viva antes de escribir la migración, y no de memoria: el
    // brief decía que `anon` tenía EXECUTE en `cancel_order` y `reserve_offer`, y
    // no lo tiene — `20260906125927_harden_rpc_grants` se lo quitó y el ledger lo
    // dice así, con `20260906130017` aplicando antes por necesidad. Lo que esta
    // migración hace es `create or replace`, que conserva el ACL, así que esto
    // prueba que conservarlo fue cierto y no una intención.
    //
    // Se asserta el CONJUNTO de workables, no la cadena: el `proacl` registra el
    // orden en que se dieron los permisos, y ese orden es historia de una base
    // distinta de la que replayea el harness. Un `grant` de más a un rol que nadie
    // mira —`anon`, `public`— es justo el cambio que rompe otra feature en
    // silencio, y para eso sí alcanza con el conjunto.
    //
    // Y el hueco de `service_role` en `validate_pickup_code` es del HARNESS, no de
    // esta migración: ningún archivo del ledger le concede EXECUTE a
    // `service_role`, llega por los privilegios por defecto de Supabase, y la base
    // que replayea este archivo no los trae. Lo que se afirma es lo que las dos
    // bases dicen —el conjunto del replay, y el invariante de rol de cliente—.
    const acl = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ fn: string; grantees: string[] }[]>(`
        select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
               (select array_agg(x order by x)
                  from unnest(string_to_array(replace(replace(coalesce(p.proacl::text, ''), '{', ''), '}', ''), ',')) as t(x)
                 where x <> '') as grantees
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('cancel_order', 'set_order_status', 'validate_pickup_code', 'reserve_offer')
        order by fn`),
    );

    expect(
      plainRows(acl),
      'el ACL de un RPC de pedidos cambió. `create or replace` lo conserva, así ' +
        'que un cambio aquí es un `grant` o un `revoke` que alguien escribió, y ' +
        'ninguna de las dos cosas es inocua: una mueve quién puede cancelar un ' +
        'pedido y llamar a una función de dinero.',
    ).toEqual([
      {
        fn: 'cancel_order(p_user_id uuid, p_order_id uuid, p_business_id uuid)',
        grantees: [
          'authenticated=X/postgres',
          'postgres=X/postgres',
          'service_role=X/postgres',
        ],
      },
      {
        fn: 'reserve_offer(p_user_id uuid, p_offer_id uuid, p_coupon_id uuid, p_idempotency_key text)',
        grantees: [
          'authenticated=X/postgres',
          'postgres=X/postgres',
          'service_role=X/postgres',
        ],
      },
      {
        fn: 'set_order_status(p_order_id uuid, p_status text)',
        grantees: [
          'authenticated=X/postgres',
          'postgres=X/postgres',
          'service_role=X/postgres',
        ],
      },
      {
        fn: 'validate_pickup_code(p_order_id uuid, p_pickup_code text)',
        grantees: ['authenticated=X/postgres', 'postgres=X/postgres'],
      },
    ]);

    // El invariante que las dos bases comparten, y el que de verdad importa: el
    // panel entra con `authenticated` y el anónimo no entra.
    const clients = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ fn: string; anon: boolean; auth: boolean }[]>(`
        select p.proname as fn,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               has_function_privilege('authenticated', p.oid, 'execute') as auth
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('cancel_order', 'set_order_status', 'validate_pickup_code', 'reserve_offer')
        order by fn`),
    );
    expect(plainRows(clients)).toEqual([
      { fn: 'cancel_order', anon: false, auth: true },
      { fn: 'reserve_offer', anon: false, auth: true },
      { fn: 'set_order_status', anon: false, auth: true },
      { fn: 'validate_pickup_code', anon: false, auth: true },
    ]);

    // Y las dos propiedades de las que depende que el helper se pueda llamar desde
    // dentro: SECURITY DEFINER y el `search_path` vacío. Un `create or replace` las
    // conserva, y si alguna se perdiera la policy nueva no sería un problema de
    // permisos sino una escalada.
    const definer = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ fn: string; secdef: boolean; config: string[] | null }[]>(`
        select p.proname as fn, p.prosecdef as secdef, p.proconfig as config
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('cancel_order', 'set_order_status', 'validate_pickup_code')
        order by fn`),
    );
    expect(plainRows(definer)).toEqual([
      { fn: 'cancel_order', secdef: true, config: ['search_path=""'] },
      { fn: 'set_order_status', secdef: true, config: ['search_path=""'] },
      { fn: 'validate_pickup_code', secdef: true, config: ['search_path=""'] },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOS LÍMITES DEL PLAN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ─── POR QUÉ UN TRIGGER Y NO UN GUARD ────────────────────────────────────────
 *
 * El panel escribe directo a Supabase, así que un límite comprobado en el API se
 * salta con un `insert` desde el dispositivo (§5.3). Estos dos triggers son la
 * frontera, y por eso el bloque mira el CATÁLOGO además del comportamiento: que
 * sean `BEFORE INSERT OR UPDATE` es lo que hace imposible que bloqueen una
 * lectura, y eso no se ve en ningún `expect` de comportamiento.
 *
 * ─── EL GRANDFATHERED SE SIEMBRA POR ENCIMA Y DESPUÉS BAJA DE PLAN ───────────
 *
 * Un negocio con tres sucursales bajo `free` es la promesa del §5.4, y no se
 * puede sembrar por el camino obvio: el trigger rechazaría la segunda. Se siembra
 * con `pro_plus`, que no tiene tope, y después se le baja el plan a `free`. Eso
 * es exactamente lo que pasó en producción —13 de los 13 negocios con
 * sucursales están en `free`, y uno tiene tres sucursales—, y es el único camino
 * por el que un negocio llega a estar por encima de un tope sin que el motor lo
 * haya dejado pasar.
 *
 * ─── LO QUE ESTE BLOQUE NO MIDE ─────────────────────────────────────────────
 *
 * Que la API no deje crear la sucursal a un gerente (§5.3): eso es el guard del
 * Plan 2, y el trigger de sucursales NO lleva esa salida a propósito. Una
 * sucursal nueva consume cupo la cree quien la cree, y lo que se prueba aquí es
 * justamente eso —que el dueño tampoco tiene salida—, no quién puede crearla.
 */
describe('los límites del plan bloquean crecer, no operar', () => {
  let ctx: SupabaseTestDb;

  const LIM_OWNER = 'dddddddd-0000-4000-8000-000000000001';
  const LIM_STAFF = 'dddddddd-0000-4000-8000-000000000002';
  const USER_3 = 'dddddddd-0000-4000-8000-000000000003';
  const USER_4 = 'dddddddd-0000-4000-8000-000000000004';
  const USER_5 = 'dddddddd-0000-4000-8000-000000000005';
  const USER_6 = 'dddddddd-0000-4000-8000-000000000006';
  const USER_7 = 'dddddddd-0000-4000-8000-000000000007';

  const BIZ_FREE = 'aaaaaaaa-0000-4000-8000-000000000003';
  const BIZ_GRANDFATHERED = 'aaaaaaaa-0000-4000-8000-000000000004';
  const BIZ_AT_LIMIT = 'aaaaaaaa-0000-4000-8000-000000000005';
  const BIZ_PLAN_DELETED = 'aaaaaaaa-0000-4000-8000-000000000006';
  const BIZ_PRO = 'aaaaaaaa-0000-4000-8000-000000000007';
  const BIZ_PRO_PLUS = 'aaaaaaaa-0000-4000-8000-000000000008';
  const BIZ_ROOM = 'aaaaaaaa-0000-4000-8000-000000000009';
  const BIZ_MOVES_FROM = 'aaaaaaaa-0000-4000-8000-00000000000a';
  const BIZ_MOVES_TO = 'aaaaaaaa-0000-4000-8000-00000000000b';
  const BIZ_MOVES_ROOM = 'aaaaaaaa-0000-4000-8000-00000000000c';
  const BIZ_ARCHIVED = 'aaaaaaaa-0000-4000-8000-00000000000d';
  const BIZ_ARCHIVED_ROOM = 'aaaaaaaa-0000-4000-8000-00000000000e';
  const BIZ_BULK = 'aaaaaaaa-0000-4000-8000-00000000000f';

  const LOC_FREE = 'bbbbbbbb-0000-4000-8000-000000000001';
  const LOC_GF = [
    'bbbbbbbb-0000-4000-8000-000000000011',
    'bbbbbbbb-0000-4000-8000-000000000012',
    'bbbbbbbb-0000-4000-8000-000000000013',
  ] as const;
  const LOC_LIMIT_ON = 'bbbbbbbb-0000-4000-8000-000000000021';
  const LOC_LIMIT_OFF = 'bbbbbbbb-0000-4000-8000-000000000022';
  const LOC_PLAN_DELETED = 'bbbbbbbb-0000-4000-8000-000000000031';

  const MEM_FREE_OWNER = 'c1000000-0000-4000-8000-000000000001';
  const MEM_FREE_STAFF = 'c1000000-0000-4000-8000-000000000002';
  const MEM_GF = [
    'c1000000-0000-4000-8000-000000000011',
    'c1000000-0000-4000-8000-000000000012',
    'c1000000-0000-4000-8000-000000000013',
  ] as const;
  const MEM_DELETED_PLAN = [
    'c1000000-0000-4000-8000-000000000031',
    'c1000000-0000-4000-8000-000000000032',
  ] as const;
  const MEM_ROOM_OWNER = 'c1000000-0000-4000-8000-000000000041';
  const MEM_MOVE_A = 'c1000000-0000-4000-8000-000000000051';
  const MEM_MOVE_B = 'c1000000-0000-4000-8000-000000000052';
  const LOC_MOVE_FROM = 'bbbbbbbb-0000-4000-8000-000000000061';
  const LOC_MOVE_ROOM = 'bbbbbbbb-0000-4000-8000-000000000062';

  // El negocio en el tope CON ARCHIVADOS: dos accesos vivos —el tope de `free`—
  // más cuatro dados de baja, y su dueño. Los archivados son los que hacen que
  // «restaurar» y «bajar un dueño» sean las dos escrituras que consumen una plaza
  // sin que su `business_id` cambie y sin que la fila se inserte.
  const MEM_ARCH_OWNER = 'c1000000-0000-4000-8000-000000000071';
  const MEM_ARCH_LIVE = [
    'c1000000-0000-4000-8000-000000000072',
    'c1000000-0000-4000-8000-000000000073',
  ] as const;
  const MEM_ARCH_DEAD = [
    'c1000000-0000-4000-8000-000000000074',
    'c1000000-0000-4000-8000-000000000075',
    'c1000000-0000-4000-8000-000000000076',
    'c1000000-0000-4000-8000-000000000077',
  ] as const;

  // Y su gemelo con sitio: mismo dueño, cero accesos vivos, dos archivados. Sirve
  // de control positivo para las dos escrituras, y por eso comparte negocio con
  // ellas: los controles tienen que poder pasar y a la vez dejar el negocio donde
  // el paso siguiente espera encontrarlo.
  const MEM_ROOMARCH_OWNER = 'c1000000-0000-4000-8000-000000000081';
  const MEM_ROOMARCH_DEAD = [
    'c1000000-0000-4000-8000-000000000082',
    'c1000000-0000-4000-8000-000000000083',
  ] as const;

  beforeAll(async () => {
    ctx = await createSupabaseTestDb();

    await ctx.sql.begin(async (tx) => {
      for (const [id, email] of [
        [LIM_OWNER, 'limits-owner@test'],
        [LIM_STAFF, 'limits-staff@test'],
        [USER_3, 'limits-tres@test'],
        [USER_4, 'limits-cuarto@test'],
        [USER_5, 'limits-quinto@test'],
        [USER_6, 'limits-sexto@test'],
        [USER_7, 'limits-septimo@test'],
      ] as const) {
        await tx.unsafe(
          `insert into auth.users (id, email) values ('${id}', '${email}')
           on conflict (id) do nothing`,
        );
      }

      await tx.unsafe(`
        insert into public.businesses (id, name, type, slug)
        values ('${BIZ_FREE}',          'Límites free',           'restaurant', 'limits-free'),
               ('${BIZ_GRANDFATHERED}', 'Límites grandfathered', 'restaurant', 'limits-grandfathered'),
               ('${BIZ_AT_LIMIT}',      'Límites en el tope',     'restaurant', 'limits-at-limit'),
               ('${BIZ_PLAN_DELETED}',  'Límites plan borrado',   'restaurant', 'limits-plan-deleted'),
               ('${BIZ_PRO}',           'Límites pro',            'restaurant', 'limits-pro'),
               ('${BIZ_PRO_PLUS}',      'Límites pro plus',       'restaurant', 'limits-pro-plus'),
               ('${BIZ_ROOM}',          'Límites con sitio',      'restaurant', 'limits-room'),
               ('${BIZ_MOVES_FROM}',   'Límites mudanza origen', 'restaurant', 'limits-moves-from'),
               ('${BIZ_MOVES_TO}',     'Límites mudanza destino', 'restaurant', 'limits-moves-to'),
               ('${BIZ_MOVES_ROOM}',   'Límites mudanza sitio', 'restaurant', 'limits-moves-room'),
               ('${BIZ_ARCHIVED}',      'Límites con archivo', 'restaurant', 'limits-archived'),
               ('${BIZ_ARCHIVED_ROOM}', 'Límites archivo sitio', 'restaurant', 'limits-archived-room'),
               ('${BIZ_BULK}',          'Límites una sentencia', 'restaurant', 'limits-bulk');

        insert into public.business_ownership (business_id, owner_id)
        select b.id, '${LIM_OWNER}'::uuid from public.businesses b
        where b.id in ('${BIZ_FREE}', '${BIZ_GRANDFATHERED}', '${BIZ_AT_LIMIT}',
                       '${BIZ_PLAN_DELETED}', '${BIZ_PRO}', '${BIZ_PRO_PLUS}',
                       '${BIZ_ROOM}', '${BIZ_MOVES_FROM}', '${BIZ_MOVES_TO}',
                       '${BIZ_MOVES_ROOM}', '${BIZ_ARCHIVED}',
                       '${BIZ_ARCHIVED_ROOM}', '${BIZ_BULK}');
      `);

      // El plan va PRIMERO y por razones distintas en cada negocio: el
      // grandfathered entra en `pro_plus` para poder sembrarse por encima del
      // tope y bajar después, y el de plan borrado nace con la fila `pro` ya
      // en `deleted_at` — que es como se ve un negocio al que le borraron el
      // plan, no un negocio sin fila.
      await tx.unsafe(`
        insert into public.business_plans_state (business_id, plan_code, deleted_at)
        values ('${BIZ_GRANDFATHERED}', 'pro_plus', null),
               ('${BIZ_PLAN_DELETED}',   'pro',       now()),
               ('${BIZ_PRO}',            'pro',       null),
               ('${BIZ_PRO_PLUS}',       'pro_plus',  null);
      `);

      await tx.unsafe(`
        insert into public.business_locations
          (id, business_id, name, address, latitude, longitude, is_active)
        values ('${LOC_FREE}',          '${BIZ_FREE}',          'Única',   'dir', 0, 0, true),
               ('${LOC_GF[0]}',         '${BIZ_GRANDFATHERED}', 'G1',      'dir', 0, 0, true),
               ('${LOC_GF[1]}',         '${BIZ_GRANDFATHERED}', 'G2',      'dir', 0, 0, true),
               ('${LOC_GF[2]}',         '${BIZ_GRANDFATHERED}', 'G3',      'dir', 0, 0, true),
               ('${LOC_LIMIT_ON}',      '${BIZ_AT_LIMIT}',      'Abierta', 'dir', 0, 0, true),
               ('${LOC_LIMIT_OFF}',     '${BIZ_AT_LIMIT}',      'Cerrada', 'dir', 0, 0, false),
               ('${LOC_PLAN_DELETED}',  '${BIZ_PLAN_DELETED}',  'Matriz',  'dir', 0, 0, true),
               ('${LOC_MOVE_FROM}',      '${BIZ_MOVES_FROM}',    'Suelta', 'dir', 0, 0, true),
               ('${LOC_MOVE_ROOM}',      '${BIZ_MOVES_ROOM}',    'Suelta', 'dir', 0, 0, true);
      `);

      await tx.unsafe(`
        insert into public.business_members
          (id, business_id, user_id, role, label, alias,
           status, session_ttl_hours, last_authenticated_at)
        values ('${MEM_FREE_OWNER}',   '${BIZ_FREE}',          '${LIM_OWNER}', 'owner', 'Dueña',   'limits-owner@test',          'active', 24, now()),
               ('${MEM_FREE_STAFF}',   '${BIZ_FREE}',          '${LIM_STAFF}', 'staff', 'Cajero',  'limits-staff@test',          'active', 24, now()),
               ('${MEM_GF[0]}',        '${BIZ_GRANDFATHERED}', '${LIM_STAFF}', 'staff', 'G1',      'limits-gf-1@test',           'active', 24, now()),
               ('${MEM_GF[1]}',        '${BIZ_GRANDFATHERED}', '${USER_3}',    'staff', 'G2',      'limits-gf-2@test',           'active', 24, now()),
               ('${MEM_GF[2]}',        '${BIZ_GRANDFATHERED}', '${USER_4}',    'staff', 'G3',      'limits-gf-3@test',           'active', 24, now()),
               ('${MEM_DELETED_PLAN[0]}', '${BIZ_PLAN_DELETED}', '${LIM_STAFF}', 'staff', 'Uno', 'limits-plan-1@test',      'active', 24, now()),
               ('${MEM_DELETED_PLAN[1]}', '${BIZ_PLAN_DELETED}', '${USER_3}',    'staff', 'Dos', 'limits-plan-2@test',      'active', 24, now()),
               ('${MEM_ROOM_OWNER}',   '${BIZ_ROOM}',          '${LIM_OWNER}', 'owner', 'Dueña',   'limits-room-owner@test',     'active', 24, now()),
               ('${MEM_MOVE_A}',         '${BIZ_MOVES_FROM}',    '${LIM_STAFF}', 'staff', 'Mudanza A', 'limits-move-a@test',      'active', 24, now()),
               ('${MEM_MOVE_B}',         '${BIZ_MOVES_FROM}',    '${USER_3}',    'staff', 'Mudanza B', 'limits-move-b@test',      'active', 24, now());
      `);

      // Los dos negocios del «archivo», con su `deleted_at` YA PUESTO en el mismo
      // `insert` y no puesto después con un `update`. No es un atajo: sembrarlos
      // vivos y archivarlos luego es imposible por diseño, porque el cuarto
      // `insert` de un staff vivo ya se choca contra el tope de 2 —que es
      // justamente la propiedad que el test del statement masivo mide—. La vía
      // real es `set deleted_at`, que es una escritura que NO suma, y por eso el
      // `insert` es la única forma de llegar a un negocio «en el tope con
      // archivados», que es el estado que un negocio real tiene después de dar de
      // baja a su equipo durante un año.
      await tx.unsafe(`
        insert into public.business_members
          (id, business_id, user_id, role, label, alias,
           status, session_ttl_hours, last_authenticated_at, deleted_at)
        values ('${MEM_ARCH_OWNER}',    '${BIZ_ARCHIVED}',      '${LIM_OWNER}', 'owner', 'Dueña',   'limits-arch-owner@test',   'active', 24, now(), null),
               ('${MEM_ARCH_DEAD[0]}',  '${BIZ_ARCHIVED}',      '${USER_4}',    'staff', 'Archivada 1', 'limits-arch-1@test',    'active', 24, now(), now()),
               ('${MEM_ARCH_DEAD[1]}',  '${BIZ_ARCHIVED}',      '${USER_5}',    'staff', 'Archivada 2', 'limits-arch-2@test',    'active', 24, now(), now()),
               ('${MEM_ARCH_DEAD[2]}',  '${BIZ_ARCHIVED}',      '${USER_6}',    'staff', 'Archivada 3', 'limits-arch-3@test',    'active', 24, now(), now()),
               ('${MEM_ARCH_DEAD[3]}',  '${BIZ_ARCHIVED}',      '${USER_7}',    'staff', 'Archivada 4', 'limits-arch-4@test',    'active', 24, now(), now()),
               ('${MEM_ROOMARCH_OWNER}', '${BIZ_ARCHIVED_ROOM}', '${LIM_OWNER}', 'owner', 'Dueña',  'limits-archroom-owner@test', 'active', 24, now(), null),
               ('${MEM_ROOMARCH_DEAD[0]}', '${BIZ_ARCHIVED_ROOM}', '${USER_4}', 'staff', 'Archivada A', 'limits-archroom-1@test', 'active', 24, now(), now()),
               ('${MEM_ROOMARCH_DEAD[1]}', '${BIZ_ARCHIVED_ROOM}', '${USER_5}', 'staff', 'Archivada B', 'limits-archroom-2@test', 'active', 24, now(), now());
      `);

      // Los dos accesos VIVOS del negocio en el tope van en DOS sentencias y no en
      // una multi-fila, a propósito: sembrarlos juntos depende de que la segunda
      // fila de un statement vea a la primera, que es exactamente la propiedad que
      // el test del statement masivo mide. Un fixture que dependiera de ella haría
      // que un fallo en esa propiedad se manifestara como quince tests rojos en el
      // `beforeAll` en vez de como un test rojo que la nombra.
      await tx.unsafe(`
        insert into public.business_members
          (id, business_id, user_id, role, label, alias,
           status, session_ttl_hours, last_authenticated_at)
        values ('${MEM_ARCH_LIVE[0]}', '${BIZ_ARCHIVED}', '${LIM_STAFF}', 'staff', 'Viva 1', 'limits-arch-live-1@test', 'active', 24, now());
      `);
      await tx.unsafe(`
        insert into public.business_members
          (id, business_id, user_id, role, label, alias,
           status, session_ttl_hours, last_authenticated_at)
        values ('${MEM_ARCH_LIVE[1]}', '${BIZ_ARCHIVED}', '${USER_3}', 'staff', 'Viva 2', 'limits-arch-live-2@test', 'active', 24, now());
      `);

      // Los números del §4.5 sembrados DE VERDAD —5 sucursales y 20 miembros en
      // `pro`— para que el tope se mida contra el número y no contra una
      // suposición sobre lo que dice un `case`. `generate_series` porque veinte
      // filas escritas a mano son veinte filas que alguien va a contar mal, y
      // porque la quinta sucursal es justo la que tiene que entrar: es la que
      // separa "admite cinco" de "admite cuatro".
      await tx.unsafe(`
        insert into auth.users (id, email)
        select gen_random_uuid(), 'limits-pro-' || n || '@test'
        from generate_series(1, 20) n;

        insert into public.business_members (business_id, user_id, role, label, alias)
        select '${BIZ_PRO}', u.id, 'staff', 'Pro', u.email
        from auth.users u
        where u.email like 'limits-pro-%@test';

        insert into public.business_locations (business_id, name, address, latitude, longitude)
        select '${BIZ_PRO}'::uuid, 'Pro ' || n, 'dir', 0, 0 from generate_series(1, 5) n
        union all
        select '${BIZ_PRO_PLUS}'::uuid, 'Plus ' || n, 'dir', 0, 0 from generate_series(1, 5) n;
      `);

      // Y POR ÚLTIMO LE BAJAN EL PLAN. A partir de acá el negocio tiene tres
      // sucursales y tres accesos bajo `free`, que es un estado que el motor no
      // habría dejado crear y que el §5.4 perdona.
      await tx.unsafe(
        `update public.business_plans_state
            set plan_code = 'free'
          where business_id = '${BIZ_GRANDFATHERED}'`,
      );
    });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  /**
   * Accesos VIVOS que no son del dueño — el número que el tope del §4.5 cuenta, y
   * el mismo predicado que el trigger usa para `v_otros`. Es un helper y no tres
   * `select` escritos a mano porque estos tests lo llaman ANTES y DESPUÉS de la
   * escritura, y una aserción que sólo mira el error no puede distinguir «el
   * trigger lo negó» de «el trigger lo negó y el statement no dejó basura».
   */
  async function liveStaff(businessId: string): Promise<number> {
    const rows = plainRows(
      await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ n: number }[]>(`
          select count(*)::int as n
            from public.business_members m
           where m.business_id = '${businessId}'
             and m.role <> 'owner'::public.business_member_role
             and m.deleted_at is null`),
      ),
    );
    return rows[0]?.n ?? -1;
  }

  /** Sucursales activas de un negocio: el otro número que los topes cuentan. */
  async function activeLocations(businessId: string): Promise<number> {
    const rows = plainRows(
      await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ n: number }[]>(`
          select count(*)::int as n
            from public.business_locations l
           where l.business_id = '${businessId}'
             and l.is_active`),
      ),
    );
    return rows[0]?.n ?? -1;
  }

  // ─── LO QUE NO SE PUEDE: CRECER ────────────────────────────────────────────

  test('un negocio free no crea su segunda sucursal', async () => {
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_FREE}', 'Segunda', 'dir', 0, 0)`,
      ),
    );

    // `toBe` y no `toContain`: el mensaje es lo que la UI le muestra al dueño
    // para decirle qué pasó, así que el código del plan tiene que estar EN ÉL y
    // no en el error de al lado. Con un `toContain('plan free')` pasaría un
    // mensaje que dice "el plan  no incluye…", que es lo que salía cuando el
    // `raise` usaba una variable que todavía no tenía valor.
    expect(err?.message).toBe('el plan free admite hasta 1 sucursal, no más');
    expect(err?.code).toBe('P0001');
  });

  test('el dueño no cuenta para el tope de miembros', async () => {
    // Ya hay dueño + 1 staff; este es el segundo y debe entrar.
    const ok = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_FREE}', '${USER_3}', 'staff', 'Segundo', 'segundo@x.role.ec')
         returning id`,
      ),
    );
    expect(plainRows(ok)).toHaveLength(1);

    // Y el tercero es el que rebota: el dueño no consumió cupo.
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_FREE}', '${USER_4}', 'staff', 'Tercero', 'tercero@x.role.ec')`,
      ),
    );
    expect(err?.message).toBe('el plan free admite hasta 2 miembros, no más');
  });

  // ─── LO QUE SÍ SE PUEDE, Y QUE ES EL §5.4 ENTERO ──────────────────────────
  //
  // El trigger es `before insert or update`, así que un UPDATE también pasa por
  // él. Un conteo literal de las filas que ya existen haría que renombrar una
  // sucursal de un negocio por encima del tope fallara —que es exactamente el
  // "meterle un lock a una panadería un viernes a las 5" que el §5.3 descarta—.

  test('un negocio por encima del límite sigue operando', async () => {
    // Grandfathering: 3 sucursales bajo plan free. Nada de esto puede fallar.
    const ok = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set name = 'Renombrada'
          where business_id = '${BIZ_GRANDFATHERED}' and is_active = true
          returning id`,
      ),
    );
    expect(plainRows(ok)).toHaveLength(3);
  });

  test('un negocio por encima del límite tampoco crea su cuarta sucursal', async () => {
    // La mitad que el brief no pedía y que es la que hace que la anterior
    // signifique algo: si el motor perdonara el exceso, también lo dejaría
    // crecer, y "sigue operando" se volvería "no tiene límite".
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_GRANDFATHERED}', 'Cuarta', 'dir', 0, 0)`,
      ),
    );
    expect(err?.message).toBe('el plan free admite hasta 1 sucursal, no más');
  });

  test('reactivar una sucursal cerrada con el tope encima se rechaza', async () => {
    // Cerrar una sucursal la saca del conteo, y volverla a abrir es crecer. Sin
    // esta mitad, el tope dependería del `is_active` de cada fila y no de lo que
    // hace la escritura: una panadería podría apagar sus tres sucursales para
    // abrir la cuarta.
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `update public.business_locations set is_active = true
          where id = '${LOC_LIMIT_OFF}'`,
      ),
    );
    expect(err?.message).toBe('el plan free admite hasta 1 sucursal, no más');

    // Y apagarla sí: el tope frena crecer, no el trabajo de casa.
    const closed = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set is_active = false
          where id = '${LOC_LIMIT_ON}' returning id`,
      ),
    );
    expect(plainRows(closed)).toHaveLength(1);

    // Con la plaza liberada, la misma operación que un momento antes rebotaba
    // entra. Si esto fallara, lo que se estaría midiendo es el `where`, no el
    // tope.
    const reopened = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set is_active = true
          where id = '${LOC_LIMIT_ON}' returning id`,
      ),
    );
    expect(plainRows(reopened)).toHaveLength(1);
  });

  test('editar los accesos de un negocio por encima del tope tampoco falla', async () => {
    // El mismo caso del otro lado de la asimetría: cambiar el `label`, el
    // `alias` o el `role` de una fila que ya existe no agrega ninguna fila al
    // conteo, así que no puede rebotar por el mismo motivo que un `rename`.
    const ok = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_members set label = 'Renombrado'
          where business_id = '${BIZ_GRANDFATHERED}' and deleted_at is null
          returning id`,
      ),
    );
    expect(plainRows(ok)).toHaveLength(3);
  });

  // ─── EL PLAN SE LEE POR SU FILA VIVA, Y EL MENSAJO LO DICE ─────────────────

  test('una fila de plan borrada se lee como free, y el mensaje lo dice', async () => {
    // `business_plans_state` tiene `deleted_at`, así que un plan puede seguir
    // escrito y no estar vigente. `business_has_feature` lo tiene en cuenta; el
    // mensaje que le devuelve este trigger al dueño tiene que decir lo mismo,
    // porque si dijera `pro` le estaría enseñando el plan que ya no tiene.
    const denied = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_PLAN_DELETED}', 'Segunda', 'dir', 0, 0)`,
      ),
    );
    expect(denied?.message).toBe(
      'el plan free admite hasta 1 sucursal, no más',
    );

    const deniedMember = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PLAN_DELETED}', '${USER_4}', 'staff', 'Tercero', 'tercero@x.role.ec')`,
      ),
    );
    expect(deniedMember?.message).toBe(
      'el plan free admite hasta 2 miembros, no más',
    );

    // Y que los dos digan `free` no es una coincidencia de este test: es que las
    // dos respuestas salen del mismo sitio. Un mensaje que dijera `pro` le
    // estaría cobrando a un dueño un plan que ya no tiene.
    //
    // La comprobación va como `authenticated` y no como `service_role` porque
    // `authenticated` es el rol con EXECUTE GRANTEO en `20261015003929`, y
    // `service_role` lo tiene en producción sólo por el blanket default de
    // Supabase sobre funciones de `public`, que el harness no reproduce a
    // propósito (`supabase-platform.ts`: "ON FUNCTIONS IN public THIS
    // DELIBERATELY GRANTS NOTHING"). Como `service_role` el `select` rebotaría
    // con `42501` y el test mediría el ACL en vez de la feature.
    const read = await as(ctx.sql, 'authenticated', LIM_OWNER, (tx) =>
      tx.unsafe<{ staff_access: boolean }[]>(`
        select public.business_has_feature(
                 '${BIZ_PLAN_DELETED}'::uuid,
                 'staff_access'::public.business_feature) as staff_access`),
    );
    expect(plainRows(read)[0]?.staff_access).toBe(true);
  });

  // ─── LOS NÚMEROS DEL §4.5, MEDIDOS Y NO DECLARADOS ────────────────────────

  test('pro admite cinco sucursales y veinte miembros, y no uno más', async () => {
    const sixth = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_PRO}', 'Sexta', 'dir', 0, 0)`,
      ),
    );
    expect(sixth?.message).toBe(
      'el plan pro admite hasta 5 sucursales, no más',
    );

    const twentyFirst = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${LIM_OWNER}', 'staff', 'Número 21', 'pro-21@x.role.ec')`,
      ),
    );
    expect(twentyFirst?.message).toBe(
      'el plan pro admite hasta 20 miembros, no más',
    );
  });

  test('pro_plus no tiene tope: ni de sucursales ni de miembros', async () => {
    // Dos más que `pro` en cada cosa. Si el `case` de `pro_plus` devolviera un
    // número en vez de `null`, esta prueba lo diría.
    const sixth = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_PRO_PLUS}', 'Sexta', 'dir', 0, 0)
         returning id`,
      ),
    );
    expect(plainRows(sixth)).toHaveLength(1);

    for (const userId of [LIM_STAFF, USER_3, USER_4]) {
      const ok = await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ id: string }[]>(
          `insert into public.business_members
             (business_id, user_id, role, label, alias)
           values ('${BIZ_PRO_PLUS}', '${userId}', 'staff', 'Plus', '${userId}-plus@x.role.ec')
           returning id`,
        ),
      );
      expect(plainRows(ok)).toHaveLength(1);
    }
  });

  // ─── LA ASIMETRIA QUE HAY QUE MANTENER ─────────────────────────────────────
  //
  // En `business_members` el dueño no consume cupo y por eso el trigger sale
  // antes de contar. En `business_locations` NO hay esa salida: una sucursal
  // nueva consume cupo la cree quien la cree. Lo que decide quién puede crearla
  // es la policy de INSERT del §6.2, y eso lo aplica el API en el Plan 2.

  test('una sucursal nueva consume cupo aunque la pida el dueño', async () => {
    // El control positivo va PRIMERO, y es la mitad que hace válida la otra:
    // sin él, un `P0001` podría ser cualquier cosa, incluso que el dueño no
    // pueda crear sucursales por RLS y este test no estar probando el tope.
    const first = await as(ctx.sql, 'authenticated', LIM_OWNER, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_ROOM}', 'Primera', 'dir', 0, 0)
         returning id`,
      ),
    );
    expect(plainRows(first)).toHaveLength(1);

    // Y la segunda es la misma persona, la misma sesión y el mismo negocio.
    const err = await deniedAs(ctx.sql, 'authenticated', LIM_OWNER, (tx) =>
      tx.unsafe(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_ROOM}', 'Segunda', 'dir', 0, 0)`,
      ),
    );

    // `P0001` y no `42501` es la prueba de que el trigger es lo que lo paró: en
    // Postgres las policies son un trigger AFTER, así que el BEFORE corre
    // primero y el mensaje es el suyo. Un `42501` sería RLS, y significaría que
    // este test no midió el tope.
    expect(err?.code).toBe('P0001');
    expect(err?.message).toBe('el plan free admite hasta 1 sucursal, no más');
  });

  // ─── UNA MUDANZA ENTRE NEGOCIOS SE MIDE CONTRA EL DESTINO ──────────────────

  test('mover una fila entre negocios se mide contra el de destino, no el de origen', async () => {
    // `business_id` no lo cambia nadie en el producto hoy, y por eso este caso
    // es de los que se dejan sin probar. Pero el trigger corre en cada UPDATE,
    // así que la fila de `v_agrega` que decide esto
    // —`old.business_id is distinct from new.business_id`— necesita estar
    // probada: si no, la mudanza sería la puerta de atrás del tope, la forma más
    // barata de pasar de un negocio sin cupo a uno que tampoco lo tiene.
    //
    // Para el DESTINO la fila es nueva. Eso es lo que se mide aquí, en las dos
    // tablas y en los dos sentidos, y los controles van PRIMERO: sin ellos un
    // `P0001` podría ser un trigger roto en vez del tope.
    //
    // Los tres negocios nacen sin fila de plan, que es como se ve un negocio en
    // `free` —la ausencia y la fila borrada son lo mismo para
    // `business_plan_of`— y arrancan así: FROM con dos accesos y una sucursal
    // (justo en sus topes), TO vacío, y ROOM con una sucursal y sin accesos.

    // ─── Miembros ──────────────────────────────────────────────────────────
    const memberToEmpty = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_members set business_id = '${BIZ_MOVES_TO}'
          where id = '${MEM_MOVE_A}' returning id`,
      ),
    );
    expect(plainRows(memberToEmpty)).toHaveLength(1);

    const secondToEmpty = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_members set business_id = '${BIZ_MOVES_TO}'
          where id = '${MEM_MOVE_B}' returning id`,
      ),
    );
    expect(plainRows(secondToEmpty)).toHaveLength(1);

    // Un tercero nuevo en el ORIGEN, que tiene sitio de sobra: lo que se
    // prepara aquí es una mudanza con un origen vacío de cuota y un destino
    // lleno. Si la regla fuera «cuenta el de origen», esto entraría.
    const newcomer = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_MOVES_FROM}', '${USER_4}', 'staff', 'Recién llegado', 'limits-move-c@test')
         returning id`,
      ),
    );
    const newcomerId = plainRows(newcomer)[0]?.id;
    expect(newcomerId).toBeString();

    const memberIntoFull = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `update public.business_members set business_id = '${BIZ_MOVES_TO}'
          where id = '${newcomerId}'`,
      ),
    );
    expect(memberIntoFull?.code).toBe('P0001');
    expect(memberIntoFull?.message).toBe(
      'el plan free admite hasta 2 miembros, no más',
    );

    // ─── Sucursales, el mismo molde ───────────────────────────────────────
    const locationToEmpty = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set business_id = '${BIZ_MOVES_TO}'
          where id = '${LOC_MOVE_FROM}' returning id`,
      ),
    );
    expect(plainRows(locationToEmpty)).toHaveLength(1);

    const secondLocation = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_MOVES_FROM}', 'Segunda', 'dir', 0, 0) returning id`,
      ),
    );
    const secondLocationId = plainRows(secondLocation)[0]?.id;
    expect(secondLocationId).toBeString();

    const locationIntoFull = await deniedAs(
      ctx.sql,
      'service_role',
      null,
      (tx) =>
        tx.unsafe(
          `update public.business_locations set business_id = '${BIZ_MOVES_TO}'
          where id = '${secondLocationId}'`,
        ),
    );
    expect(locationIntoFull?.code).toBe('P0001');
    expect(locationIntoFull?.message).toBe(
      'el plan free admite hasta 1 sucursal, no más',
    );
  });

  // ─── LAS TRES FORMAS DE QUE UNA ESCRITURA CONSUMA UNA PLAZA ────────────────
  //
  // `v_agrega` de `enforce_business_member_limit` tiene tres ramas, y las tres
  // son «esta escritura está METIENDO una fila en el conteo»:
  //
  //     v_agrega := new.deleted_at is null
  //                and (old.role = 'owner'          <-- bajar un dueño
  //                     or old.deleted_at is not null   <-- restaurar un archivado
  //                     or old.business_id is distinct from new.business_id);  <-- mudanza
  //
  // La tercera ya la medía el test de la mudanza. Las otras dos no las medía
  // NADA, y son las dos que un negocio con el tope encima usaría sin levantar la
  // voz: restaurar a alguien que se fue hace un mes, y «rebajar al dueño a
  // empleado». Ninguna cambia el `business_id` y ninguna inserta una fila, así que
  // las dos se esconden detrás de un `set deleted_at = null` y un `set role` que
  // parecen no mover nada. La única forma de saber que el trigger las ve es
  // pedirle que las mida.

  test('restaurar un acceso archivado se mide contra el tope', async () => {
    // Control positivo PRIMERO, por la razón de `:3773`: un `P0001` en un test
    // sin control puede ser un trigger roto, una policy, o el tope. Y va primero
    // porque además fija el punto de partida del negativo: si restaurar no
    // funciona NINGÚN sitio, el rechazo de más abajo no dice nada.
    const antesDelControl = await liveStaff(BIZ_ARCHIVED_ROOM);
    const control = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_members set deleted_at = null
          where id = '${MEM_ROOMARCH_DEAD[0]}' returning id`,
      ),
    );
    expect(plainRows(control)).toHaveLength(1);
    expect(await liveStaff(BIZ_ARCHIVED_ROOM)).toBe(antesDelControl + 1);

    // Y ahora el mismo statement contra un negocio que YA está en el tope, donde
    // queda un archivado de sobra por si alguien quiere ver que hay cuatro y no
    // uno.
    expect(await liveStaff(BIZ_ARCHIVED)).toBe(2);

    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `update public.business_members set deleted_at = null
          where id = '${MEM_ARCH_DEAD[0]}'`,
      ),
    );

    // `P0001` y no `42501`: en Postgres las policies son un trigger AFTER, así que
    // el BEFORE corre primero y el mensaje es el suyo. Un `42501` sería RLS, y
    // significaría que este test no midió el tope — o sea que la rama probada no
    // es la que dice que dice.
    expect(err?.code).toBe('P0001');
    expect(err?.message).toBe('el plan free admite hasta 2 miembros, no más');

    // Y el conteo DESPUÉS, que es la mitad de la aserción: que el error haya
    // llegado no dice por sí solo que la fila siga archivada. Se dice mirando.
    expect(await liveStaff(BIZ_ARCHIVED)).toBe(2);
    const stillArchived = plainRows(
      await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ deleted: boolean }[]>(`
          select (m.deleted_at is not null) as deleted
            from public.business_members m where m.id = '${MEM_ARCH_DEAD[0]}'`),
      ),
    );
    expect(stillArchived[0]?.deleted).toBe(true);
  });

  test('bajar un dueño a staff se mide contra el tope', async () => {
    // Control positivo primero, y por el mismo motivo que arriba: un `set role`
    // que el trigger viera mal negaría también aquí, y sin el control el rechazo
    // de más abajo sería indistinguible de un trigger que niega todo.
    const antesDelControl = await liveStaff(BIZ_ARCHIVED_ROOM);
    const control = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_members set role = 'staff'
          where id = '${MEM_ROOMARCH_OWNER}' returning id`,
      ),
    );
    expect(plainRows(control)).toHaveLength(1);
    // Y el conteo se mueve UNA plaza: es lo que hace que el paso siguiente sea el
    // caso interesante y no una repetición del control.
    expect(await liveStaff(BIZ_ARCHIVED_ROOM)).toBe(antesDelControl + 1);

    // El dueño del negocio que está en el tope. Bajarlo lo convertiría en el tercer
    // acceso que no es suyo, y el §4.5 cuenta a los owners por `role`, no por
    // exemptions: un dueño que deja de serlo consume la misma plaza que un empleado.
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(
        `update public.business_members set role = 'staff'
          where id = '${MEM_ARCH_OWNER}'`,
      ),
    );
    expect(err?.code).toBe('P0001');
    expect(err?.message).toBe('el plan free admite hasta 2 miembros, no más');

    // El conteo no se mueve y la fila sigue siendo de la dueña.
    expect(await liveStaff(BIZ_ARCHIVED)).toBe(2);
    const stillOwner = plainRows(
      await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ role: string }[]>(`
          select m.role::text as role
            from public.business_members m where m.id = '${MEM_ARCH_OWNER}'`),
      ),
    );
    expect(stillOwner[0]?.role).toBe('owner');
  });

  // ─── UNA SENTENCIA, VARIAS FILAS ───────────────────────────────────────────
  //
  // Esto mide una propiedad de Postgres que el trigger DEPENDE y que nadie
  // escribió en ningún sitio, así que va aquí con su propia explicación y no
  // escondido de paso en otro test.
  //
  // ─── QUÉ PROPIEDAD ES ──────────────────────────────────────────────────────
  //
  // `v_otros` excluye del conteo SÓLO la fila que esta escritura está tocando
  // (`l.id <> new.id`). En un statement de N filas eso deja una pregunta: ¿la
  // segunda fila ve a la primera, o las N se miden contra el estado de antes del
  // statement? Si fuera lo segundo, un `insert` de dos filas metería las dos con
  // el mismo número delante y el tope valdría la mitad de lo que dice.
  //
  // La respuesta es que SÍ se ven, y no por casualidad: el conteo es un `select`
  // VOLATILE dentro de un cuerpo plpgsql, así que se planifica y se ejecuta en
  // cada invocación del trigger, y cada ejecución toma un snapshot NUEVO bajo el
  // MISMO command id — el snapshot del comando ve lo que ese comando ya escribió.
  // El trigger es `for each row`, no de statement: corre una vez por fila, y para
  // la fila N ya hay N-1 filas escritas en la tabla.
  //
  // ─── POR QUÉ PODRÍA DEJAR DE SER CIERTO ───────────────────────────────────
  //
  // Porque es una propiedad del MOTOR y no del código, y se pierde sin que nada
  // avise: si alguien «optimiza» el conteo moviéndolo a una función SQL STABLE, o
  // lo sube a un `WHEN` del trigger, o a una constraint que se evalúa una vez por
  // statement, las N filas volverían a medirse contra el mismo estado y la segunda
  // fila pasaría sin error. No hay ningún `expect` en el mundo que se ponga rojo
  // solo por eso, y el síntoma sería un negocio con más sucursales de las que dice
  // su plan, sin un solo error en ningún log.
  //
  // ─── POR QUÉ ESTE TEST NO ES ACADÉMICO ─────────────────────────────────────
  //
  // Porque un `insert` de varias filas en un solo statement es la forma que
  // produce el cliente: `supabase-js` con `.insert([a, b])` envía exactamente eso,
  // así que el dispositivo no tiene que hacer nada raro para llegar a este camino.
  // Lo que no puede hacer —y por eso el raise es P0001 y no un 400 de PostgREST—
  // es saltarse el tope por el hecho de mandar dos filas juntas.

  test('un insert de dos sucursales en una sola sentencia no se cuela', async () => {
    // Control positivo primero: una fila sola entra, así que el trigger está vivo
    // y este negocio está realmente vacío y en `free`.
    const primera = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_BULK}', 'Primera', 'dir', 0, 0) returning id`,
      ),
    );
    expect(plainRows(primera)).toHaveLength(1);
    expect(await activeLocations(BIZ_BULK)).toBe(1);

    // Se apaga para volver a dejarlo vacío, que es el estado desde el que la
    // segunda fila tiene que chocar de frente contra la primera.
    const apagada = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ id: string }[]>(
        `update public.business_locations set is_active = false
          where business_id = '${BIZ_BULK}' and is_active returning id`,
      ),
    );
    expect(plainRows(apagada)).toHaveLength(1);
    expect(await activeLocations(BIZ_BULK)).toBe(0);

    // Y ahora las dos, en el MISMO statement. La primera entra; la segunda tiene
    // que ver a la primera para rebotar, y ese es todo el contenido del test.
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(`
        insert into public.business_locations
          (business_id, name, address, latitude, longitude)
        values ('${BIZ_BULK}', 'A', 'dir', 0, 0),
               ('${BIZ_BULK}', 'B', 'dir', 0, 0)`),
    );
    expect(err?.code).toBe('P0001');
    expect(err?.message).toBe('el plan free admite hasta 1 sucursal, no más');

    // Y cero, no una: el statement abortó entero. Una fila huérfaca de las dos
    // sería un estado que el §5.4 no describe y que el siguiente writer heredaría.
    expect(await activeLocations(BIZ_BULK)).toBe(0);
  });

  // ─── LA FORMA, QUE ES LO QUE HACE QUE NADA MÁS SE PUEDA ROMPER ────────────

  test('los dos triggers son BEFORE INSERT OR UPDATE, de fila, y con el search_path pineado', async () => {
    const shape = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<
        {
          tabla: string;
          trigger: string;
          por_fila: boolean;
          antes: boolean;
          al_insertar: boolean;
          al_actualizar: boolean;
          secdef: boolean;
          config: string[] | null;
        }[]
      >(`
        select c.relname as tabla,
               t.tgname as trigger,
               (t.tgtype & 1) = 1 as por_fila,
               (t.tgtype & 2) = 2 as antes,
               (t.tgtype & 4) = 4 as al_insertar,
               (t.tgtype & 16) = 16 as al_actualizar,
               p.prosecdef as secdef,
               p.proconfig as config
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc p on p.oid = t.tgfoid
        where n.nspname = 'public'
          and c.relname in ('business_locations', 'business_members')
          and p.proname in ('enforce_business_location_limit',
                            'enforce_business_member_limit')
          and not t.tgisinternal
        order by c.relname`),
    );

    // Los bits de `tgtype`, no el texto: `pg_get_triggerdef` cambia de forma
    // entre versiones y un reformateo que no cambia una sola cosa de lo que
    // pasa no puede romper esta prueba.
    //
    // Y el filtro es por FUNCIÓN, no por nombre de trigger: `business_locations`
    // ya traía su `set_business_locations_updated_at` desde el día que se creó la
    // tabla, y lo que este bloque mide son los dos triggers de límites, no el
    // inventario completo de la tabla.
    expect(plainRows(shape)).toEqual([
      {
        tabla: 'business_locations',
        trigger: 'trg_enforce_location_limit',
        por_fila: true,
        antes: true,
        al_insertar: true,
        al_actualizar: true,
        secdef: true,
        config: ['search_path=""'],
      },
      {
        tabla: 'business_members',
        trigger: 'trg_enforce_member_limit',
        por_fila: true,
        antes: true,
        al_insertar: true,
        al_actualizar: true,
        secdef: true,
        config: ['search_path=""'],
      },
    ]);
  });

  // ─── UNA PREGUNTA, UNA RESPUESTA ───────────────────────────────────────────
  //
  // «¿qué plan tiene este negocio?» tiene que tener UN sitio. Antes de la
  // cadena la contestaban dos —la subconsulta de `business_has_feature`, que
  // filtraba `deleted_at is null`, y el `left join` que los triggers traían
  // para poder nombrar el plan en el mensaje— y no podían coincidir: una fila
  // de plan borrada le contestaba `free` a la comprobación y `pro` al mensaje,
  // así que el mensaje le decía al dueño que estaba pagando un plan que ya no
  // tenía. `business_plan_of` es la única definición, y esto es lo que ata esa
  // unicidad.
  //
  // Y mira `prosrc`, no `pg_get_functiondef`: lo que se afirma es QUÉ llama cada
  // cuerpo y qué tabla lee cada cuerpo, no con qué saltos de línea. Un
  // reformateo que no cambia una sola cosa de lo que pasa no puede romper esta
  // prueba, porque lo que busca es el nombre de la función llamada, no una
  // cadena de bytes.

  test('el plan se resuelve por business_plan_of en los tres cuerpos, y sólo ahí', async () => {
    const resolved = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ fn: string; por_helper: boolean; lee_la_tabla: boolean }[]>(`
        select p.proname as fn,
               (p.prosrc ~ 'business_plan_of\\s*\\(') as por_helper,
               (p.prosrc ~ 'business_plans_state') as lee_la_tabla
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('business_plan_of', 'business_has_feature',
                            'enforce_business_location_limit',
                            'enforce_business_member_limit')
        order by p.proname`),
    );

    // `lee_la_tabla` es la mitad que no se ve: los tres cuerpos que la piden
    // tienen que LEERLA A TRAVÉS del helper, no trayendo su propio `select` de
    // vuelta. Una segunda copia de la consulta es una segunda respuesta
    // posible a la misma pregunta, y es exactamente el defecto que esta cadena
    // vino a cerrar.
    expect(plainRows(resolved)).toEqual([
      {
        fn: 'business_has_feature',
        por_helper: true,
        lee_la_tabla: false,
      },
      { fn: 'business_plan_of', por_helper: false, lee_la_tabla: true },
      {
        fn: 'enforce_business_location_limit',
        por_helper: true,
        lee_la_tabla: false,
      },
      {
        fn: 'enforce_business_member_limit',
        por_helper: true,
        lee_la_tabla: false,
      },
    ]);

    // Y que la fila borrada se cuente como ausencia —no como `pro`— es lo que
    // hace que `business_plan_of` sea el sitio correcto y no sólo el primero.
    // El test de comportamiento de más arriba lo midió con un negocio de
    // verdad; esto afirma la regla en el cuerpo que la va a aplicar a todos.
    const softDeleted = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ filtra_borrados: boolean }[]>(`
        select (p.prosrc ~ 'deleted_at\\s+is\\s+null') as filtra_borrados
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'business_plan_of'`),
    );
    expect(
      plainRows(softDeleted)[0]?.filtra_borrados,
      'business_plan_of no filtra deleted_at, así que un plan retirado sigue ' +
        'contando topes desde la fila que lo dejó atrás — y el `coalesce` de ' +
        'ausencia y de borrado son la misma cosa sólo porque el filtro está.',
    ).toBe(true);
  });

  test('el plan se resuelve ANTES de que el mensaje lo necesite', async () => {
    // Hoy los tres planes dan `staff_access`, así que el `raise` de «no incluye
    // accesos de personal» no lo alcanza nadie y su texto no se puede medir por
    // comportamiento. Lo que SÍ importa es que la resolución del plan vaya antes
    // de ese `raise`: si fuera después, el mensaje saldría con el plan en
    // blanco —«el plan  no incluye…»—, que es un mensaje roto justo cuando el
    // dueño necesita entender por qué se le frenó el crecimiento.
    //
    // Es una guarda de catálogo y no una de comportamiento, y por eso vive acá:
    // es lo que ata el orden de dos líneas que ningún `select` puede ver.
    const order = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<{ fn: string; plan_at: number; feature_at: number }[]>(`
        select p.proname as fn,
               strpos(p.prosrc, 'business_plan_of(') as plan_at,
               strpos(p.prosrc, 'business_has_feature(') as feature_at
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('enforce_business_location_limit',
                            'enforce_business_member_limit')
        order by p.proname`),
    );
    expect(plainRows(order)).toHaveLength(2);
    for (const row of plainRows(order)) {
      expect(
        row.plan_at,
        `${row.fn} no llama a business_plan_of, así que el plan del mensaje ` +
          'sale de otro sitio que el de la comprobación de feature, y son dos ' +
          'respuestas a la misma pregunta.',
      ).toBeGreaterThan(0);
      expect(
        row.feature_at,
        `${row.fn} no consulta business_has_feature. El §5.3 lo pide antes de ` +
          'insertar, y es lo que hace que un plan sin accesos de personal no ' +
          'crezca ni por un loophole del `case` de límites.',
      ).toBeGreaterThan(0);
      expect(
        row.plan_at < row.feature_at,
        `${row.fn} mira la feature antes de resolver el plan, así que el ` +
          'mensaje del raise sale con el plan en blanco.',
      ).toBe(true);
    }
  });

  // ─── EL CATÁLOGO DE TOPES, NOMBRADO PLAN POR PLAN ──────────────────────────
  //
  // `business_has_feature` tiene su `else false` para que un plan nuevo no
  // conceda features antes de que nadie decidiera cuánto cuesta cada una. Los
  // dos `case` de topes necesitan la misma red, y la necesitan con más razón:
  // aquí el `else` no sería «sin features» sino SIN TOPE, o sea que agregar un
  // tier al enum le regalaría un negocio ilimitado a quien lo escribiera.
  //
  // Por eso los tres planes se nombran uno por uno y el resto se raisea en
  // voz alta. Y esto mira el cuerpo, no su respuesta: los números que importan
  // —que `free` admita uno y `pro` cinco, que `pro_plus` no tenga tope— ya los
  // miden los tests de comportamiento de arriba, con veinte filas de verdad.

  test('los dos triggers nombran los tres planes, y un cuarto no se cuela sin tope', async () => {
    const catalog = await as(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe<
        {
          fn: string;
          free: boolean;
          pro: boolean;
          pro_plus: boolean;
          el_resto_ruidoso: boolean;
        }[]
      >(`
        select p.proname as fn,
               (p.prosrc ~ 'when\\s+''free''')     as free,
               (p.prosrc ~ 'when\\s+''pro''')      as pro,
               (p.prosrc ~ 'when\\s+''pro_plus''') as pro_plus,
               (p.prosrc ~ 'else\\s+raise\\s+exception') as el_resto_ruidoso
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('enforce_business_location_limit',
                            'enforce_business_member_limit')
        order by p.proname`),
    );

    // `toEqual` sobre el conjunto entero y no tres `toBe` sueltos: así el
    // fallo dice QUÉ función dejó de nombrar QUÉ plan, que es la mitad de lo
    // que hay que arreglar cuando esto se pone rojo.
    expect(plainRows(catalog)).toEqual([
      {
        fn: 'enforce_business_location_limit',
        free: true,
        pro: true,
        pro_plus: true,
        el_resto_ruidoso: true,
      },
      {
        fn: 'enforce_business_member_limit',
        free: true,
        pro: true,
        pro_plus: true,
        el_resto_ruidoso: true,
      },
    ]);
  });
});
