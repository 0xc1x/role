import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
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
 * ─── EL ÍNDICE ÚNICO DEL ALIAS, Y POR QUÉ NO FILTRA `deleted_at` ─────────────
 *
 * `business_members_alias_key` es UNIQUE sobre `lower(alias)` y NO lleva
 * `where deleted_at is null`. Un índice parcial aquí sería un alias reciclable: la
 * fila dada de baja dejaría de bloquear el alias, y su `auth.users` podría seguir
 * vivo, así que el mismo identificador volvería a pertenecer a dos personas. El
 * índice se aserta por su FORMA y no por su nombre en el conjunto de los tres,
 * porque lo que hay que proteger es la unicidad global, y un índice no único con
 * el nombre correcto pasa todo lo que no mira el `CREATE INDEX`.
 *
 * ─── LO QUE ESTE ARCHIVO NO PUEDE MEDIR, Y POR QUÉ ─────────────────────────
 *
 * Que la baja de una fila no conceda acceso por ningún camino —que un
 * `deleted_at` no abra la puerta ni aunque su `auth.users` siguiera vivo— no se
 * mide acá, porque todavía no hay helper ni policy que lo conceda: es lo que
 * escribe el paso 4 del §6.2 del spec, y es el paso que depende de esta
 * migración. Lo que sí se mide es la forma en que la tabla nace, que es la única
 * mitad de esa garantía que depende de este DDL y no de la siguiente.
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

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
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

  test('el índice único de alias no recicla filas borradas', async () => {
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
    expect(idx[0].indexdef).toContain('lower(alias)');

    // Y lo que la hace única de verdad: no filtra por `deleted_at`. Un `where
    // deleted_at is null` acá devolvería el alias a la bolsa en cuanto la fila se
    // da de baja, y el `auth.users` de esa fila puede seguir vivo: el mismo
    // identificador volvería a pertenecer a dos personas a la vez.
    expect(
      idx[0].indexdef,
      'el índice de alias lleva un predicado. Un índice único sobre ' +
        '`lower(alias) where deleted_at is null` deja reciclar el alias de una ' +
        'fila dada de baja, que es justo lo que §4.1 dice que no puede pasar.',
    ).not.toContain('WHERE');
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
