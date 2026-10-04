import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * La elegibilidad de un anuncio, entera, en la política de SELECT.
 *
 * ─── POR QUÉ ESTE ARCHIVO Y NO EL ESPEJO DE DRIZZLE ─────────────────────────
 *
 * Misma razón que `bug-reports.rls.db.spec.ts`: `apps/api/test/db.ts` construye
 * la base desde `apps/api/drizzle/`, y ese espejo filtra `CREATE POLICY`, los
 * `GRANT`/`REVOKE` y todo lo que toque `auth.uid()`. Es la base correcta para
 * probar las consultas del API y la base INCORRECTA para probar esto. Este
 * archivo replayea `supabase/migrations/` de verdad, con los roles `anon` /
 * `authenticated` / `service_role` y `auth.uid()` leyendo
 * `request.jwt.claim.sub`.
 *
 * ─── QUÉ SE ESTÁ PROBANDO ───────────────────────────────────────────────────
 *
 * `YYYYMMDDHHMMSS_announcements.sql` deja la elegibilidad entera en el `USING`
 * de la única policy de SELECT de `public.announcements`. No hay fallback de
 * cliente: el cliente no puede hacer lo que la policy no le deja, porque no
 * llega a ver la fila. Los cinco términos son cinco gates distintos, y cada uno
 * tapa un agujero distinto:
 *
 *   active                                sin él, desactivar un anuncio en el
 *                                         panel no lo saca de la app.
 *   start_at / end_at                     sin ellos, un aviso de mantenimiento
 *                                         ya vencido y uno que empieza dentro
 *                                         de un mes se ven igual desde hoy.
 *   severity = 'info' or auth.uid() is    sin este fragmento, un `required`
 *   not null                              LLEGA a un anónimo — y no hay
 *                                         `user_id` sin sesión, así que no se
 *                                         puede acknowledge y vuelve en cada
 *                                         apertura, para siempre. (Review
 *                                         Focus #2.)
 *   audience_kind = 'all'                 sin él, nadie lee nada.
 *   …consumers / …businesses / `user_ids` sin ellos, un aviso dirigido llega a
 *                                         todo el mundo, que es el costo de
 *                                         mandar una circular.
 *
 * Y lo que NO hay importa tanto como lo que hay: no hay policy de INSERT, ni de
 * UPDATE, ni de DELETE sobre `announcements`. El operador publica por la API y
 * el cliente no escribe.
 *
 * ─── UN ANÓNIMO VE `consumers`, Y NO ES UNA FRONTERA DE PRIVACIDAD ───────────
 *
 * El predicado de la rama `consumers` es `auth_helpers.my_role() = 'user'`, y
 * `my_role()` devuelve `'user'` por el `UNION ALL` de su fallback cuando no hay
 * fila de perfil. Un visitante del landing no tiene fila de perfil —no tiene
 * sesión— así que su `my_role()` es `'user'` y **`anon` entra por la rama de
 * consumidora**. Medido, no inferido: `anon` ve `all` y `consumers`, la
 * consumidora ve `all`, `consumers`, su `required` y su `specific`, y la dueña
 * ve `all`, `businesses` y los `required`.
 *
 * Es aceptable y es una decisión, no un descuido: el banner de consumidora del
 * landing tiene que existir FUERA de la app y no hay sesión que lo habilite, así
 * que un `consumers` que no llegara al anónimo sería un banner que solo existe
 * para quien ya se registró — que es la audience que no necesita persuasive.
 * Decirlo acá evita las dos lecturas equivocadas: `consumers` NO es "usuarios con
 * sesión", y tampoco es una fuga, porque el contenido del aviso no cambia por
 * quién lo lee.
 *
 * Lo que el anónimo NO alcanza queda igual de cerrado: `businesses` exige
 * `my_role() = 'business'` y `specific` exige `user_ids @> array[auth.uid()]`,
 * que con `auth.uid()` nulo es falso. Y ninguna policy de escritura existe, así
 * que leer `consumers` no compra nada: el mismo `anon` no puede publicar.
 * `un info sí se entrega a un anónimo` fija las cuatro cosas de una vez.
 *
 * ─── POR QUÉ `auth_helpers.my_role()` Y NO UN SUBQUERY A `profiles` ──────────
 *
 * `my_role()` es `SECURITY DEFINER` y estable: saltea el RLS de `profiles` a
 * propósito, para que la política no dependa de que el lector tenga permiso
 * sobre `profiles`. Ya lo usan las políticas de `profiles` y de `orders`, y
 * reimplementarlo sería copiar una función que existe.
 *
 * Sobre el USAGE del schema, que NO existe y NO rompe nada: el ACL de USAGE se
 * verifica cuando se RESUELVE el nombre de la función, y una policy se resuelve
 * una sola vez, cuando la crea el rol que corre la migración. En tiempo de
 * consulta lo único que se re-verifica es `EXECUTE` sobre la función, contra el
 * rol que pregunta. `categories.rls.db.spec.ts` es la evidencia y su medición,
 * y `un admin solo lee los all` de este archivo la repite por el otro lado:
 * si el helper fuera inalcanzable, ese SELECT daría `42501 permission denied
 * for schema auth_helpers` en vez de cero filas.
 *
 * ─── EL POSTURING MEDIDO ────────────────────────────────────────────────────
 *
 *   announcements               anon:          SELECT por policy, escritura
 *                                         ninguna — INSERT/UPDATE/DELETE se
 *                                         niegan por AUSENCIA de policy
 *               authenticated: SELECT por policy, escritura ninguna
 *               service_role:  todo (BYPASSRLS)
 *               policies:      1, y es de SELECT
 *
 *   announcement_acknowledgements
 *               anon:          SELECT denegado — la policy es TO authenticated
 *               authenticated: SELECT y INSERT propios, `user_id = auth.uid()`.
 *                               SIN policy de UPDATE ni de DELETE: no hay
 *                               forma de des-acknowledgear.
 *               policies:      2, y ninguna es de UPDATE ni de DELETE
 *
 * ─── CÓMO SE NIEGA LA ESCRITURA, QUE NO ES LO MISMO EN LOS TRES COMANDOS ────
 *
 * INSERT revienta con `42501`. UPDATE y DELETE NO: con cero policies de esos dos
 * comandos el `USING` vacío saca todas las filas, la sentencia casa cero y
 * termina sin quejarse. La propiedad de seguridad es la misma en los tres —el
 * cliente no modifica ninguna fila— pero la EVIDENCIA no: para UPDATE y DELETE
 * el error no la da, y el `rowcount`affected sí. Por eso el test de escritura de
 * `authenticated` mide el efecto y no la excepción; el detalle está en su
 * comentario.
 *
 * ─── RLS HABILITADO Y NO FORZADO ────────────────────────────────────────────
 *
 * `force row level security` no se usa en ninguna migración de este ledger, y
 * forzarlo acá sería medir una base que producción no tiene: el rol dueño es
 * con el que el harness siembra y relee, y es el que escribe por la API.
 * `relforcerowsecurity = false` está aserido abajo por eso, junto con los
 * índices y las columnas.
 *
 * ─── LO QUE ESTE ARCHIVO NO PUEDE MEDIR, Y POR QUÉ ──────────────────────────
 *
 * La FORMA del índice parcial `(active, priority desc, created_at desc) where
 * active` está aserida arriba: el nombre, en el conjunto completo de los cinco
 * que hay en las dos tablas. La ELECCIÓN del planner no está medida, y este
 * archivo no la afirma en ninguna parte: no corrió ningún `EXPLAIN`, ni contra
 * producción ni contra el replay de este harness, y su resultado no está en
 * ningún commit ni en el `README`. Es la misma decisión que escribe la cabecera
 * de la migración —la forma se aserde, el plan no— y por el mismo motivo: el
 * plan depende del volumen, así que un `EXPLAIN` sobre una tabla de once filas
 * no dice nada sobre una de cien mil. Peor: dice algo con más seguridad de la
 * que tiene, y eso se lee como una garantía que nadie midió.
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAS PERSONAS
// ─────────────────────────────────────────────────────────────────────────────

/** La consumidora. `my_role()` resuelve `'user'` porque su perfil lo dice. */
const CONSUMER = 'c0000000-0000-4000-8000-000000000001';
/** Otra consumidora. Es la contrafiguración de `user_ids`. */
const OTHER_USER = 'c0000000-0000-4000-8000-000000000002';
/** La dueña de un negocio. `my_role()` resuelve `'business'`. */
const OWNER = 'c0000000-0000-4000-8000-000000000003';
/** La administradora. `my_role()` resuelve `'admin'`. */
const ADMIN = 'c0000000-0000-4000-8000-000000000004';

// ─────────────────────────────────────────────────────────────────────────────
// LOS ANUNCIOS
// ─────────────────────────────────────────────────────────────────────────────

/** `info`, para todos, sin ventana. La fila legible más simple que hay. */
const ACTIVE = 'a1000000-0000-4000-8000-000000000001';
/** `start_at` en el futuro. Todavía no es de nadie. */
const FUTURE = 'a1000000-0000-4000-8000-000000000002';
/** `end_at` en el pasado. Ya se pasó. */
const EXPIRED = 'a1000000-0000-4000-8000-000000000003';
/** La ventana abierta: empezó ayer y termina mañana. */
const WINDOW = 'a1000000-0000-4000-8000-000000000004';
/** `specific` dirigido a `OTHER_USER`. La consumidora no está en la lista. */
const SPECIFIC_OTHER = 'a1000000-0000-4000-8000-000000000005';
/** `specific` dirigido a `CONSUMER`. */
const SPECIFIC_MINE = 'a1000000-0000-4000-8000-000000000006';
/** `required` para todos. Es el que un anónimo NO puede recibir. */
const REQUIRED_ALL = 'a1000000-0000-4000-8000-000000000007';
/** `info` solo para consumidora. La admin no entra. */
const CONSUMERS_ONLY = 'a1000000-0000-4000-8000-000000000008';
/** `info` solo para negocios. La admin tampoco entra. */
const BUSINESSES_ONLY = 'a1000000-0000-4000-8000-000000000009';
/** `required` para todos, ya entendido por `CONSUMER`. El caso de RF #3. */
const REQUIRED_ACKED = 'a1000000-0000-4000-8000-00000000000a';
/** `required` para todos, sin acknowledgement. Lo usa la idempotencia. */
const REQUIRED_FRESH = 'a1000000-0000-4000-8000-00000000000b';

/**
 * Las trece columnas de `announcements`, en orden.
 *
 * Va con el aserto de columnas de abajo porque el perímetro de la policy son
 * SIETE de las TRECE: `active`, `start_at`, `end_at`, `severity`,
 * `audience_kind` y `user_ids`. Las otras seis las elige el operador y ningún
 * rol cliente las puede cambiar, porque no hay policy de UPDATE.
 */
const ANNOUNCEMENT_COLUMNS: readonly string[] = [
  'id',
  'title',
  'body',
  'severity',
  'audience_kind',
  'user_ids',
  'business_ids',
  'priority',
  'active',
  'start_at',
  'end_at',
  'created_at',
  'updated_at',
];

/**
 * Los cinco índices de las dos tablas, más el nombre de la PK.
 *
 * En el ORDEN QUE LOS DEVUELVE LA CONSULTA, que es `order by indexname` en
 * ASCII. No es un detalle: `_` es 0x5F y `s` es 0x73, así que el
 * `announcement_acknowledgements_pkey` ordena PRIMERO y no al final donde lo
 * dejaría un orden de autor —los `announcements_*` juntos y el del
 * acknowledgement aparte—. La lista de abajo está en el orden de la base, que
 * es el que el `toEqual` compara; la constante no se "arregla" cambiando el
 * `order by` de la consulta, porque ese `order by` es el que hace la
 * comparación determinista.
 */
const ANNOUNCEMENT_INDEXES: readonly string[] = [
  'announcement_acknowledgements_pkey',
  'announcements_active_priority_created_at_idx',
  'announcements_business_ids_idx',
  'announcements_pkey',
  'announcements_user_ids_idx',
];

let ctx: SupabaseTestDb;

/**
 * postgres.js contesta con un `RowList`, que es un array que además carga
 * metadatos de la consulta, y `toEqual` compara los metadatos también. Misma
 * normalización que los otros specs del directorio: spread.
 */
function plainRows<T>(result: readonly T[]): T[] {
  return [...result];
}

/**
 * Los ids de los anuncios que una persona ve, en el orden de la app.
 *
 * `order by priority desc, created_at desc` es la consulta del diseño §6, y el
 * `where` va en blanco a propósito: la ventana y la audiencia las pone la policy,
 * y repetir el filtro acá sería medir el filtro del test en vez del de la base.
 */
async function visibleTo(
  role: 'anon' | 'authenticated',
  userId: string | null,
): Promise<string[]> {
  const rows = await as(ctx.sql, role, userId, (tx) =>
    tx.unsafe<{ id: string }[]>(
      `select id::text
         from public.announcements
        order by priority desc, created_at desc`,
    ),
  );
  return plainRows(rows).map((r) => r.id);
}

/**
 * Los ids que la app muestra: lo que RLS deja ver, menos lo ya entendido.
 *
 * Es la consulta completa que el móvil va a hacer, y es la que define qué es
 * "reaparecer". La policy NO sabe de acknowledgements —no podría, el
 * `USING` corre por fila y el acknowledgement es de otra tabla—, así que el
 * descarte es del cliente. Por eso el "no aparece" de RF #3 se mide acá y no
 * sobre `announcements` sola: `not in` es donde vive la promesa.
 */
async function pendingFor(userId: string): Promise<string[]> {
  const rows = await as(ctx.sql, 'authenticated', userId, (tx) =>
    tx.unsafe<{ id: string }[]>(
      `select a.id::text
         from public.announcements a
        where a.id not in (
                select announcement_id
                  from public.announcement_acknowledgements
                 where user_id = auth.uid()
              )
        order by a.priority desc, a.created_at desc`,
    ),
  );
  return plainRows(rows).map((r) => r.id);
}

/**
 * Corre una sentencia como un rol cliente y devuelve el error, o `null` si entró.
 *
 * El camino de denegación se mide con esto. El de permiso se mide con `as()`,
 * porque acá un `null` significa "entró" y esa confusión —leer un `null` como
 * "no pasó nada"— es el error clásico de este harness.
 */
async function denied(
  sql: string,
  role: 'anon' | 'authenticated' = 'authenticated',
  userId: string | null = CONSUMER,
): Promise<{ code: string; message: string } | null> {
  return deniedAs(ctx.sql, role, userId, (tx) => tx.unsafe(sql));
}

/**
 * Un `INSERT` de anuncio en su forma buena, con lo que se quiera cambiar.
 *
 * Los `INSERT` de esta sonda se rechazan todos, y por qué importa: el
 * privilegio INSERT EXISTE (viene del ACL por defecto de Supabase) y lo que no
 * se satisface es la AUSENCIA de policy. Un `INSERT` mal formado daría el mismo
 * `42501` por otro motivo, así que la sonda manda una fila que SIN la policy
 * entraría.
 */
function insertAnnouncement(
  overrides: Partial<{
    title: string;
    severity: string;
    audienceKind: string;
  }> = {},
): string {
  const {
    title = 'Mantenimiento programado',
    severity = 'info',
    audienceKind = 'all',
  } = overrides;

  return `insert into public.announcements (title, body, severity, audience_kind)
       values ('${title}', 'El servicio vuelve el domingo.', '${severity}', '${audienceKind}')`;
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // ── Las personas, por `auth.users` y no por `profiles` ──────────────────
    //
    // El ÚNICO productor de un perfil es el trigger `on_auth_user_created`, así
    // que escribir la fila a mano construiría una persona que en producción no
    // puede existir, y lo primero que se rompería es `auth_helpers.my_role()`:
    // el helper lee `public.profiles`, y sin fila devuelve `'user'` por el
    // `UNION ALL` de su fallback. Los cuatro perfiles se cairían en `'user'` y
    // tres de los catorce tests de este archivo estarían midiendo lo contrario
    // de lo que dicen.
    for (const [id, email] of [
      [CONSUMER, 'consumer@rls-announcements.test'],
      [OTHER_USER, 'otra@rls-announcements.test'],
      [OWNER, 'duena@rls-announcements.test'],
      [ADMIN, 'admin@rls-announcements.test'],
    ] as const) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${email}')
         on conflict (id) do nothing`,
      );
    }
    await tx.unsafe(
      `update public.profiles set role = 'business' where id = '${OWNER}'`,
    );
    await tx.unsafe(
      `update public.profiles set role = 'admin' where id = '${ADMIN}'`,
    );

    // ── Los anuncios, sembrados como el dueño ──────────────────────────────
    //
    // El dueño es el único rol que puede escribirlos, porque no hay policy de
    // INSERT y el rol dueño esquiva el RLS al no estar forzado. Es la misma
    // relación que tiene la API, que conecta como `postgres`.
    //
    // `title` y `body` tienen CHECK de longitud: los dos arrancan en 3
    // caracteres, así que un texto de una letra no entra ni por error.
    await tx.unsafe(`
      insert into public.announcements
        (id, title, body, severity, audience_kind, priority, active, start_at, end_at)
      values
        ('${ACTIVE}',           'Novedades de la semana',
         'Tres ofertas nuevas cerca de ti.', 'info', 'all',        10, true, null, null),
        ('${FUTURE}',           'Mantenimiento el domingo',
         'El servicio no estará disponible.', 'info', 'all',        50, true,
         now() + interval '1 day', now() + interval '2 days'),
        ('${EXPIRED}',          'Mantenimiento de julio',
         'Ya terminó, queda acá de registro.', 'info', 'all',    40, true,
         now() - interval '2 days', now() - interval '1 day'),
        ('${WINDOW}',           'Cambios en el panel',
         'La semana que viene cambia el panel.', 'info', 'all',    30, true,
         now() - interval '1 day', now() + interval '1 day'),
        ('${SPECIFIC_OTHER}',   'Te guardamos unaoferta',
         'Solo para vos.', 'info', 'specific', 20, true, null, null),
        ('${SPECIFIC_MINE}',    'Tu oferta está lista',
         'Pasá a buscarla.', 'info', 'specific', 20, true, null, null),
        ('${REQUIRED_ALL}',     'Actualizá tus datos',
         'Necesitamos tu teléfono para entregar.', 'required', 'all', 90, true, null, null),
        ('${CONSUMERS_ONLY}',   'Ofertas solo para vos',
         'Los negocios ya pueden publicar.', 'info', 'consumers', 60, true, null, null),
        ('${BUSINESSES_ONLY}',  'Nueva comisión',
         'Bajamos el porcentaje este mes.', 'info', 'businesses', 60, true, null, null),
        ('${REQUIRED_ACKED}',   'Lee los términos nuevos',
         'Al aceptar la compra, aceptás los términos.', 'required', 'all', 70, true, null, null),
        ('${REQUIRED_FRESH}',   'Confirmá tu cuenta',
         'Verificá el correo para comprar.', 'required', 'all', 80, true, null, null);

      update public.announcements set user_ids = array['${OTHER_USER}'::uuid]
       where id = '${SPECIFIC_OTHER}';
      update public.announcements set user_ids = array['${CONSUMER}'::uuid]
       where id = '${SPECIFIC_MINE}';
    `);

    // ── Los acknowledgements, también del dueño ────────────────────────────
    //
    // Dos para `CONSUMER` y uno para `OTHER_USER`. El de la otra es lo que
    // hace que "un usuario solo ve sus propios" tenga un negativo real: un
    // resultado vacío no distingue "la policy filtró" de "no había nada".
    await tx.unsafe(`
      insert into public.announcement_acknowledgements (announcement_id, user_id)
      values ('${REQUIRED_ALL}',   '${CONSUMER}'),
             ('${REQUIRED_ACKED}', '${CONSUMER}'),
             ('${ACTIVE}',         '${OTHER_USER}');
    `);
  });
});

afterAll(async () => {
  await ctx.sql
    .unsafe(
      `delete from public.announcement_acknowledgements
        where announcement_id::text like 'a1000000-%'`,
    )
    .catch(() => {});
  await ctx.sql
    .unsafe(`delete from public.announcements where id::text like 'a1000000-%'`)
    .catch(() => {});
  await ctx.stop();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('la ventana y la audiencia, con la elegibilidad entera en la policy', () => {
  /**
   * El caso legible más simple, y el que hace de anti-vacuity del archivo.
   *
   * La fila está sembrada y es `active`, `info`, `all`, sin `start_at` ni
   * `end_at`. Los cinco términos del `USING` se satisfacen sin ambigüedad, así
   * que un `expect(ids).toContain(ACTIVE)` acá es la afirmación de que la
   * impersonación funciona y de que la tabla tiene la fila que dice tener. Sin
   * esto, los trece negativos siguientes se leen igual sobre una base donde el
   * `SELECT` del cliente no vio nunca nada.
   *
   * Y de paso, la forma: RLS habilitado y NO forzado, cinco índices y trece
   * columnas. El `relforcerowsecurity = false` es el de producción y es lo que
   * hace que la impersonación de `as()` sea la que decide.
   */
  test('un anuncio activo sin ventana es legible', async () => {
    // El dueño ve la fila, así que la lectura de abajo mide la POLICY y no una
    // tabla que casualmente está vacía.
    const asOwner = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from public.announcements
        where id::text like 'a1000000-%'`,
    );
    expect(
      plainRows(asOwner)[0]?.n,
      'el dueño no ve las once filas sembradas. Cada aserción de este archivo ' +
        'que mide una negación estaría midiendo una tabla vacía.',
    ).toBe(11);

    expect(await visibleTo('authenticated', CONSUMER)).toContain(ACTIVE);

    const flags = await ctx.sql.unsafe<
      {
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('announcements', 'announcement_acknowledgements')
        order by c.relname`,
    );
    expect(plainRows(flags)).toEqual([
      {
        relname: 'announcement_acknowledgements',
        relrowsecurity: true,
        relforcerowsecurity: false,
      },
      {
        relname: 'announcements',
        relrowsecurity: true,
        relforcerowsecurity: false,
      },
    ]);

    const indexes = await ctx.sql.unsafe<{ indexname: string }[]>(
      `select indexname from pg_indexes
        where schemaname = 'public'
          and tablename in ('announcements', 'announcement_acknowledgements')
        order by indexname`,
    );
    expect(plainRows(indexes).map((i) => i.indexname)).toEqual([
      ...ANNOUNCEMENT_INDEXES,
    ]);

    const columns = await ctx.sql.unsafe<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'announcements'
        order by ordinal_position`,
    );
    expect(plainRows(columns).map((c) => c.column_name)).toEqual([
      ...ANNOUNCEMENT_COLUMNS,
    ]);
    expect(ANNOUNCEMENT_COLUMNS).toHaveLength(13);
  });

  /**
   * RF #5: un aviso de mantenimiento empieza la semana que viene.
   *
   * El caso que importa para el que Opera realmente manda: el aviso de corte
   * se publica con `start_at` en el futuro y `end_at` en el futuro también. Sin
   * el término de `start_at`, el banner le aparece a todo el mundo desde el
   * momento de publicarlo — que es exactamente el día que no debería.
   *
   * El control de la ventana abierta está en el test siguiente: sin él, "no la
   * devuelve" probaría que la fila no existe y no que la ventana la filtró.
   */
  test('un anuncio fuera de la ventana no es legible', async () => {
    expect(await visibleTo('authenticated', CONSUMER)).not.toContain(FUTURE);

    // El control: la fila existe, está activa, y su `start_at` es lo que la
    // esconde. Sin esto el `not.toContain` de arriba pasa igual en una base sin
    // la fila.
    const seeded = await ctx.sql.unsafe<
      { active: boolean; start_at: Date | null }[]
    >(
      `select active, start_at from public.announcements where id = '${FUTURE}'`,
    );
    expect(plainRows(seeded)[0]?.active).toBe(true);
    expect(plainRows(seeded)[0]?.start_at).toBeInstanceOf(Date);
  });

  /**
   * `end_at` en el pasado.
   *
   * La contrafiguración del anterior, y el que se olvida: sin este término un
   * aviso viejo —los que el operador nunca desactiva porque "no molesta"— se
   * sigue entregando a cada arranque, para siempre, y el modal se vuelve ruido.
   */
  test('un anuncio vencido no es legible', async () => {
    expect(await visibleTo('authenticated', CONSUMER)).not.toContain(EXPIRED);

    const seeded = await ctx.sql.unsafe<
      { active: boolean; end_at: Date | null }[]
    >(
      `select active, end_at from public.announcements where id = '${EXPIRED}'`,
    );
    expect(plainRows(seeded)[0]?.active).toBe(true);
    expect(plainRows(seeded)[0]?.end_at).toBeInstanceOf(Date);
  });

  /**
   * Los dos términos juntos, con la ventana abierta.
   *
   * `start_at` en el pasado Y `end_at` en el futuro. Es el caso que el
   * announcement de mantenimiento va a usar casi siempre, y el que separa
   * "hay ventana" de "todo el tiempo": sin él, un `select` que solo mirara
   * `start_at` no distinguiría una fila sin `start_at` de una ventana empezada.
   */
  test('la ventana con start_at pasado y end_at futuro sí es legible', async () => {
    expect(await visibleTo('authenticated', CONSUMER)).toContain(WINDOW);

    const seeded = await ctx.sql.unsafe<
      { start_at: Date | null; end_at: Date | null }[]
    >(
      `select start_at, end_at from public.announcements where id = '${WINDOW}'`,
    );
    expect(plainRows(seeded)[0]?.start_at).toBeInstanceOf(Date);
    expect(plainRows(seeded)[0]?.end_at).toBeInstanceOf(Date);
  });

  /**
   * `specific` dirigido a otra persona.
   *
   * El agujero que la audiencia cerrada tapa: un aviso de "te guardamos una
   * oferta" que le aparece a todo el mundo es un aviso Directed A Stranger, y en
   * el caso de negocio es el que dice "vos reservaste esto" sobre algo que
   * nadie reservó.
   */
  test('un specific no lo lee un usuario que no está en la lista', async () => {
    expect(await visibleTo('authenticated', CONSUMER)).not.toContain(
      SPECIFIC_OTHER,
    );

    // Y el control: la misma sesión sí lee el `specific` que la nombra a ella,
    // así que el `not.toContain` de arriba es el targeting y no una política
    // que no devuelve nada.
    expect(await visibleTo('authenticated', CONSUMER)).toContain(SPECIFIC_MINE);
  });

  /**
   * `specific` dirigido a ella.
   *
   * El camino de allow de la misma rama. Y acá está el detalle que hace que la
   * fila sea `specific` y no `all`: si el término `user_ids @> array[auth.uid()]`
   * estuviera mal, esta fila volvería ilegible para todos y el caso anterior
   * pasaría por la razón equivocada.
   */
  test('un specific sí lo lee un usuario de la lista', async () => {
    expect(await visibleTo('authenticated', CONSUMER)).toContain(SPECIFIC_MINE);
    // Y la contrafiguración: la otra persona no la ve.
    expect(await visibleTo('authenticated', OTHER_USER)).not.toContain(
      SPECIFIC_MINE,
    );
  });

  /**
   * RF #2: un `required` nunca se entrega a un anónimo.
   *
   * Sin el fragmento `severity = 'info' or auth.uid() is not null`, esta fila
   * llegaría al visitante del landing y a la app antes de la sesión. No hay
   * `user_id` sin sesión, así que no hay acknowledgement posible: el aviso
   * vuelve en cada apertura, para siempre, y no hay forma de que se ir. Es el
   * peor modo de falla posible —un modal que no se va— y el que por eso se
   * cierra con un término y no con lógica de cliente.
   *
   * Ojo con lo que el caso NO demuestra: no demuestra que un `required` no se
   * entregue a un `authenticated` que no puede acknowledge, que es un imposible
   * porque no hay sesión sin `user_id`. Y no demuestra tampoco el `info`, que es
   * el control de acá mismo y el test siguiente.
   */
  test('un required no se entrega a un anónimo', async () => {
    const anon = await visibleTo('anon', null);

    expect(
      anon,
      'un anónimo recibió un required. No hay user_id sin sesión, así que no ' +
        'lo puede acknowledge y vuelve en cada apertura, para siempre.',
    ).not.toContain(REQUIRED_ALL);
    expect(anon).not.toContain(REQUIRED_ACKED);
    expect(anon).not.toContain(REQUIRED_FRESH);
  });

  /**
   * Un anónimo ve `all` Y `consumers`, y no alcanza `businesses` ni `specific`.
   *
   * El `info` tiene que llegarle, y sin esta aserción el `not.toContain` del
   * required de arriba probaría que la policy no deja pasar NADA a `anon` —lo que
   * sería un producto roto: el banner del landing vive de acá, y el visitante no
   * tiene sesión ni la va a tener. El aviso de mantenimiento tiene que poder ser
   * `all` por esa razón, que es lo que el diseño §5 dice del landing.
   *
   * Y `consumers` también, que es la parte que sorprende: `my_role()` de un
   * anónimo es `'user'` por el fallback del `UNION ALL`, así que entra por la
   * rama de consumidora. Es aceptable —el banner de consumidora tiene que existir
   * fuera de la app, y no hay sesión que lo habilite— y está escrito acá para que
   * nadie lo lea después como una fuga ni como un override. Ver la sección del
   * docblock que dice por qué.
   *
   * Las dos ramas que el anónimo NO tiene que alcanzar van en el mismo test y no
   * en uno aparte: `businesses` exige `my_role() = 'business'` y `specific`
   * exige `user_ids @> array[auth.uid()]`, que con `auth.uid()` nulo es falso.
   * Juntas son lo que separa "el anónimo lee un poco más" de "el anónimo lee
   * todo".
   */
  test('un anónimo ve all y consumers, y no alcanza businesses ni specific', async () => {
    const anon = await visibleTo('anon', null);

    expect(anon).toContain(ACTIVE);
    expect(anon).toContain(WINDOW);
    expect(anon).not.toContain(FUTURE);
    expect(anon).not.toContain(EXPIRED);

    // El caso del hallazgo: `anon` ve `consumers`. No es una excepción tolerada
    // acá, es el comportamiento fijo, y por eso tiene aserción y no una nota.
    expect(
      anon,
      'un anónimo dejó de ver el audience de consumidora. Es lo esperado al ' +
        'revés: my_role() de un anónimo es "user" por el fallback del UNION ' +
        'ALL, así que entra por esa rama, y el banner del landing tiene que ' +
        'existir fuera de la app. Si este test falla por una policy nueva que ' +
        'lo cierre, eso es una regresión de producto, no una mejora de ' +
        'seguridad.',
    ).toContain(CONSUMERS_ONLY);

    // Las dos ramas que sí tienen que quedar cerradas.
    expect(
      anon,
      'un anónimo alcanzó el audience de negocios. Exige my_role() = ' +
        '"business" y no hay sesión, así que esto sería una policy nueva o un ' +
        'fallback de my_role() que cambió.',
    ).not.toContain(BUSINESSES_ONLY);
    expect(
      anon,
      'un anónimo alcanzó un specific. user_ids @> array[auth.uid()] es falso ' +
        'con auth.uid() nulo, así que alcanzarlo significa que el targeting por ' +
        'usuario dejó de ser una frontera.',
    ).not.toContain(SPECIFIC_MINE);

    // El control de la rama positiva: la fila es lo que dice ser. Sin esto, el
    // `toContain` de arriba pasa igual en una base donde nadie la sembró.
    const sembrada = await ctx.sql.unsafe<
      { audience_kind: string; severity: string; active: boolean }[]
    >(
      `select audience_kind, severity, active
         from public.announcements
        where id = '${CONSUMERS_ONLY}'`,
    );
    expect(plainRows(sembrada)[0]).toEqual({
      audience_kind: 'consumers',
      severity: 'info',
      active: true,
    });

    // Y el conjunto exacto, que es lo que cierra la puerta de la fila NUEVA: un
    // `toContain` no nota una fila que se sembró después y que `anon` sí puede
    // ver. Los tres son los que le corresponden y ninguno más.
    expect(
      [...anon].sort(),
      'el anónimo ve un conjunto distinto de {ACTIVE, WINDOW, CONSUMERS_ONLY}. ' +
        'Si creció una fila nueva, el conjunto la delata; si falta una, también.',
    ).toEqual([ACTIVE, WINDOW, CONSUMERS_ONLY].sort());
  });

  /**
   * `admin` solo lee los `all`.
   *
   * `app_role` tiene tres valores y `my_role()` devuelve `'user'` por el
   * `UNION ALL` de su fallback SOLO cuando no hay fila de perfil. Una admin real
   * tiene fila con `role = 'admin'`, así que no matchea `consumers` ni
   * `businesses`: el diseño trata eso a propósito y no cuenta con que caiga por
   * defecto. Si el operador necesita alcanzar a las admins, se agrega un caso
   * explícito.
   *
   * Y por eso esta fila lleva las DOS ramas negativas de la disyunción
   * (`consumers` y `businesses`): son el mismo término con dos roles, y
   * distinguirlas es lo que separa una policy bien escrita de una que escribió
   * `'user'` dos veces. Por eso el final mide la rama positiva desde el otro
   * lado —la dueña de un negocio sí lee `businesses`—, que es el control que
   * hace que los dos `not.toContain` de acá sean el rol y no una tabla vacía.
   *
   * Y si `auth_helpers.my_role()` fuera inalcanzable desde una sesión cliente,
   * este SELECT no devolvería cero filas: daría `42501 permission denied for
   * schema auth_helpers`, que es el error que el `USING` produciría al resolver
   * el nombre de la función sin USAGE en el schema.
   */
  test('un admin solo lee los all', async () => {
    const asAdmin = await visibleTo('authenticated', ADMIN);

    expect(asAdmin).toContain(ACTIVE);
    expect(asAdmin).toContain(WINDOW);
    expect(asAdmin).not.toContain(CONSUMERS_ONLY);
    expect(asAdmin).not.toContain(BUSINESSES_ONLY);
    // El `specific` de otra persona tampoco, por la misma razón.
    expect(asAdmin).not.toContain(SPECIFIC_MINE);

    // El control de las dos ramas negativas, desde el lado que sí entra.
    const asOwner = await visibleTo('authenticated', OWNER);
    expect(asOwner).toContain(BUSINESSES_ONLY);
    expect(asOwner).not.toContain(CONSUMERS_ONLY);
  });
});

