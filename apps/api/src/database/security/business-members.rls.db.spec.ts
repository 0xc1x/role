import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
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
): Promise<string | null> {
  let refusal: string | null = null;
  try {
    await sql.begin(async (tx) => {
      try {
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

    const policies = await as(ctx.sql, 'service_role', null, (tx) =>
      tx
        .unsafe<{ tablename: string; cmd: string }[]>(
          `
          select tablename, cmd
          from pg_policies
          where schemaname = 'public'
            and tablename in ('business_members','business_member_locations')
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
  const LOC_A = 'bbbbbbbb-0000-4000-8000-000000000001';
  const LOC_B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const LOC_BZ = 'cccccccc-0000-4000-8000-000000000001';

  const M_OWNER = 'd0000000-0000-4000-8000-000000000001';
  const M_STAFF = 'd0000000-0000-4000-8000-000000000002';
  const M_MANAGER = 'd0000000-0000-4000-8000-000000000003';
  const M_DISABLED = 'd0000000-0000-4000-8000-000000000004';
  const M_DELETED = 'd0000000-0000-4000-8000-000000000005';
  const M_STALE = 'd0000000-0000-4000-8000-000000000006';

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
                ('${BIZ_B}', 'Helper Biz B', 'restaurant', 'helper-biz-b')`,
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
           (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, deleted_at)
         values
           ('${M_OWNER}', '${BIZ_A}', '${OWNER_A}', 'owner', 'Owner', 'helper-owner@test', 'active', 24, now(), null),
           ('${M_STAFF}', '${BIZ_A}', '${MEMBER_STAFF_A}', 'staff', 'Staff', 'helper-staff@test', 'active', 24, now(), null),
           ('${M_MANAGER}', '${BIZ_A}', '${MEMBER_MANAGER}', 'manager', 'Manager', 'helper-manager@test', 'active', 24, now(), null),
           ('${M_DISABLED}', '${BIZ_A}', '${MEMBER_DISABLED}', 'staff', 'Disabled', 'helper-disabled@test', 'disabled', 24, now(), null),
           ('${M_DELETED}', '${BIZ_A}', '${MEMBER_DELETED}', 'staff', 'Deleted', 'helper-deleted@test', 'active', 24, now(), now()),
           ('${M_STALE}', '${BIZ_A}', '${MEMBER_STALE}', 'staff', 'Stale', 'helper-stale@test', 'active', 24, now() - interval '26 hours', null)`,
      );

      await tx.unsafe(
        `insert into public.business_member_locations (member_id, location_id, deleted_at)
         values
           ('${M_STAFF}', '${LOC_A}', null),
           ('${M_MANAGER}', '${LOC_A}', null),
           ('${M_MANAGER}', '${LOC_B}', null),
           ('${M_DISABLED}', '${LOC_A}', null),
           ('${M_DELETED}', '${LOC_A}', null),
           ('${M_STALE}', '${LOC_A}', null)`,
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
    const state = await as(ctx.sql, 'authenticated', MEMBER_STALE, (tx) =>
      tx.unsafe<{ reason: string; role: string }[]>(`
        select public.business_member_session_state() ->> 'reason' as reason,
               public.business_member_session_state() ->> 'role'  as role`),
    );
    expect(state[0].reason).toBe('session_expired');
    expect(state[0].role).toBe('staff');
  });
});