describe('lo que un cliente NO puede escribir', () => {
  /**
   * `anon` no inserta un anuncio, ni siquiera con un `sub` en el claim.
   *
   * La segunda mitad importa porque la policy es `TO anon, authenticated` —no
   * `TO public`— y este repo ya tiene el contraejemplo de las policies escritas
   * `TO public`: en `reviews` el predicado se satisface con un `sub`, y eso hace
   * que `anon` escriba filas atribuidas a un usuario. Acá la forma es la
   * cerrada: el ROL decide, no el claim.
   *
   * Y el rechazo es de la POLICY, no del ACL: el privilegio INSERT existe, del
   * `alter default privileges` de Supabase, y lo que no se satisface es la
   * AUSENCIA de policy de INSERT. Asertar el texto del mensaje y no solo el
   * código es lo que separa las dos capas, y lo hace este test a prueba de que
   * el INSERT siga concedido.
   *
   * El inventario de policies va acá porque el hallazgo se apoya en él: la
   * policy de `announcements` es UNA y es de SELECT. Un segundo `INSERT`
   * permisivo escrito por comodidad publicaría un anuncio de la plataforma desde el
   * bundle móvil, y el conteo es lo que lo vuelve visible.
   */
  test('anon no puede escribir', async () => {
    const sinClaim = await denied(insertAnnouncement(), 'anon', null);
    expect(
      sinClaim,
      'anon insertó un anuncio sin claim. La anon key viaja dentro del bundle ' +
        'móvil, así que esto es publicación de contenido desde un cliente.',
    ).not.toBeNull();
    expect(sinClaim?.code).toBe('42501');
    expect(sinClaim?.message).toContain('row-level security policy');

    const conClaim = await denied(insertAnnouncement(), 'anon', CONSUMER);
    expect(
      conClaim,
      'anon con un sub en el claim insertó un anuncio. La policy es TO ' +
        'anon, authenticated, y ninguna es de INSERT, así que el claim no ' +
        'debería alcanzar.',
    ).not.toBeNull();
    expect(conClaim?.code).toBe('42501');
    expect(conClaim?.message).toContain('row-level security policy');

    const policies = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(
      `select policyname, cmd, permissive, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'announcements'
        order by cmd, policyname`,
    );
    // La forma COMPLETA, no `policyname` y `cmd`. `roles` es la mitad de este
    // aserto: sin él, una policy `TO public` —que este repo ya tiene como
    // contraejemplo en `reviews`— pasaría con el mismo nombre y el mismo comando,
    // y el nombre es lo único que un revisor lee. `qual` es la otra mitad, y
    // completa: los cinco términos del `USING` están ahí, escritos, así que
    // ningún término puede desaparecer en silencio —los tests de ventanas y de
    // audiencia los miden por efecto, pero un término que nadie nota no falla
    // hasta que el producto lo nota—. Mismo criterio que
    // `bug-reports.rls.db.spec.ts:551`.
    expect(plainRows(policies)).toEqual([
      {
        policyname: 'Anyone reads the announcements they are eligible for',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['anon', 'authenticated'],
        qual:
          `(active AND ((start_at IS NULL) OR (now() >= start_at)) AND ` +
          `((end_at IS NULL) OR (now() < end_at)) AND ` +
          `((severity = 'info'::text) OR (auth.uid() IS NOT NULL)) AND ` +
          `((audience_kind = 'all'::text) OR ` +
          `((audience_kind = 'consumers'::text) AND ` +
          `(auth_helpers.my_role() = 'user'::app_role)) OR ` +
          `((audience_kind = 'businesses'::text) AND ` +
          `(auth_helpers.my_role() = 'business'::app_role)) OR ` +
          `(user_ids @> ARRAY[auth.uid()])))`,
        with_check: null,
      },
    ]);

    // Y nada entró: las dos denegaciones abortan su transacción, así que esto
    // solo puede significar que un INSERT "denegado" se coló.
    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from public.announcements
        where id::text like 'a1000000-%'`,
    );
    expect(plainRows(rows)[0]?.n).toBe(11);
  });

  /**
   * `authenticated` tampoco: publicar es del operador, por la API.
   *
   * D13 del diseño. Lo que lo hace necesario y no una formalidad es que la misma
   * persona SÍ lee avisos, y una table con SELECT abierto sin escritura
   * bloqueada es la que se rompe cuando alguien mete un `<iframe>` o reordena
   * `priority` desde el cliente para subir su propio aviso.
   *
   * ─── POR QUÉ INSERT Y UPDATE/DELETE NO SE MIDEN IGUAL ──────────────────────
   *
   * Porque con RLS habilitado y CERO policies de UPDATE, Postgres NO da error:
   * el `USING` vacío saca todas las filas, la sentencia casa cero y termina sin
   * quejarse. Lo mismo pasa con DELETE. Un test que solo mira "dió error" no ve
   * esas dos —y por eso el hermano de arriba, `anon no puede escribir`, sí
   * puede: su INSERT falla de verdad, con `42501 new row violates row-level
   * security policy`, porque un INSERT sin `WITH CHECK` que lo apruebe no tiene
   * salida—. El privilegio de escritura EXISTE en los tres casos, por el
   * `alter default privileges` de Supabase; lo que se niega es la AUSENCIA de
   * policy, y la ausencia se comporta distinto por comando.
   *
   * Entonces UPDATE y DELETE se miden por su EFECTO y no por su error: con
   * `returning`, el `rowcount`affected es la única evidencia, y una fila sin
   * modificar leída del dueño es la segunda. Es el mismo razonamiento que
   * `anon update matches zero rows instead of raising` en
   * `categories.rls.db.spec.ts` y que `the owner of A does not update B's
   * business, and the refusal is silent` en `businesses.rls.db.spec.ts`: un
   * cliente que mira el error y no el conteo concluiría que renombró el aviso.
   *
   * Y el inventario del final es el POR QUÉ: la ausencia no se lee, se nombra.
   */
  test('authenticated no puede escribir', async () => {
    // El INSERT es el único de los cuatro que se niega ruidosamente, y se
    // aserta con el texto del mensaje porque el código solo no separa la policy
    // del ACL.
    const insercion = await denied(`${insertAnnouncement()} returning id`);
    expect(
      insercion,
      'un cliente autenticado insertó un anuncio. La anon key viaja dentro del ' +
        'bundle móvil, así que esto es publicación de contenido desde el cliente.',
    ).not.toBeNull();
    expect(insercion?.code).toBe('42501');
    expect(insercion?.message).toContain('row-level security policy');

    // UPDATE y DELETE: cero filas, sin error. El `returning` es lo que mide.
    for (const [consecuencia, sql] of [
      [
        'subió su propio anuncio',
        `update public.announcements set priority = 999 where id = '${ACTIVE}'
         returning id::text`,
      ],
      [
        'desactivó un aviso desde el cliente',
        `update public.announcements set active = false where id = '${ACTIVE}'
         returning id::text`,
      ],
      [
        'borró un anuncio',
        `delete from public.announcements where id = '${ACTIVE}'
         returning id::text`,
      ],
    ] as const) {
      const afectadas = await as(ctx.sql, 'authenticated', CONSUMER, (tx) =>
        tx.unsafe<{ id: string }[]>(sql).then((rows) => rows.map((r) => r.id)),
      );

      expect(
        afectadas,
        `un cliente autenticado ${consecuencia}. Sin policy de UPDATE ni de ` +
          'DELETE el USING es vacío y la sentencia casa cero filas en silencio, ' +
          'así que este [] es lo único que separa la negativa del permiso.',
      ).toEqual([]);
    }

    // Y el estado real, leído del dueño: ni el `priority` ni el `active` se
    // movieron, y la fila sigue ahí. El `n` cubre las otras diez —un DELETE con
    // una policy permisiva sobre otra fila no tocaría esta, y sin el conteo eso
    // no lo vería nadie—.
    const estado = await ctx.sql.unsafe<
      { n: number; priority: number; active: boolean }[]
    >(
      `select (select count(*)::int from public.announcements
                where id::text like 'a1000000-%') as n,
              (select priority from public.announcements
                where id = '${ACTIVE}') as priority,
              (select active from public.announcements
                where id = '${ACTIVE}') as active`,
    );
    expect(
      plainRows(estado)[0],
      'la fila escribible cambió. El dueño es el único que la ve entera, y es ' +
        'la lectura que convierte el [] de arriba en "no pudo escribir" y no ' +
        'en "no le preguntaron a una fila que no era la suya".',
    ).toEqual({ n: 11, priority: 10, active: true });

    // El por qué, nombrado: si alguien abre la escritura por acá, esta lista
    // deja de estar vacía y el test cae antes de que importe el conteo. Las
    // columnas son las mismas que las del inventario de arriba y por el mismo
    // motivo: una policy de escritura `TO public` es el contraejemplo de
    // `reviews`, y acá una lista vacía no distingue "no hay policy" de "la
    // policy es la que no quería".
    const policies = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(
      `select policyname, cmd, permissive, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'announcements'
          and cmd in ('INSERT', 'UPDATE', 'DELETE')
        order by cmd, policyname`,
    );
    expect(plainRows(policies)).toEqual([]);
  });
});

describe('el acknowledgement es de uno, y no se deshace', () => {
  /**
   * Cada persona ve solo los suyos.
   *
   * La fila de `OTHER_USER` es lo que hace que este test tenga un negativo real.
   * Un resultado vacío se lee igual en una base donde la policy no filtra y en
   * una donde no hay nada, así que el dueño sembró las tres filas y las tres se
   * comparan: dos suyas y la de la otra.
   *
   * Y el inventario va acá porque la segunda mitad del contrato —"sin UPDATE ni
   * DELETE"— no es observable desde un SELECT: es una ausencia. Lo que se puede
   * afirmar es lo que hay, y son exactamente dos policies, de SELECT y de INSERT.
   * Una tercera de UPDATE sería la forma de volver a mostrar un `required` ya
   * entendido, que es lo contrario de lo que el producto quiere.
   */
  test('un usuario solo ve sus propios acknowledgements', async () => {
    const mine = await as(ctx.sql, 'authenticated', CONSUMER, (tx) =>
      tx.unsafe<{ announcement_id: string; user_id: string }[]>(
        `select announcement_id::text, user_id::text
           from public.announcement_acknowledgements
          order by announcement_id`,
      ),
    );

    // El conjunto EXACTO, no el orden. El `order by` del `select` ordena por
    // `announcement_id` y las constantes están en orden de declaración, así que
    // comparar las dos listas en orden ataba el test a un detalle del collation
    // —`a1000000-…007` ordena antes que `…00a`, que es lo que pasó— sin que
    // eso dijera nada de la policy. Un conjunto exacto muerde igual de fuerte:
    // una fila de más rompe el `toHaveLength` y una fila de la otra rompe el
    // `toContainEqual`.
    expect(
      plainRows(mine),
      'la consumidora no ve exactamente sus dos acknowledgements. Dos suyas ' +
        'sí: REQUIRED_ALL y REQUIRED_ACKED.',
    ).toHaveLength(2);
    expect(plainRows(mine)).toContainEqual({
      announcement_id: REQUIRED_ALL,
      user_id: CONSUMER,
    });
    expect(plainRows(mine)).toContainEqual({
      announcement_id: REQUIRED_ACKED,
      user_id: CONSUMER,
    });

    // Y la otra persona solo ve el suyo. La fila de la consumidora no aparece.
    const other = await as(ctx.sql, 'authenticated', OTHER_USER, (tx) =>
      tx.unsafe<{ announcement_id: string; user_id: string }[]>(
        `select announcement_id::text, user_id::text
           from public.announcement_acknowledgements
          order by announcement_id`,
      ),
    );
    expect(plainRows(other)).toEqual([
      { announcement_id: ACTIVE, user_id: OTHER_USER },
    ]);

    // El inventario completo de las dos tablas, con la forma y no solo el
    // nombre. `roles` es lo que dice que el `anon` no entra: `TO authenticated`
    // es la diferencia entre "el visitante no puede acknowledge" y "el visitante
    // puede", y sin la columna esa diferencia está solo en el DDL. `qual` y
    // `with_check` son los dos lados del `user_id = auth.uid()`: el `USING` de la
    // lectura y el `WITH CHECK` de la escritura, que son el mismo predicado
    // llegando por dos caminos distintos.
    const policies = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(
      `select policyname, cmd, permissive, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'announcement_acknowledgements'
        order by cmd, policyname`,
    );
    expect(plainRows(policies)).toEqual([
      {
        policyname: 'Users acknowledge for themselves',
        cmd: 'INSERT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        qual: null,
        with_check: '(user_id = auth.uid())',
      },
      {
        policyname: 'Users read their own acknowledgements',
        cmd: 'SELECT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        qual: '(user_id = auth.uid())',
        with_check: null,
      },
    ]);
  });

  /**
   * Reintentar no crece la tabla.
   *
   * La red lenta del móvil hace que un doble toque sea la regla y no la
   * excepción, y `acknowledge` va por el camino del reintento. Sin la PK
   * compuesta, cada reintento agrega una fila y la lista de "entendidos" se
   * multiplica sola.
   *
   * El rechazo es de la RESTRICCIÓN y no de la policy: el `WITH CHECK` se
   * satisface —`user_id = auth.uid()` es verdadero—, así que lo que falla es la
   * clave primaria. Es el `23505` el que dice que la fila ya estaba, y por eso
   * el aserto del código importa: un `42501` acá significaría que la policy
   * cambió, no que el reintento está funcionando.
   */
  test('un acknowledgement es idempotente', async () => {
    const sql = `insert into public.announcement_acknowledgements (announcement_id, user_id)
         values ('${REQUIRED_FRESH}', '${CONSUMER}')`;

    // El primero entra. `as()` y no `deniedAs()`: llegar al segundo aserto ES
    // la prueba, y si el INSERT se rechazara la excepción sale del test con el
    // mensaje del servidor y no hay nada que leer acá.
    await as(ctx.sql, 'authenticated', CONSUMER, (tx) => tx.unsafe(sql));

    const segundo = await denied(sql);
    expect(
      segundo,
      'el mismo par (announcement_id, user_id) entró dos veces. La PK compuesta ' +
        'no está, y cada reintento del acknowledgement agrega una fila.',
    ).not.toBeNull();
    expect(segundo?.code).toBe('23505');

    // Y una sola fila, leído del dueño: la que entró y la que no pudo.
    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n
         from public.announcement_acknowledgements
        where announcement_id = '${REQUIRED_FRESH}' and user_id = '${CONSUMER}'`,
    );
    expect(plainRows(rows)[0]?.n).toBe(1);
  });

  /**
   * RF #3: editar un `required` ya entendido no lo vuelve a mostrar.
   *
   * La decisión es correcta —re-notificar en cada edición es peor que no hacerlo,
   * porque el operador edita para corregir una errata y el usuario ya entendió lo
   * que se le iba a pedir— y tiene que estar FIJADA, no accidental. Lo que la fija
   * es que el acknowledgement es de la fila, no de su contenido: la PK es
   * `(announcement_id, user_id)` y la fila de acknowledgement no se toca cuando
   * el texto cambia.
   *
   * Por eso el test no puede ser solo "no aparece". El `update` lo hace el
   * dueño, y un `update` que no hubiera pasado por una fila inexistente daría
   * el mismo resultado. Así que los tres pasos se asertan por separado:
   *
   *   1. el texto cambió de verdad, leído del dueño;
   *   2. RLS sigue entregando el aviso, porque la policy NO sabe de
   *      acknowledgements —que es correcto: el `USING` corre por fila de
   *      `announcements` y el acknowledgement es de otra tabla—;
   *   3. la consulta de la app, la que descarta lo entendido, no lo devuelve.
   *
   * Y el paso 4 es el que hace que los otros tres signifiquen algo: otra persona
   * sin acknowledgement sí lo ve. Si ese `toContain` falla, el "no aparece" del
   * paso 3 no lo escondió el acknowledgement sino que la fila dejó de ser
   * elegible, y el test estaría hablando de otra cosa.
   */
  test('un required ya entendido no reaparece tras editarlo', async () => {
    // 1. El operador corrige la errata. El dueño es el único que puede.
    await ctx.sql.unsafe(
      `update public.announcements
          set title = 'Aceptá los términos nuevos',
              body = 'Al aceptar la compra, aceptás los términos.',
              updated_at = now()
        where id = '${REQUIRED_ACKED}'`,
    );

    const editada = await ctx.sql.unsafe<{ title: string; body: string }[]>(
      `select title, body from public.announcements where id = '${REQUIRED_ACKED}'`,
    );
    expect(
      plainRows(editada)[0],
      'el update no cambió la fila. El `not.toContain` de más abajo probaría ' +
        'nada sobre el texto nuevo, que es exactamente lo que este caso mide.',
    ).toEqual({
      title: 'Aceptá los términos nuevos',
      body: 'Al aceptar la compra, aceptás los términos.',
    });

    // 2. RLS sigue entregándolo: la policy es ajena a los acknowledgements.
    expect(await visibleTo('authenticated', CONSUMER)).toContain(
      REQUIRED_ACKED,
    );

    // 3. La consulta de la app, la que descarta lo entendido, no lo devuelve.
    expect(await pendingFor(CONSUMER)).not.toContain(REQUIRED_ACKED);

    // 4. Y otra persona sin acknowledgement sí lo ve pendiente. Sin esta línea
    // el paso 3 se lee igual si la fila dejó de ser elegible entera.
    expect(await pendingFor(OTHER_USER)).toContain(REQUIRED_ACKED);
  });
});
