import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * El ÚNICO camino de escritura de un reporte de errores, ejecutado de verdad.
 *
 * ─── POR QUÉ ESTE ARCHIVO Y NO EL ESPEJO DE DRIZZLE ─────────────────────────
 *
 * `apps/api/test/db.ts` construye la base desde `apps/api/drizzle/`, y ese
 * espejo filtra `CREATE POLICY`, los `GRANT`/`REVOKE` y todo lo que toque
 * `auth.uid()`. Es la base correcta para probar las consultas del API y la base
 * INCORRECTA para probar esto: una policy con un nombre de columna mal escrito
 * pasa en los specs del repositorio y muere acá. Este archivo usa
 * `test/supabase-platform.ts`, que replayea `supabase/migrations/` de verdad,
 * crea los roles `anon`/`authenticated`/`service_role` y stubea `auth.uid()`
 * leyendo `request.jwt.claim.sub`.
 *
 * Y hay una razón más, que es la que decide dónde vive la prueba del trigger:
 * el espejo de Drizzle NO lleva triggers, así que `stamp_bug_reporter` —que es
 * lo único que sella la autoría— no existe en la base de `test/db.ts`. No hay
 * forma de medirlo allá.
 *
 * ─── QUÉ SE ESTÁ PROBANDO ───────────────────────────────────────────────────
 *
 * `20260930234450_bug_reports_and_delivery_axis.sql` abre exactamente UN
 * permiso de escritura sobre `app_store`:
 *
 *     create policy "Users submit bug reports"
 *       on public.app_store for insert to authenticated
 *       with check (
 *         namespace          = 'bug_report'
 *         and delivery_status = 'PENDIENTE'
 *         and state           = 'ABIERTO'
 *         and origin in ('ios','android','pwa')
 *         and deleted_at is null
 *       );
 *
 * Cada término tapa un agujero distinto, y ninguno es el mismo que el otro:
 *
 *   namespace = 'bug_report'      sin esto el cliente escribe en la BANDEJA DE
 *                                 CONTACTOS —que comparte tabla— y en cualquier
 *                                 namespace que alguien invente mañana.
 *   delivery_status = 'PENDIENTE' sin esto el cliente finge que el aviso ya se
 *                                 entregó, y el badge de entrega del panel
 *                                 pasa a mentir sobre el estado de la
 *                                 operación.
 *   state = 'ABIERTO'             sin esto el cliente se auto-atiende: escribe
 *                                 el reporte ya `CORREGIDO` y la bandeja de
 *                                 triaje queda con trabajo atribuido al cliente
 *                                 y no al equipo.
 *   origin in (ios,android,pwa)  sin esto el cliente declara un canal que no
 *                                 es el suyo. `web` NO está, y no es un
 *                                 olvido: la app mapea navegador a `pwa` a
 *                                 propósito (`reportOriginFor`), y `web` queda
 *                                 reservado para que la landing quepa después.
 *   deleted_at is null            sin esto el cliente escribe un reporte ya
 *                                 borrado y el operador no lo ve en la bandeja.
 *
 * Y lo que NO hay importa tanto como lo que hay: no hay policy de SELECT, ni de
 * UPDATE, ni de DELETE. El cliente puede reportar y nunca auto-atenderse.
 *
 * ─── EL POSTURING MEDIDO, EN UN SOLO LUGAR ──────────────────────────────────
 *
 *   app_store   anon:          INSERT, UPDATE, DELETE — SELECT revocado
 *               authenticated: INSERT, UPDATE, DELETE — SELECT revocado
 *               service_role:  todo
 *               policies:      1, y es de INSERT
 *
 * Los tres privilegios destructivos vienen del ACL por defecto de Supabase
 * (`alter default privileges ... grant all on tables`), no de una decisión de
 * esta migración: `20260928184943` revocó TRUNCATE, TRIGGER y REFERENCES.
 * INSERT, UPDATE y DELETE siguen en manos de los roles cliente y lo único que
 * los frena es la AUSENCIA de policy. Esa asimetría —el ACL abierto y la policy
 * cerrada— es la que este archivo mide, y por eso el inventario de privileges y
 * el de policies se assertan en el mismo archivo: son dos capas y una sola
 * protege.
 *
 * `revoke select on public.app_store from anon, authenticated` cierra la
 * lectura. Sin él, un solo GRANT —o una policy de SELECT escrita por comodidad—
 * volvería legible la bandeja de contactos, con los `reporter_id` de los
 * reportes adentro, para cualquiera que tenga la anon key: que viaja dentro del
 * bundle móvil. Y el revoke está en la MISMA migración que la policy que sí
 * abre la escritura, porque sin él la garantía depende de que nadie añada una
 * línea después.
 *
 * ─── HALLAZGO 1: QUÉ CAPA FRENA A QUIÉN, Y POR QUÉ IMPORTA ─────────────────
 *
 * Las dos capas producen el mismo código `42501` con mensajes distintos, así
 * que un `expect(code).toBe('42501')` no las separa:
 *
 *   INSERT rechazado          → `new row violates row-level security policy`.
 *                               El privilegio INSERT EXISTE (viene del ACL por
 *                               defecto) y lo que no se satisface es el
 *                               `WITH CHECK`.
 *   SELECT, UPDATE, DELETE,
 *   TRUNCATE rechazados       → `permission denied for table app_store`. O no
 *                               hay privilegio, o falta SELECT sobre las
 *                               columnas del `WHERE`.
 *
 * ─── HALLAZGO 2: EL `revoke select` ES LO QUE HACE RUIDOSO EL UPDATE ────────
 *
 * `update … where namespace = 'bug_report'` como `authenticated` falla con
 * `42501 permission denied for table app_store`, y es fácil leerlo como "no
 * puede UPDATE". Lo que pasa es que Postgres necesita SELECT sobre las columnas
 * del `WHERE` para saber a qué filas aplica, y el SELECT fue revocado. Quitás el
 * `WHERE` y el mismo `update` corre y afecta CERO filas, porque no hay policy de
 * UPDATE y RLS no deja pasar ninguna. Los dos resultados son seguros y tienen
 * formas distintas: con el SELECT de vuelta el rechazo pasa a ser silencioso. Por
 * eso los dos se miden, y el segundo es el que dice la verdad.
 *
 * ─── HALLAZGO 3: EL SELLO DE LA AUTORÍA NO LO PONE LA POLICY ────────────────
 *
 * El `WITH CHECK` no menciona `value` ni `reporter_id`. Eso lo pone un trigger
 * BEFORE INSERT:
 *
 *     new.value := coalesce(new.value, '{}'::jsonb)
 *                  || jsonb_build_object('reporter_id', auth.uid()::text);
 *
 * El operando derecho pisa al izquierdo, así que lo que el cliente mande en
 * `value.reporter_id` se sobreescribe. Que el trigger sea BEFORE y no AFTER
 * importa por una razón que esta base NO puede demostrar sobre esta tabla, y
 * conviene decirlo en vez de aparentarlo: hoy ningún término del `WITH CHECK`
 * lee `value`, así que no hay término con el que el sello compita. La propiedad
 * observable es otra, y es la que se mide: lo que el cliente manda en
 * `reporter_id` no llega a la fila, y con el trigger caído sí.
 *
 * ─── LO QUE ESTE ARCHIVO NO PUEDE MEDIR, Y POR QUÉ ──────────────────────────
 *
 * Las dos policies de `storage.objects` NO son ejecutables desde una sesión
 * cliente en esta base, y la razón NO es la migración: el harness declara
 * `storage` como stub, sin RLS sobre `storage.objects` y sin privilegio para
 * `anon` ni `authenticated`. Supabase real otorga las tres cosas.
 *
 * No se corrige agregando el grant al harness.
 * `PLATFORM_GRANTS_AFTER_REPLAY` en `test/supabase-platform.ts` ya lleva escrito
 * ese error, con el caso del `grant usage on schema auth_helpers` que volvió
 * verde un test de admin describiendo una base que nadie corre. Y acá el
 * privilegio que falta es de la PLATAFORMA, no del ledger: no hay un solo
 * `grant` sobre `storage` en `supabase/migrations/`, y no debería haberlo. Lo
 * que se hace en su lugar es medir el texto de las policies dentro de una
 * transacción que se tira hacia atrás, como
 * `profiles-reviews.rls.db.spec.ts` hace con el grant por columna: es una
 * medición de lo que la policy dice, no una afirmación sobre qué privilegios
 * tiene producción.
 *
 * ─── DEUDA ANOTADA, NO RESUELTA ─────────────────────────────────────────────
 *
 * El `upsert: false` del upload del móvil, junto con el prefijo de uid, hace
 * que reintentar una captura no duplique el archivo. La FILA sí puede
 * duplicarse: `app_store` no tiene idempotency key, `id` es
 * `gen_random_uuid()` y `key` no tiene índice único. Un doble toque con la red
 * lenta produce dos reportes idénticos. Queda anotado acá porque este es el
 * archivo que sabe qué está garantizado y qué no.
 */

let ctx: SupabaseTestDb;

/**
 * La persona que reporta. El `1111…` es la misma forma que usan las otras
 * cuatro personas de este directorio, para que los specs se lean igual.
 */
const REPORTER = '11111111-1111-1111-1111-111111111111';
/** Otra persona con sesión, que es la contrafiguración del `reporter_id`. */
const STRANGER = '33333333-3333-3333-3333-333333333333';

/** Un mensaje de contacto sembrado: la fila que el término `namespace` protege. */
const CONTACT_ID = 'f0000000-0000-4000-8000-000000000001';
/** Un reporte sembrado por el servidor, que el cliente no puede tocar. */
const BUG_ID = 'f0000000-0000-4000-8000-000000000002';

/** Las diez columnas de `app_store`, en orden. La policy mira cinco. */
const APP_STORE_COLUMNS: readonly string[] = [
  'id',
  'namespace',
  'key',
  'value',
  'delivery_status',
  'created_at',
  'updated_at',
  'deleted_at',
  'state',
  'origin',
];

/**
 * El resumen de las dos filas sembradas, distinto del de cualquier sonda, para
 * que los conteos de este archivo puedan decir "quedó lo que había" sin
 * depender de cuántas sondas se limpiaron.
 */
const SEEDED_SUMMARY = 'la app no me deja pagar';

/**
 * Marca de las filas que escriben las sondas de este archivo.
 *
 * Existe porque `as()` COMMITEA en el camino de éxito —el docstring de
 * `deniedAs` lo dice explícitamente y el cleanup es del caller— y borrar por
 * `namespace = 'bug_report'` se llevaría por delante la fila sembrada que
 * media el resto del archivo. El `key` lo elige el cliente y la policy no lo
 * mira, así que es una marca barata y honesta.
 */
const PROBE_KEY_PREFIX = 'rls-bug-probe-';
let probeSeq = 0;

/**
 * Sentinel para tirar una transacción hacia atrás en un punto conocido.
 *
 * El `rollback` del `sql.begin()` de postgres.js lo dispara la excepción que
 * sale del callback, así que hace falta una clase propia para que el `catch`
 * distinga "la sonda terminó y quiero deshacerla" de "la sonda falló de
 * verdad".
 */
class Rollback extends Error {}

/**
 * postgres.js contesta con un `RowList`, que es un array que además carga
 * metadatos de la consulta, y `toEqual` compara los metadatos también. Misma
 * normalización que los otros specs del directorio: spread.
 */
function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * Un literal de texto de SQL, o el literal `null`.
 *
 * Existe para que los `overrides` de `insertBug` puedan decir `null` y no
 * `'null'`, que son cosas distintas en el string final.
 */
function literal(value: string | null): string {
  return value === null ? 'null' : `'${value}'`;
}

/**
 * El `INSERT` de un reporte, en su forma buena, con lo que se quiera cambiar.
 *
 * Las columnas que nombra la policy se pisan desde acá porque el punto del
 * archivo es medir cada término por separado: un `insert` que ya viene con
 * `state = 'CORREGIDO'` a propósito tiene que fallar por el término de `state`,
 * y solo se sabe que falla por ese si las otras cuatro columnas están bien.
 *
 * `value` es SQL crudo a propósito, porque lleva el `::jsonb` y porque hay que
 * poder pasar `reporter_id` con el uuid de otra persona adentro.
 */
function insertBug(
  overrides: Partial<{
    namespace: string;
    delivery_status: string;
    state: string | null;
    origin: string | null;
    deletedAt: string | null;
    value: string;
  }> = {},
): string {
  const {
    namespace = 'bug_report',
    delivery_status = 'PENDIENTE',
    state = 'ABIERTO',
    origin = 'ios',
    deletedAt = null,
    value = `'{"summary":"${SEEDED_SUMMARY}"}'::jsonb`,
  } = overrides;

  const columns = ['namespace', 'value', 'delivery_status'];
  const values = [literal(namespace), value, literal(delivery_status)];
  // `state` y `origin` se nombran siempre salvo que el override sea `null`, que
  // es el caso "el cliente los omitió" y necesita una omisión de verdad.
  if (state !== null) {
    columns.push('state');
    values.push(literal(state));
  }
  if (origin !== null) {
    columns.push('origin');
    values.push(literal(origin));
  }
  if (deletedAt !== null) {
    columns.push('deleted_at');
    values.push(deletedAt);
  }
  // La marca va SIEMPRE. Es lo que `probe()` borra, y una sonda sin marcar sería
  // una fila que este archivo deja en la base compartida sin que nadie la pueda
  // identificar después.
  columns.push('key');
  values.push(literal(nextProbeKey()));

  return `insert into public.app_store (${columns.join(', ')}) values (${values.join(', ')})`;
}

/** La marca de la próxima sonda, para poder borrarla después. */
function nextProbeKey(): string {
  probeSeq += 1;
  return `${PROBE_KEY_PREFIX}${probeSeq}`;
}

/**
 * Corre una sentencia como `authenticated` y devuelve el error, o `null` si
 * entró.
 *
 * El camino de denegación se mide con esto. El de permiso se mide con `as()`,
 * porque acá un `null` significa "entró" y esa confusión —leer un `null` como
 * "no pasó nada"— es el error clásico de este harness. Las dos funciones están
 * separadas y cada test dice cuál usa y por qué.
 */
async function denied(
  sql: string,
  role: 'anon' | 'authenticated' = 'authenticated',
  userId: string | null = REPORTER,
): Promise<{ code: string; message: string } | null> {
  return deniedAs(ctx.sql, role, userId, (tx) => tx.unsafe(sql));
}

/**
 * Corre una sonda de escritura y borra TODO lo que haya marcado, se haya
 * comiteado o no.
 *
 * El borrado va en el `finally` y es idempotente, así que un rechazo —que
 * aborta la transacción y no deja nada— y un permiso —que commitea— terminan
 * igual. Cada test que usa esta función asserta el conteo de filas de la marca
 * en cero por su cuenta, y el del final del camino de allow revisa la tabla
 * entera: una fuga no puede esconderse en el test que la produjo.
 *
 * No recibe la sentencia a propósito. Se llama `probe(fn)` y la sonda escribe
 * con `as()` o con `deniedAs()` adentro, que es donde el camino de éxito tiene
 * que quedar explícito —un parámetro `sql` que nadie ejecuta sería la forma
 * de que esta función pareciera correr algo que no corre.
 */
async function probe<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    await ctx.sql
      .unsafe(
        `delete from public.app_store where key like '${PROBE_KEY_PREFIX}%'`,
      )
      .catch(() => {});
  }
}

/**
 * Corre `fn` con la policy de insert REEMPLAZADA por una más débil, y tira
 * todo hacia atrás.
 *
 * Es la herramienta de los contrafáctuales, y sin esto un
 * `expect(denial).not.toBeNull()` NO puede distinguir "el término de `namespace`
 * sostiene la bandeja de contactos" de "algo más la sostiene": los cinco
 * rechazos de este archivo producen el mismo `42501` con el mismo texto.
 * Quitando un término y mostrando que el agujero se abre, cada uno queda
 * demostrado por separado, y el agujero que se abre es el que el término nombra.
 *
 * La policy debilitada y las filas que ella admitiera se van con el rollback, así
 * que la medición no contamina las que están alrededor.
 */
async function counterfactual(
  check: string,
  sql: string,
): Promise<{ inserted: boolean; code?: string }> {
  let result: { inserted: boolean; code?: string } = { inserted: false };
  try {
    await ctx.sql.begin(async (tx) => {
      await tx.unsafe(
        `drop policy "Users submit bug reports" on public.app_store`,
      );
      await tx.unsafe(
        `create policy "harness_probe" on public.app_store
           for insert to authenticated with check (${check})`,
      );
      await tx.unsafe(`set local role authenticated`);
      await tx.unsafe(
        `select set_config('request.jwt.claim.sub', '${REPORTER}', true)`,
      );
      try {
        await tx.unsafe(sql);
        result = { inserted: true };
      } catch (error) {
        result = { inserted: false, code: (error as { code?: string }).code };
      }
      throw new Rollback('harness_probe');
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return result;
}

/**
 * Los cuatro términos que quedan cuando se saca uno del medio.
 *
 * La clave es el término que falta y el valor es "el resto del contrato sin
 * él", para que cada contrafáctual se lea como la pregunta que hace.
 */
const WITHOUT: Record<string, string> = {
  namespace: `delivery_status = 'PENDIENTE' and state = 'ABIERTO'
       and origin in ('ios','android','pwa') and deleted_at is null`,
  delivery_status: `namespace = 'bug_report' and state = 'ABIERTO'
       and origin in ('ios','android','pwa') and deleted_at is null`,
  state: `namespace = 'bug_report' and delivery_status = 'PENDIENTE'
       and origin in ('ios','android','pwa') and deleted_at is null`,
  origin: `namespace = 'bug_report' and delivery_status = 'PENDIENTE'
       and state = 'ABIERTO' and deleted_at is null`,
  deleted_at: `namespace = 'bug_report' and delivery_status = 'PENDIENTE'
       and state = 'ABIERTO' and origin in ('ios','android','pwa')`,
};

/**
 * El `WITH CHECK` del ledger, completo, sin quitarle nada.
 *
 * Existe para el control del contrafáctual: pasárselo a `counterfactual()`
 * tiene que seguir rechazando las cinco escrituras prohibidas. Sin ese control,
 * un `counterfactual()` que corriera como el dueño —porque el `set local role`
 * no se aplicó, o porque una futura edición rompe el helper— devolvería
 * `inserted: true` siempre y el bloque de contrafáctuales estaría "midiendo"
 * un espejo.
 */
const FULL_CHECK = `namespace = 'bug_report' and delivery_status = 'PENDIENTE'
       and state = 'ABIERTO' and origin in ('ios','android','pwa') and deleted_at is null`;

/**
 * Corre `fn` con los privilegios de Storage que Supabase otorga y el harness
 * no, y tira todo hacia atrás.
 *
 * Lo que se agrega es la PLATAFORMA —USAGE sobre el schema, INSERT y SELECT
 * sobre la tabla, y RLS habilitado— y NO la policy, que es la del ledger y no
 * se toca. Ver el bloque sobre `PLATFORM_GRANTS_AFTER_REPLAY` en el encabezado.
 *
 * UNA sentencia por llamada de `asMember`. Una sentencia rechazada aborta la
 * transacción y la siguiente falla con `25P02` sin importar lo que diga, así
 * que una sonda que puede fallar necesita su propia transacción; el
 * `withStoragePlatform` de adentro abre una por sentencia justamente por eso.
 */
async function withStoragePlatform<T>(
  fn: (asMember: (sql: string) => Promise<string>) => Promise<T>,
): Promise<T> {
  let result: T | undefined;

  /** Una transacción, una sentencia. Se tira hacia atrás siempre. */
  const oneSonda = async (sql: string): Promise<string> => {
    let answer: string | undefined;
    try {
      await ctx.sql.begin(async (tx) => {
        await tx.unsafe(`grant usage on schema storage to authenticated`);
        await tx.unsafe(
          `grant insert, select on storage.objects to authenticated`,
        );
        await tx.unsafe(
          `alter table storage.objects enable row level security`,
        );
        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(
          `select set_config('request.jwt.claim.sub', '${REPORTER}', true)`,
        );
        try {
          const rows = await tx.unsafe(sql);
          answer = `ok:${plainRows(rows).length}`;
        } catch (error) {
          answer = String((error as { code?: string }).code);
        }
        throw new Rollback('storage_probe');
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    return answer as string;
  };

  result = await fn(oneSonda);
  return result;
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  /**
   * Dos filas sembradas, y el dueño es el único rol que puede escribirlas sin
   * la policy del ledger.
   *
   * La de `contact` es la que el término `namespace` protege: sin una fila de
   * contacto real, "el cliente no puede escribir en la bandeja de contactos"
   * sería un enunciado sobre una bandeja vacía. Y las dos juntas son lo que hace
   * que los rechazos de SELECT, UPDATE y DELETE se midan contra una tabla
   * poblada y no contra el vacío —un cero de filas y un cero por RLS son
   * afirmaciones distintas—.
   *
   * El `state` de la fila de contacto es NULL y no `ABIERTO`, que es lo que el
   * schema documenta al llamar `state` nullable: el mensaje de contacto comparte
   * la columna, no el vocabulario.
   *
   * ─── LA FILA DE REPORTE TIENE `reporter_id` EN NULL, Y NO ES UN ERROR ──────
   *
   * El `value` de abajo pone `"reporter_id": "${REPORTER}"` y el resultado en la
   * fila es `null`. No es que el seed falle: el trigger `on_bug_report_stamped`
   * se dispara igual, escribe su `reporter_id: auth.uid()` sobre lo que le
   * mandamos, y este seed corre como el dueño de la tabla SIN `sub` en el claim.
   * O sea que `auth.uid()` es NULL y el operando derecho del `||` —que es el
   * que pisa— deja `{"reporter_id": null}`.
   *
   * Está anotado porque es una trampa para quien agregue una aserción contra
   * `BUG_ID` después: leería `reporter_id` esperando el `REPORTER` del seed y la
   * aserción fallaría sin que haya ningún bug, porque el trigger se está portando
   * exactamente como debe. Es el mismo hecho que mide el bloque "sin sub en el
   * claim el sello queda null", alcanzado por el camino del dueño. Para una fila
   * con `reporter_id` real hay que escribirla con `as()`, que es lo que hacen
   * los tests del camino de allow.
   */
  await ctx.sql.unsafe(`
    insert into public.app_store (id, namespace, value, delivery_status, state, origin)
    values ('${CONTACT_ID}', 'contact',
            '{"email":"alguien@ejemplo.test","role":"consumidor","city":"quito",
              "message":"la app no me deja pagar","summary":"${SEEDED_SUMMARY}"}'::jsonb,
            'PENDIENTE', null, 'web');

    insert into public.app_store (id, namespace, value, delivery_status, state, origin)
    values ('${BUG_ID}', 'bug_report',
            '{"summary":"no abre la lista de ofertas","description":"al abrir Offers queda cargando",
              "images":[],"reporter_id":"${REPORTER}","at":"2026-09-30T20:00:00.000Z"}'::jsonb,
            'PENDIENTE', 'ABIERTO', 'ios');
  `);
});

afterAll(async () => {
  await ctx.stop();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('la policy de insert es UNA, y es de INSERT', () => {
  /**
   * La forma exacta, desde el catálogo vivo.
   *
   * El texto se asserta COMPLETO y no por partes. Una `WITH CHECK` que fuera
   * "igual" en cuatro de sus cinco términos y hubiera cambiado el quinto —de
   * `state = 'ABIERTO'` a `state is not null`, digamos— pasaría una aserción
   * por parte, y esa aserción es justo la que tiene que fallar.
   *
   * `qual IS NULL` es la otra mitad: una policy de INSERT no lleva `USING`, y
   * si apareciera uno la policy dejaría de ser solo de escritura.
   */
  test('la policy existe, es FOR INSERT, es TO authenticated, y su WITH CHECK es el del ledger', async () => {
    const rows = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        permissive: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(`select policyname, cmd, permissive, roles, qual, with_check
         from pg_policies
        where schemaname = 'public' and tablename = 'app_store'`);

    expect(plainRows(rows)).toEqual([
      {
        policyname: 'Users submit bug reports',
        cmd: 'INSERT',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        qual: null,
        with_check:
          `((namespace = 'bug_report'::text) AND ` +
          `(delivery_status = 'PENDIENTE'::delivery_status) AND ` +
          `(state = 'ABIERTO'::text) AND ` +
          `(origin = ANY (ARRAY['ios'::entry_origin, 'android'::entry_origin, ` +
          `'pwa'::entry_origin])) AND (deleted_at IS NULL))`,
      },
    ]);
  });

  /**
   * El desglose por comando, que es la aserción que un conteo plano no puede
   * hacer.
   *
   * `count(*) = 1` sobre las policies de la tabla no distingue "agregaron una
   * segunda policy" de "sustituyeron la existente por otra". Agregada: el
   * conteo sigue en 1. Sustituida por una policy de SELECT permisiva: el conteo
   * también sigue en 1, `has_table_privilege` sigue diciendo `false`, y la
   * bandeja de contactos —con los `reporter_id` adentro— quedaría a una
   * consulta de cualquiera que tenga la anon key. El desglose separa las dos
   * cosas, y por eso está.
   */
  test('no hay policy de SELECT, UPDATE ni DELETE: el cliente reporta y nunca se auto-atiende', async () => {
    const byCommand = await ctx.sql.unsafe<{ cmd: string; n: number }[]>(
      `select cmd, count(*)::int as n
         from pg_policies
        where schemaname = 'public' and tablename = 'app_store'
        group by cmd
        order by cmd`,
    );

    expect(plainRows(byCommand)).toEqual([{ cmd: 'INSERT', n: 1 }]);
  });

  /**
   * Los privilegios de los tres roles, completos.
   *
   * `anon` y `authenticated` son idénticos salvo por nada, y esa forma es la que
   * hay que leer con atención: los dos roles cliente tienen INSERT, UPDATE y
   * DELETE sobre `app_store`. No viene de esta migración —viene del ACL por
   * defecto de Supabase— y no se revocó. Lo único que separa al cliente del
   * UPDATE y del DELETE es que no hay policy para ellos, y eso es una afirmación
   * sobre `pg_policies`, no sobre el ACL. Por eso las dos cosas se assertan en
   * el mismo archivo: son dos capas y solo una está cerrada por migración.
   *
   * TRUNCATE, TRIGGER y REFERENCES en `false` los revokea
   * `20260928184943_revoke_client_destructive_privileges.sql`, y son
   * precisamente los tres que RLS no puede gobernar: no hay policy que filtre
   * un TRUNCATE. Por eso se assertan acá y no "por ser una tabla más".
   */
  test('los roles cliente tienen INSERT, UPDATE y DELETE, y nada de SELECT ni de lo destructivo', async () => {
    const privs = await ctx.sql.unsafe<
      {
        rolname: string;
        sel: boolean;
        ins: boolean;
        upd: boolean;
        del: boolean;
        trunc: boolean;
        trg: boolean;
        refs: boolean;
      }[]
    >(`select r.rolname,
                has_table_privilege(r.rolname, 'public.app_store', 'SELECT')     as sel,
                has_table_privilege(r.rolname, 'public.app_store', 'INSERT')     as ins,
                has_table_privilege(r.rolname, 'public.app_store', 'UPDATE')     as upd,
                has_table_privilege(r.rolname, 'public.app_store', 'DELETE')     as del,
                has_table_privilege(r.rolname, 'public.app_store', 'TRUNCATE')   as trunc,
                has_table_privilege(r.rolname, 'public.app_store', 'TRIGGER')    as trg,
                has_table_privilege(r.rolname, 'public.app_store', 'REFERENCES') as refs
           from pg_roles r
          where r.rolname in ('anon', 'authenticated', 'service_role')
          order by r.rolname`);

    expect(plainRows(privs)).toEqual([
      {
        rolname: 'anon',
        sel: false,
        ins: true,
        upd: true,
        del: true,
        trunc: false,
        trg: false,
        refs: false,
      },
      {
        rolname: 'authenticated',
        sel: false,
        ins: true,
        upd: true,
        del: true,
        trunc: false,
        trg: false,
        refs: false,
      },
      {
        rolname: 'service_role',
        sel: true,
        ins: true,
        upd: true,
        del: true,
        trunc: true,
        trg: true,
        refs: true,
      },
    ]);
  });

  /**
   * RLS habilitado y NO forzado, los cinco índices, y las diez columnas.
   *
   * `relforcerowsecurity = false` es la configuración de producción y es lo que
   * hace que la impersonación de `as()` sea lo que decide: RLS aplica a todos
   * los roles menos al dueño de la tabla, y el dueño es el rol con el que el
   * harness conecta. Forzarlo acá sería medir una base que producción no tiene.
   *
   * `app_store_status_idx` pasó a llamarse `app_store_delivery_status_idx` con
   * el rename del eje, y `app_store_state_idx` es la columna nueva. Se assertan
   * porque el `WHERE` del listado del panel es `namespace = 'bug_report' and
   * state = …`, y un índice que falta es un buzón que se degrada en silencio a
   * medida que crecen los reportes.
   *
   * Y la lista de columnas va con la del inventario de privileges, porque el
   * perímetro de la policy son CINCO columnas de DIEZ. La diferencia es lo que
   * dice que el cliente escribe más de lo que la policy controla.
   */
  test('RLS habilitado y no forzado, cinco índices, y las diez columnas de app_store', async () => {
    const flags = await ctx.sql.unsafe<
      {
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }[]
    >(
      `select c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'app_store'`,
    );

    expect(plainRows(flags)).toEqual([
      { relrowsecurity: true, relforcerowsecurity: false },
    ]);

    const indexes = await ctx.sql.unsafe<{ indexname: string }[]>(
      `select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'app_store'
        order by indexname`,
    );
    expect(plainRows(indexes).map((i) => i.indexname)).toEqual([
      'app_store_created_at_idx',
      'app_store_delivery_status_idx',
      'app_store_namespace_idx',
      'app_store_pkey',
      'app_store_state_idx',
    ]);

    const columns = await ctx.sql.unsafe<{ column_name: string }[]>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public' and table_name = 'app_store'
        order by ordinal_position`,
    );
    expect(plainRows(columns).map((c) => c.column_name)).toEqual([
      ...APP_STORE_COLUMNS,
    ]);
    expect(APP_STORE_COLUMNS).toHaveLength(10);
  });

  /**
   * La anti-vacuidad, en la forma que este archivo necesita.
   *
   * Los roles del harness son `nologin` y RLS no está forzado, así que una
   * sesión que se olvidara de `set local role` correría como el dueño y saltearía
   * todas las policies del archivo mientras cada aserción seguiría pasando. La
   * prueba es barata: el dueño ve las dos filas sembradas y `authenticated` no
   * ve ninguna, y para que el segundo número signifique algo la fila tiene que
   * estar —de eso se ocupa la aserción del dueño.
   *
   * `anon` no puede ser la comparación en la lectura: no tiene privilegio
   * SELECT, así que se rechaza en la capa del ACL antes de que RLS sea
   * consultado. El par dueño/`authenticated` es además la comparación que le
   * importa al producto.
   */
  test('la impersonación está viva: el dueño ve las filas y un cliente ninguna', async () => {
    const asOwner = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(
      plainRows(asOwner)[0]?.n,
      'el dueño no ve las dos filas sembradas. Cada aserción de este archivo ' +
        'que mide una negación estaría midiendo una tabla vacía.',
    ).toBe(2);

    const asClient = await denied(
      `select count(*)::int as n from public.app_store`,
    );
    expect(asClient, 'authenticated leyó app_store').not.toBeNull();
    expect(asClient?.code).toBe('42501');
    expect(asClient?.message).toContain(
      'permission denied for table app_store',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('lo que un cliente NO puede escribir', () => {
  /**
   * Los cinco rechazos del camino de escritura, con la CAPA de cada uno.
   *
   * La distinción del encabezado, aplicada: los siete casos de acá son de la
   * POLICY —`new row violates row-level security policy`— y no del ACL, porque
   * el privilegio INSERT existe. Asertar el texto del mensaje y no solo el
   * código es lo que separa las dos capas, y lo que hace que este test no
   * pueda pasar en una base donde el INSERT se hubiera revocado.
   *
   * Los dos primeros son los que importan más, y están primero: son la razón
   * por la que el cliente no puede contaminar la bandeja de contactos ni
   * auto-atenderse. El resto sostiene el mismo contrato.
   */
  test('cada término del WITH CHECK rechaza su valor, y el rechazo es de la POLICY', async () => {
    const cases: readonly [string, string, string][] = [
      [
        'la bandeja de contactos',
        insertBug({ namespace: 'contact' }),
        'escribió en el namespace de la bandeja de contactos',
      ],
      [
        'un namespace inventado',
        insertBug({ namespace: 'reportes_bug' }),
        'escribió en un namespace que no existe',
      ],
      [
        'state = CORREGIDO',
        insertBug({ state: 'CORREGIDO' }),
        'se auto-asignó un reporte ya corregido',
      ],
      [
        'delivery_status = PROCESADO',
        insertBug({ delivery_status: 'PROCESADO' }),
        'fingió que el aviso ya se entregó',
      ],
      [
        'delivery_status = ERROR',
        insertBug({ delivery_status: 'ERROR' }),
        'fingió que el aviso falló en la entrega',
      ],
      [
        'origin = web',
        insertBug({ origin: 'web' }),
        'declaró un canal que la policy no admite',
      ],
      [
        'deleted_at informado',
        insertBug({ deletedAt: 'now()' }),
        'nació con el reporte ya borrado',
      ],
    ];

    await probe(async () => {
      // Una fila buena de esta misma sonda, escrita de verdad, para que el
      // control del final distinga "los siete rechazos no dejaron nada" de "no
      // se estaba contando nada". `as()` commitea, así que esta fila existe
      // cuando empieza el bucle.
      const key = `${PROBE_KEY_PREFIX}control`;
      await as(ctx.sql, 'authenticated', REPORTER, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, key, value, delivery_status, state, origin)
           values ('bug_report', '${key}', '{"summary":"control"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios')`,
        ),
      );

      for (const [label, sql, consecuencia] of cases) {
        const denial = await denied(sql);

        expect(denial, `un cliente autenticado ${consecuencia}`).not.toBeNull();
        expect(denial?.code, `el rechazo de ${label} no fue 42501`).toBe(
          '42501',
        );
        expect(
          denial?.message,
          `el rechazo de ${label} vino del ACL y no de la policy. Eso ` +
            'significa que el privilegio INSERT se revocó, y entonces este ' +
            'archivo ya no está midiendo el WITH CHECK.',
        ).toContain('row-level security policy');
      }

      // Y el control: ninguna de las siete cosas quedó en la tabla, y la fila
      // buena de esta misma sonda sigue ahí. El control importa porque
      // `deniedAs` tira la transacción cuando la sentencia falla, así que un
      // rechazo no debería dejar rastro — y si lo dejara, el rechazo era falso.
      const rows = await ctx.sql.unsafe<{ n: number; estado: string }[]>(
        `select (select count(*)::int from public.app_store
                   where key like '${PROBE_KEY_PREFIX}%') as n,
                (select coalesce(string_agg(state, ','), '(none)')
                   from public.app_store) as estado`,
      );
      expect(
        plainRows(rows)[0]?.n,
        'un rechazo del WITH CHECK dejó una fila. La transacción aborta, así ' +
          'que esto solo puede significar que una sentencia "denegada" entró. El ' +
          '1 que se espera es la fila de control, escrita justo antes del bucle.',
      ).toBe(1);
      expect(plainRows(rows)[0]?.estado).toBe('ABIERTO,ABIERTO');
    });
  });

  /**
   * `anon` no inserta, y tampoco con un `sub` en el claim.
   *
   * La segunda mitad importa porque la policy es `TO authenticated` y no `TO
   * public`, y este repo ya tiene el contraejemplo de las policies escritas `TO
   * public`: en `reviews` el predicado se satisface con un `sub`, y eso hace que
   * `anon` escriba filas atribuidas a un usuario
   * (`profiles-reviews.rls.db.spec.ts` lo mide). Acá la forma es la cerrada: el
   * ROL decide, no el claim. Un `anon` con la anon key del bundle móvil tiene
   * `auth.uid()` en NULL, y uno con un `sub` en el claim sigue siendo `anon`.
   */
  test('anon no inserta un reporte, ni siquiera con un sub en el claim', async () => {
    const sinClaim = await denied(insertBug(), 'anon', null);
    expect(
      sinClaim,
      'anon insertó un reporte sin claim. La anon key viaja dentro del bundle ' +
        'móvil, así que esto es escritura de fila sin sesión.',
    ).not.toBeNull();
    expect(sinClaim?.code).toBe('42501');
    expect(sinClaim?.message).toContain('row-level security policy');

    const conClaim = await denied(insertBug(), 'anon', REPORTER);
    expect(
      conClaim,
      'anon con un sub en el claim insertó un reporte. La policy es TO ' +
        'authenticated, así que el claim no debería alcanzar.',
    ).not.toBeNull();
    expect(conClaim?.code).toBe('42501');
    expect(conClaim?.message).toContain('row-level security policy');

    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(plainRows(rows)[0]?.n).toBe(2);
  });

  /**
   * `state` y `origin` no admiten NULL, y la razón es de tres valores.
   *
   * Ninguna de las dos columnas tiene default, así que omitirlas deja NULL, y
   * `state = NULL` evalúa NULL y `NULL = ANY(array)` también. Un `WITH CHECK`
   * que evalúa NULL se trata como no satisfecho, así que el `INSERT` se rechaza
   * entero. El mensaje es de policy y no algo legible, que es exactamente por
   * qué el repositorio del móvil manda `state` y `origin` siempre y no los deja
   * a la suerte: sin ellos no hay fila, y el error que ve la persona no dice qué
   * campo falta.
   *
   * Y la comparación del final es el punto: omitir un campo y mandar un valor
   * inválido producen el MISMO error. Un usuario que no rellene el campo y uno
   * que mande `web` reciben el mismo `42501` sin que ninguno sepa qué pasó.
   */
  test('omitir state u origin se rechaza, y con el mismo error que un valor inválido', async () => {
    const sinState = await denied(
      `insert into public.app_store (namespace, value, delivery_status, origin, key)
       values ('bug_report', '{"summary":"x"}'::jsonb, 'PENDIENTE', 'ios', '${nextProbeKey()}')`,
    );
    expect(sinState, 'un cliente insertó sin nombrar state').not.toBeNull();
    expect(sinState?.message).toContain('row-level security policy');

    const sinOrigin = await denied(
      `insert into public.app_store (namespace, value, delivery_status, state, key)
       values ('bug_report', '{"summary":"x"}'::jsonb, 'PENDIENTE', 'ABIERTO', '${nextProbeKey()}')`,
    );
    expect(sinOrigin, 'un cliente insertó sin nombrar origin').not.toBeNull();
    expect(sinOrigin?.message).toContain('row-level security policy');

    const invalido = await denied(insertBug({ origin: 'web' }));
    expect(
      sinOrigin?.message,
      'omitir origin y mandar un origin inválido dieron errores distintos. La ' +
        'forma del rechazo es parte del contrato de este archivo.',
    ).toBe(invalido?.message);

    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(plainRows(rows)[0]?.n).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('cada término del WITH CHECK sostiene algo, no decora', () => {
  /**
   * Por qué hace falta el contrafáctual, en una frase: los siete rechazos del
   * bloque anterior producen el mismo `42501` con el mismo texto, así que la
   * aserción no puede distinguir "el término de `namespace` sostiene la bandeja
   * de contactos" de "algo más la sostiene". Quitando un término y mostrando
   * que el agujero se abre, cada uno queda demostrado por separado.
   *
   * Y lo que se abre al quitar cada uno es el agujero que el término nombra, no
   * un error genérico:
   *
   *   sin `namespace`        → una fila entra en la BANDEJA DE CONTACTOS.
   *   sin `delivery_status`  → un reporte `PROCESADO` entra, y el badge de
   *                             entrega del panel pasa a mentir.
   *   sin `state`            → un reporte `CORREGIDO` entra: el cliente se
   *                             auto-atendió.
   *   sin `origin`           → `web` entra, que es el canal que la app no
   *                             escribe.
   *   sin `deleted_at`       → un reporte ya borrado entra y el operador no lo
   *                             ve en la bandeja.
   */
  test('cada término, quitado, abre exactamente el agujero que dice tapar', async () => {
    const contact = await counterfactual(
      WITHOUT.namespace,
      insertBug({ namespace: 'contact' }),
    );
    expect(
      contact.inserted,
      'sin el término de namespace, escribir en la bandeja de contactos sigue ' +
        'siendo imposible. O el rechazo viene de otra capa, o el término no ' +
        'está donde el ledger dice que está.',
    ).toBe(true);

    const entregado = await counterfactual(
      WITHOUT.delivery_status,
      insertBug({ delivery_status: 'PROCESADO' }),
    );
    expect(
      entregado.inserted,
      'sin el término de delivery_status, un cliente puede declarar su aviso ' +
        'como entregado, y el panel lo mostraría como entregado.',
    ).toBe(true);

    const corregido = await counterfactual(
      WITHOUT.state,
      insertBug({ state: 'CORREGIDO' }),
    );
    expect(
      corregido.inserted,
      'sin el término de state, un cliente puede auto-asignarse CORREGIDO. Es ' +
        'la razón por la que ese término existe.',
    ).toBe(true);

    const web = await counterfactual(
      WITHOUT.origin,
      insertBug({ origin: 'web' }),
    );
    expect(
      web.inserted,
      'sin el término de origin, `web` entra. La app mapea navegador a `pwa` a ' +
        'propósito, así que una fila `web` solo puede haberla escrito alguien ' +
        'que no es la app.',
    ).toBe(true);

    const borrado = await counterfactual(
      WITHOUT.deleted_at,
      insertBug({ deletedAt: 'now()' }),
    );
    expect(
      borrado.inserted,
      'sin el término de deleted_at, un cliente puede mandar un reporte ya ' +
        'borrado, que el operador no vería en la bandeja.',
    ).toBe(true);
  });

  /**
   * El control del contrafáctual.
   *
   * Sin esta aserción, un contrafáctual que abrió los cinco agujeros porque la
   * policy estaba rota —o porque `set local role` no se aplicó y la sonda corrió
   * como el dueño— se vería idéntico a uno que aísla cada término. La forma del
   * rechazo importa tanto como la del éxito: `inserted: true` para una fila que
   * no debía existir y `42501` para una que sí, leídos por el mismo camino.
   *
   * Y el inventario de policies de arriba es lo que distingue "el rollback
   * deshizo la debilitada" de "el rollback no pasó y ahora hay una policy
   * permisiva flotando en esta base". Si el rollback fallara, este archivo
   * estaría midiendo una base que nadie corre, que es la peor forma de estar
   * verde.
   */
  test('con la policy del ledger los mismos cinco insert se rechazan, y el rollback no dejó nada', async () => {
    const policies = await ctx.sql.unsafe<
      { policyname: string; cmd: string }[]
    >(
      `select policyname, cmd from pg_policies
        where schemaname = 'public' and tablename = 'app_store'`,
    );
    expect(
      plainRows(policies),
      'la policy del ledger no volvió a su lugar. El contrafáctual se ' +
        'se aplicó en serio y todo lo que se mide después de esto está midiendo ' +
        'una policy debilitada que nadie corre.',
    ).toEqual([{ policyname: 'Users submit bug reports', cmd: 'INSERT' }]);

    for (const sql of [
      insertBug({ namespace: 'contact' }),
      insertBug({ delivery_status: 'PROCESADO' }),
      insertBug({ state: 'CORREGIDO' }),
      insertBug({ origin: 'web' }),
      insertBug({ deletedAt: 'now()' }),
    ]) {
      expect(
        await denied(sql),
        `un cliente pudo escribir algo que la policy del ledger prohíbe: ${sql}`,
      ).not.toBeNull();
    }

    /**
     * El control del CONTROL, y es el que hace que el contrafáctual sea una
     * medición y no un espejo.
     *
     * `counterfactual()` reemplaza la policy por otra y por lo tanto podría
     * estar,true` — insertando siempre y "midiendo" un espejo. Se comprueba
     * pasándole el `WITH CHECK` COMPLETO, que es el del ledger: con él, las
     * cinco escrituras prohibidas tienen que seguir rechazándose. Si se
     * rechazan, el `inserted: true` del test anterior viene de que el término
     * faltante era el que las frenaba, y no de que la sonda corriera como el
     * dueño.
     */
    for (const sql of [
      insertBug({ namespace: 'contact' }),
      insertBug({ delivery_status: 'PROCESADO' }),
      insertBug({ state: 'CORREGIDO' }),
      insertBug({ origin: 'web' }),
      insertBug({ deletedAt: 'now()' }),
    ]) {
      const control = await counterfactual(FULL_CHECK, sql);
      expect(
        control.inserted,
        'con el WITH CHECK completo del ledger, una escritura prohibida entró ' +
          'dentro de una sonda. `counterfactual` no está midiendo la policy: la ' +
          'sonda corre sin la policy que dice medir, y todos sus `inserted: ' +
          'true` son verdad.',
      ).toBe(false);
      expect(control.code).toBe('42501');
    }

    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(plainRows(rows)[0]?.n, 'un contrafáctual dejó una fila').toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('el camino de allow, y qué escribe el cliente de verdad', () => {
  /**
   * El insert bueno entra, y entra con lo que el ledger exige.
   *
   * `as()` y no `deniedAs()`: llegar a las aserciones ES la prueba. Si el
   * `INSERT` se rechazara, la excepción sale del test con el mensaje del
   * servidor y no hay nada que leer acá.
   *
   * El cuerpo se relee como el dueño y se asserta columna por columna, porque
   * "entró una fila" y "entró una fila con los valores correctos" son
   * afirmaciones distintas. La segunda es la que dice que el cliente no elige su
   * canal.
   */
  test('authenticated sí inserta un reporte válido, y la fila sale como el ledger la describe', async () => {
    const key = `${PROBE_KEY_PREFIX}happy`;
    await probe(async () => {
      await as(ctx.sql, 'authenticated', REPORTER, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, value, delivery_status, state, origin, key)
           values ('bug_report',
                   '{"summary":"no abre la lista de ofertas","description":"al abrir Offers queda cargando","images":[],"at":"2026-09-30T20:00:00.000Z"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios', '${key}')`,
        ),
      );

      const rows = await ctx.sql.unsafe<
        {
          id: string;
          namespace: string;
          delivery_status: string;
          state: string;
          origin: string;
          deleted_at: Date | null;
          value: Record<string, unknown>;
        }[]
      >(`select id::text, namespace, delivery_status::text, state, origin::text,
                  deleted_at, value
             from public.app_store
            where key = '${key}'`);

      const row = plainRows(rows)[0];
      expect(
        row,
        'el INSERT de un reporte válido no dejó fila. O la policy lo rechazó, o ' +
          'el DELETE del cleanup corrió antes de la lectura.',
      ).toBeDefined();
      expect(typeof row?.id).toBe('string');
      expect(row?.namespace).toBe('bug_report');
      expect(row?.delivery_status).toBe('PENDIENTE');
      expect(row?.state).toBe('ABIERTO');
      expect(row?.origin).toBe('ios');
      expect(row?.deleted_at).toBeNull();
      // El sello, leído desde la fila: lo había puesto el trigger, no el
      // cliente. Se asserta acá para que el camino de allow diga también QUIÉN
      // escribió, y no solo qué escribió.
      expect(row?.value.reporter_id).toBe(REPORTER);
    });
  });

  /**
   * Los tres orígenes que la policy admite, y solo esos tres.
   *
   * El happy path de arriba prueba `ios`. Esta tabla prueba el resto del
   * conjunto: que `android` y `pwa` también entran —si no, la app en Android y
   * en el navegador no podría reportar, y sería un bug de la policy y no una
   * rareza— y que `web` no, que ya está medido arriba y se repite porque el
   * conjunto completo es una sola afirmación.
   *
   * Y el enum de Postgres tiene cuatro valores, incluido `web`. Que el enum lo
   * admita y la policy no es deliberado —`web` queda reservado para que la
   * landing quepa después sin otra migración— y por eso el conjunto se asserta
   * contra la policy y no contra el enum.
   */
  test('ios, android y pwa entran; web no, aunque el enum lo admita', async () => {
    /**
     * Todo el bucle dentro de `probe()`, y el conteo FUERA.
     *
     * La primera versión de este test limpiaba a mano, con un `delete` después
     * del último `expect` y sin `finally`. Eso convierte cualquier aserción
     * intermedia que falle en una fuga: las tres filas que entraron quedan en la
     * base, el `delete` nunca corre, y el `expect(n).toBe(2)` de abajo falla
     * con un mensaje sobre filas que el lector no relaciona con el `expect` que
     * realmente falló. Es el peor orden posible —el síntoma se parece a otro
     * test— y `probe()` lo resuelve porque su borrado va en un `finally`.
     *
     * El conteo queda después de `probe()` a propósito: si estuviera adentro,
     * contaría la tabla ya limpiada y no probaría nada.
     */
    await probe(async () => {
      const admitidos: Record<string, boolean> = {};
      for (const origin of ['ios', 'android', 'pwa', 'web']) {
        admitidos[origin] = (await denied(insertBug({ origin }))) === null;
      }
      expect(admitidos).toEqual({
        ios: true,
        android: true,
        pwa: true,
        web: false,
      });

      const enumValues = await ctx.sql.unsafe<{ enumlabel: string }[]>(
        `select e.enumlabel
           from pg_enum e
           join pg_type t on t.oid = e.enumtypid
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' and t.typname = 'entry_origin'
          order by e.enumsortorder`,
      );
      expect(plainRows(enumValues).map((e) => e.enumlabel)).toEqual([
        'ios',
        'android',
        'pwa',
        'web',
      ]);

      // `deniedAs` devuelve `null` en el camino de éxito Y COMMITEA, así que las
      // tres filas que entraron están en la base mientras este test corre. Las
      // borra el `finally` de `probe()`, no esta línea.
      const durante = await ctx.sql.unsafe<{ n: number }[]>(
        `select count(*)::int as n from public.app_store
          where key like '${PROBE_KEY_PREFIX}%'`,
      );
      expect(
        plainRows(durante)[0]?.n,
        'los tres orígenes admitidos no dejaron su fila, o el `deniedAs` está ' +
          'midiendo el camino equivocado.',
      ).toBe(3);
    });

    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(
      plainRows(rows)[0]?.n,
      'las sondas de origen dejaron filas. El `finally` de `probe()` corre antes ' +
        'de que una aserción lance, así que si quedan filas el borrado falló y no ' +
        'fue una aserción la que cortó el test.',
    ).toBe(2);
  });

  /**
   * `delivery_status` se puede omitir y entra igual, porque el default de la
   * columna es `PENDIENTE`.
   *
   * No contradice al `WITH CHECK`: lo cumple. Un cliente que no nombre la
   * columna no se está saliendo de la regla — está llegando al mismo valor por
   * el otro camino. Lo que NO puede es nombrar `PROCESADO`, y eso está medido
   * arriba.
   *
   * El término sigue siendo load-bearing y hay un contrafáctual que lo
   * demuestra. Esta aserción está para que nadie lo lea como decorativo porque
   * "el default ya lo pone".
   */
  test('delivery_status se puede omitir y la fila sale PENDIENTE, por el default de la columna', async () => {
    const key = `${PROBE_KEY_PREFIX}sin-delivery`;
    await probe(async () => {
      await as(ctx.sql, 'authenticated', REPORTER, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, value, state, origin, key)
           values ('bug_report', '{"summary":"sin delivery_status"}'::jsonb,
                   'ABIERTO', 'ios', '${key}')`,
        ),
      );

      const rows = await ctx.sql.unsafe<{ delivery_status: string }[]>(
        `select delivery_status::text from public.app_store where key = '${key}'`,
      );
      expect(plainRows(rows)[0]?.delivery_status).toBe('PENDIENTE');
    });
  });

  /**
   * El cliente escribe MÁS columnas de las que la policy mira, y eso es lo que
   * hay que saber.
   *
   * `key` no aparece en el `WITH CHECK` y el cliente puede poner lo que quiera
   * en él. Tampoco hay índice único sobre `key`: dos clientes —o el mismo dos
   * veces— pueden escribir el mismo `key` y conviven. Es inocuo porque el API
   * nunca lee `key` para este buzón: el mapper es una lista blanca y el filtro
   * del listado es `namespace`. Pero es cierto que el perímetro de la policy son
   * cinco columnas de diez, y por eso el inventario del primer bloque trae la
   * lista completa al lado.
   *
   * Y lo mismo con `value`: la policy no lo mira para nada, así que el contenido
   * del reporte lo decide el cliente entero. Eso lo estrecha
   * `BugReportValueSchema` del lado de la lectura y no la base, y una fila cuyo
   * `summary` no matchea sale listada con `readable: false` en vez de romper el
   * buzón. La fila ILEGIBLE es el peor resultado posible y también el que el
   * diseño eligió a propósito.
   */
  test('el cliente escribe key y value libremente: la policy mira cinco columnas de diez', async () => {
    const key = `${PROBE_KEY_PREFIX}key-libre`;
    await probe(async () => {
      await as(ctx.sql, 'authenticated', REPORTER, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, key, value, delivery_status, state, origin)
           values ('bug_report', '${key}',
                   '{"summary":"no abre la lista de ofertas","reporter_id":"${STRANGER}",
                     "device_model":"iPhone 15","app_version":"3.2.0"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios')`,
        ),
      );

      const rows = await ctx.sql.unsafe<
        { key: string | null; value: Record<string, unknown> }[]
      >(`select key, value from public.app_store where key = '${key}'`);

      const row = plainRows(rows)[0];
      expect(row?.key).toBe(key);
      // Las claves que el cliente no controla, quedan. La que sí controla, no:
      // eso es el trigger, y tiene su propio bloque.
      expect(row?.value.device_model).toBe('iPhone 15');
      expect(row?.value.app_version).toBe('3.2.0');
      expect(row?.value.reporter_id).toBe(REPORTER);
      expect(row?.value.reporter_id).not.toBe(STRANGER);
    });
  });

  /**
   * El `INSERT` sin `RETURNING` entra; con `RETURNING` no.
   *
   * No es un detalle de la policy: `RETURNING` necesita SELECT sobre la tabla, y
   * el SELECT fue revocado en esta misma migración. O sea que un cliente que
   * escribiera `insert(...).select()` —que es lo que hace `supabase-js` cuando
   * se le pide la fila de vuelta— se llevaría un `42501` de un insert que en
   * realidad es válido. El repositorio del móvil no lo pide, así que no hay
   * bug; esto está acá para que agregar un `.select()` sea un fallo de test y no
   * un ticket.
   *
   * Y el efecto es honesto: con `RETURNING` no entra NADA. El error aborta la
   * sentencia, así que no queda una fila huérfana.
   */
  test('el insert sin RETURNING entra y con RETURNING se rechaza, sin dejar fila', async () => {
    const denial = await denied(`${insertBug()} returning id`);
    expect(
      denial,
      'un INSERT … RETURNING entró. Con el SELECT revocado no debería, y si ' +
        'alguna vez entra es porque el revoke se perdió.',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(denial?.message).toContain('permission denied for table app_store');

    const rows = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public.app_store`,
    );
    expect(
      plainRows(rows)[0]?.n,
      'el INSERT rechazado por RETURNING dejó una fila. Un error aborta la ' +
        'sentencia, así que esto solo puede significar que el rechazo no pasó.',
    ).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('UPDATE y DELETE no son caminos, y el SELECT tampoco', () => {
  /**
   * Los cuatro rechazos de lectura y borrado, con la capa nombrada.
   *
   * `permission denied for table app_store` en los cuatro, y el motivo cambia
   * entre ellos aunque el texto no:
   *
   *   SELECT         → no hay privilegio. `revoke select` de esta misma
   *                    migración.
   *   UPDATE … WHERE → hay UPDATE, pero Postgres necesita SELECT sobre las
   *                    columnas del `WHERE`.
   *   DELETE … WHERE → igual que el UPDATE.
   *   TRUNCATE       → el revoke de `20260928184943`, y es un privilegio que
   *                    RLS no puede gobernar: no hay policy que lo filtre.
   *
   * Que el UPDATE y el DELETE con `WHERE` se rechacen NO es la policy
   * haciéndolos: es el `revoke select` volverlos ruidosos. Por eso el caso sin
   * `WHERE`, abajo, importa más que este.
   */
  test('SELECT, UPDATE, DELETE y TRUNCATE se rechazan para los dos roles cliente', async () => {
    /**
     * Las cuatro sentencias, con `;` al final.
     *
     * El `;` no hace nada acá y por eso está: cada una viaja en su propia
     * llamada a `tx.unsafe`, así que el driver no tiene nada que partir. Pero
     * sin él estas cuatro son las únicas del archivo que no son SQL válido por
     * sí solas, y un string de test sin `;` se copia mal —a un `unsafe` con
     * varias sentencias, a un archivo `.sql`, a un `psql`— y el error que
     * aparece ahí no tiene nada que ver con RLS.
     */
    const statements: readonly [string, string][] = [
      ['SELECT', `select id from public.app_store;`],
      [
        'UPDATE',
        `update public.app_store set state = 'CORREGIDO' where namespace = 'bug_report';`,
      ],
      [
        'DELETE',
        `delete from public.app_store where namespace = 'bug_report';`,
      ],
      ['TRUNCATE', `truncate public.app_store;`],
    ];

    for (const role of ['anon', 'authenticated'] as const) {
      for (const [label, sql] of statements) {
        const denial = await denied(
          sql,
          role,
          role === 'anon' ? null : REPORTER,
        );
        expect(
          denial,
          `${role} pudo hacer ${label} sobre app_store`,
        ).not.toBeNull();
        expect(denial?.code, `${role} hizo ${label} sin error`).toBe('42501');
        expect(
          denial?.message,
          `el ${label} de ${role} no nombró la tabla`,
        ).toContain('permission denied for table app_store');
      }
    }

    // Nada cambió: las dos filas siguen en pie y ninguna está corregida. Un
    // rechazo que hubiera escrito algo sería un rechazo falso.
    const rows = await ctx.sql.unsafe<{ n: number; corregidos: number }[]>(
      `select (select count(*)::int from public.app_store) as n,
              (select count(*)::int from public.app_store where state = 'CORREGIDO') as corregidos`,
    );
    expect(plainRows(rows)).toEqual([{ n: 2, corregidos: 0 }]);
  });

  /**
   * El `UPDATE` y el `DELETE` sin `WHERE` son los que dicen la verdad: corren
   * y no tocan nada.
   *
   * Es la forma silenciosa, y es la que importa. El rechazo de arriba parece
   * "no puede UPDATE", pero viene del `revoke select`; si mañana alguien devuelve
   * el SELECT por comodidad, ese rechazo se convierte en un `UPDATE` que ejecuta
   * y afecta cero filas, sin error y sin cambio. El RESULTADO —que no puede
   * auto-atenderse— es el mismo, así que la conclusión no cambia, pero una
   * persona depurando un incidente los leería como dos cosas distintas.
   *
   * Y para que el cero signifique "RLS no dejó pasar ninguna fila" y no "no había
   * filas", el estado se cuenta y se lee antes y después.
   *
   * `deniedAs` y no `as()`, acá a propósito: el resultado interesante es que NO
   * hay error, y `deniedAs` devuelve `null` exactamente cuando la sentencia
   * corrió. Es el uso legible de la función; el otro está en todos lados.
   */
  test('UPDATE y DELETE sin WHERE corren, no tocan nada, y no hay error', async () => {
    const snapshot = async () => {
      const rows = await ctx.sql.unsafe<{ n: number; estados: string }[]>(
        `select (select count(*)::int from public.app_store) as n,
                (select coalesce(string_agg(state, ','), '(none)')
                   from public.app_store) as estados`,
      );
      return plainRows(rows)[0];
    };

    const antes = await snapshot();
    expect(antes?.n, 'las dos filas sembradas no están').toBe(2);

    const update = await denied(
      `update public.app_store set state = 'CORREGIDO'`,
    );
    expect(
      update,
      'el UPDATE sin WHERE fue rechazado. La forma silenciosa que este test ' +
        'mide desapareció: ahora el rechazo viene de una capa que puede ' +
        'cambiar, y cuando cambie va a parecer que el cliente sí puede ' +
        'escribir.',
    ).toBeNull();

    const remove = await denied(`delete from public.app_store`);
    expect(remove, 'el DELETE sin WHERE fue rechazado').toBeNull();

    expect(
      await snapshot(),
      'un UPDATE o un DELETE sin WHERE alcanzó a tocar la tabla. Las filas ' +
        'siguen en pie y sin corregir.',
    ).toEqual(antes);
  });

  /**
   * Y el contrafáctual que demuestra que el cero es RLS y no una fila inalcanzable.
   *
   * Con una policy de UPDATE permisiva y el SELECT devuelto, el mismo `UPDATE`
   * SÍ cambia el `state`. Lo que se mide es que la fila era alcanzable todo el
   * tiempo y que lo único que la frenaba era la ausencia de policy — que es
   * exactamente lo que este archivo quiere demostrar y lo que un `expect(rows).
   * toHaveLength(0)` no puede.
   *
   * Y al final, que la fila volvió a `ABIERTO`: el contrafáctual no
   * contaminó las mediciones de alrededor.
   */
  test('con una policy de UPDATE la fila sí se toca: el cero anterior era RLS', async () => {
    let dentro: string | undefined;
    let estado: string | null = null;
    try {
      await ctx.sql.begin(async (tx) => {
        await tx.unsafe(`grant select on public.app_store to authenticated`);
        await tx.unsafe(
          `create policy "harness_probe" on public.app_store
             for update to authenticated using (true) with check (true)`,
        );
        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(
          `select set_config('request.jwt.claim.sub', '${REPORTER}', true)`,
        );
        try {
          await tx.unsafe(`update public.app_store set state = 'CORREGIDO'`);
          dentro = 'ok';
        } catch (error) {
          dentro = String((error as { code?: string }).code);
          throw error;
        }
        // `reset role` para releer como el dueño: leerla por una sesión cliente
        // sería leerla a través de la policy que se acaba de crear.
        await tx.unsafe(`reset role`);
        const rows = await tx.unsafe<{ state: string }[]>(
          `select state from public.app_store where id = '${BUG_ID}'`,
        );
        estado = plainRows(rows)[0]?.state ?? null;
        throw new Rollback('harness_probe');
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    expect(
      dentro,
      'con una policy de UPDATE permisiva el update sigue sin correr. Entonces ' +
        'el cero del test anterior no lo producía RLS.',
    ).toBe('ok');
    expect(
      estado,
      'con una policy de UPDATE permisiva, state no pasó a CORREGIDO. La fila ' +
        'era inalcanzable por otra razón y este archivo está midiendo una fila ' +
        'que no existe.',
    ).toBe('CORREGIDO');

    const rows = await ctx.sql.unsafe<{ state: string }[]>(
      `select state from public.app_store where id = '${BUG_ID}'`,
    );
    expect(
      plainRows(rows)[0]?.state,
      'la fila no volvió a ABIERTO. El contrafáctual se comiteó y las ' +
        'mediciones de alrededor están midiendo esto.',
    ).toBe('ABIERTO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('la autoría la sella el trigger, no la policy', () => {
  /**
   * El `WITH CHECK` no menciona `value` ni `reporter_id`.
   *
   * Es la afirmación que separa las dos capas del diseño. La policy decide QUÉ
   * SE PUEDE ESCRIBIR —en qué namespace, con qué estado de entrega, con qué
   * estado de triaje, desde qué canal y sin borrado previo— y el trigger decide
   * QUIÉN LO ESCRIBIÓ. Si la policy sellara la autoría, el sello estaría en el
   * mismo objeto que se puede reemplazar por una policy más permisiva; no lo
   * está, y por eso ninguno de los cinco contrafáctuales sobre la policy puede
   * tocar `reporter_id`.
   *
   * Que sea BEFORE y no AFTER importa por una razón que esta base no puede
   * demostrar sobre esta tabla: correr antes significa que el `WITH CHECK` —si
   * algún día llegara a leer `value`— vería la fila ya sellada. Hoy ningún
   * término lo lee, así que el orden no tiene nada con lo que competir. La
   * propiedad observable es otra y es la que se mide en los dos tests que
   * siguen.
   *
   * `SECURITY DEFINER` con `search_path` fijo no es un requisito de esta policy
   * —el sello no depende de quién lee `value` porque `auth.uid()` es un
   * `current_setting`— pero es la forma del repo, y un trigger de fila con el
   * `search_path` abierto sería un hallazgo de otra clase.
   */
  test('el WITH CHECK no toca value ni reporter_id, y el trigger es BEFORE INSERT con WHEN namespace', async () => {
    const policies = await ctx.sql.unsafe<{ with_check: string | null }[]>(
      `select with_check from pg_policies
        where schemaname = 'public' and tablename = 'app_store'`,
    );
    const check = plainRows(policies)[0]?.with_check ?? '';
    expect(check).not.toContain('auth.uid()');
    expect(check).not.toContain('reporter_id');
    expect(check).not.toContain('value');

    const triggers = await ctx.sql.unsafe<{ def: string }[]>(
      `select pg_get_triggerdef(oid) as def
         from pg_trigger
        where tgrelid = 'public.app_store'::regclass and not tgisinternal`,
    );
    expect(plainRows(triggers).map((t) => t.def)).toEqual([
      'CREATE TRIGGER on_bug_report_stamped BEFORE INSERT ON public.app_store ' +
        "FOR EACH ROW WHEN ((new.namespace = 'bug_report'::text)) " +
        'EXECUTE FUNCTION stamp_bug_reporter()',
    ]);

    const fn = await ctx.sql.unsafe<
      { prosecdef: boolean; proconfig: string }[]
    >(
      `select prosecdef, proconfig::text as proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'stamp_bug_reporter'`,
    );
    expect(plainRows(fn)[0]).toEqual({
      prosecdef: true,
      proconfig: '{search_path=public}',
    });
  });

  /**
   * El `reporter_id` que manda el cliente se sobreescribe con `auth.uid()`.
   *
   * El mecanismo es el `||` de jsonb con el operando derecho construido por el
   * servidor, y lo que se asserta es el efecto: la fila tiene el uid de quien
   * insertó y no el que el cliente pidió. Se mandan dos valores distintos a
   * propósito, porque un test que mandara el mismo valor del cliente y del
   * servidor pasaría igual en una base donde el trigger no existiera.
   *
   * Y el resto de las claves de `value` sobrevive, que no es un detalle: el
   * trigger reemplaza `value` entero, así que sin el `||` el resumen del usuario
   * desaparecería y el panel vería un reporte sin texto.
   */
  test('el reporter_id del cliente se sobreescribe con auth.uid(), y el resto de value sobrevive', async () => {
    await probe(async () => {
      const key = `${PROBE_KEY_PREFIX}sello`;
      await as(ctx.sql, 'authenticated', REPORTER, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, key, value, delivery_status, state, origin)
           values ('bug_report', '${key}',
                   '{"summary":"no abre la lista de ofertas","description":"queda cargando",
                     "images":["${REPORTER}/report/a.png"],"reporter_id":"${STRANGER}",
                     "at":"2026-09-30T20:00:00.000Z"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios')`,
        ),
      );

      const rows = await ctx.sql.unsafe<{ value: Record<string, unknown> }[]>(
        `select value from public.app_store where key = '${key}'`,
      );

      const value = plainRows(rows)[0]?.value;
      expect(
        value?.reporter_id,
        'la fila conserva el reporter_id que mandó el cliente. El trigger lo ' +
          'sobreescribe, y si no lo hizo es que no corrió.',
      ).toBe(REPORTER);
      expect(value?.reporter_id).not.toBe(STRANGER);
      expect(value?.summary).toBe('no abre la lista de ofertas');
      expect(value?.description).toBe('queda cargando');
      expect(value?.at).toBe('2026-09-30T20:00:00.000Z');
      expect(value?.images).toEqual([`${REPORTER}/report/a.png`]);
    });
  });

  /**
   * El contrafáctual del trigger: sin él, el cliente elige quién es el
   * reportante.
   *
   * Es lo que convierte el test anterior en una afirmación sobre el TRIGGER y
   * no sobre una coincidencia. Con el trigger caído la fila guarda el
   * `reporter_id` que mandó el cliente, y el panel le atribuiría a un usuario el
   * reporte de otro. Ninguna de las cinco variantes de contrafáctual sobre la
   * policy puede producir eso, porque la policy no mira `value`.
   *
   * Y el final asserta que el trigger volvió con la transacción.
   */
  test('con el trigger caído el reporter_id forjado del cliente llega a la fila', async () => {
    let leido: unknown;
    try {
      await ctx.sql.begin(async (tx) => {
        await tx.unsafe(
          `drop trigger on_bug_report_stamped on public.app_store`,
        );
        await tx.unsafe(`set local role authenticated`);
        await tx.unsafe(
          `select set_config('request.jwt.claim.sub', '${REPORTER}', true)`,
        );
        await tx.unsafe(
          `insert into public.app_store (namespace, value, delivery_status, state, origin)
           values ('bug_report',
                   '{"summary":"no abre la lista de ofertas","reporter_id":"${STRANGER}"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios')`,
        );
        await tx.unsafe(`reset role`);
        const rows = await tx.unsafe<{ value: Record<string, unknown> }[]>(
          `select value from public.app_store
            where namespace = 'bug_report'
              and value->>'summary' = 'no abre la lista de ofertas'
            order by created_at desc limit 1`,
        );
        leido = plainRows(rows)[0]?.value?.reporter_id;
        throw new Rollback('harness_probe');
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    expect(
      leido,
      'con el trigger caído el reporter_id forjado NO llegó a la fila. Hay ' +
        'otra cosa sellando la autoría, y entonces el test del trigger no está ' +
        'probando el trigger.',
    ).toBe(STRANGER);

    const triggers = await ctx.sql.unsafe<{ tgname: string }[]>(
      `select tgname from pg_trigger
        where tgrelid = 'public.app_store'::regclass and not tgisinternal`,
    );
    expect(plainRows(triggers).map((t) => t.tgname)).toEqual([
      'on_bug_report_stamped',
    ]);
  });

  /**
   * El `WHEN` acota el trigger al namespace `bug_report`, y una fila de
   * contacto NO se sella.
   *
   * La fila de contacto sembrada lo demuestra: no nombra `reporter_id` y sigue
   * sin tenerlo, así que el trigger no corrió. Es lo correcto, porque el
   * formulario público de contacto no tiene un `auth.uid()` que sellar: su autor
   * es lo que la persona escribió en el formulario, y sobreescribirlo lo
   * perdería.
   *
   * La consecuencia de que el `WHEN` sea `namespace = 'bug_report'` es que el
   * sello NO es una defensa para el namespace de contacto: si un cliente pudiera
   * escribir ahí, el `reporter_id` sería suyo. La defensa de la bandeja de
   * contactos es el término `namespace` del `WITH CHECK`, y por eso ese término
   * tiene su propio contrafáctual en el bloque de arriba. Esa atribución es
   * exactamente lo que un lector necesita, porque `reporter_id` es el campo que
   * se usa para saber a quién avisarle.
   */
  test('el WHEN acota el trigger a bug_report, y la fila de contacto no se sella', async () => {
    const contact = await ctx.sql.unsafe<
      { id: string; state: string | null; value: Record<string, unknown> }[]
    >(
      `select id::text, state, value from public.app_store where id = '${CONTACT_ID}'`,
    );

    const row = plainRows(contact)[0];
    expect(row, 'la fila de contacto sembrada no está').toBeDefined();
    expect(
      row?.value.reporter_id,
      'la fila de contacto trae reporter_id. El trigger corre solo para ' +
        "namespace = 'bug_report', así que un sello acá significa que el WHEN " +
        'se amplió.',
    ).toBeUndefined();
    expect(
      row?.state,
      'el mensaje de contacto tiene state = ABIERTO. Comparte la columna con ' +
        'los reportes pero no el vocabulario del eje de triaje.',
    ).toBeNull();
  });

  /**
   * El sello es NULL cuando la sesión no tiene `sub`, y eso es una propiedad
   * medida, no una hipótesis.
   *
   * `jsonb_build_object('reporter_id', auth.uid()::text)` con `auth.uid()` en
   * NULL produce `{"reporter_id": null}`, no una ausencia de clave. Una sesión
   * con `role = authenticated` y sin claim escribe entonces una fila SIN
   * AUTOR —que no es una atribución falsa, es una fila sin dueño— y el detalle
   * del panel la muestra con `reporter_id: null`.
   *
   * Se mide porque es el borde de la garantía que el resto del archivo da por
   * buena, y porque `BugReportValueSchema` declara `reporter_id` como
   * `z.string().nullish()` justamente por esto: si fuera requerido, esta fila
   * volvería ilegible el buzón entero, y ese es el peor resultado posible.
   *
   * En producción esto no es alcanzable desde el bundle móvil: PostgREST asigna
   * `role = authenticated` a partir de un JWT verificado, y un JWT verificado
   * trae `sub`. Es alcanzable desde un script con el service role que se haga
   * el `set role` a mano, que es exactamente lo que hace `as()` acá. La forma
   * del código es lo que se asserta; quién puede llegar a ella no se afirma.
   */
  test('sin sub en el claim el sello queda null y la fila se escribe igual', async () => {
    await probe(async () => {
      const key = `${PROBE_KEY_PREFIX}sin-claim`;
      // `deniedAs` con `null`: un `null` acá es el resultado interesante — la
      // sesión pudo insertar — y además COMMITEA, así que la fila queda y el
      // `probe` la borra.
      const denial = await deniedAs(ctx.sql, 'authenticated', null, (tx) =>
        tx.unsafe(
          `insert into public.app_store (namespace, key, value, delivery_status, state, origin)
           values ('bug_report', '${key}', '{"summary":"sin claim"}'::jsonb,
                   'PENDIENTE', 'ABIERTO', 'ios')`,
        ),
      );
      expect(
        denial,
        'una sesión authenticated sin sub no pudo insertar. Si algún día no ' +
          'puede es porque algo cambió, y este es el lugar donde se ve.',
      ).toBeNull();

      const rows = await ctx.sql.unsafe<{ value: Record<string, unknown> }[]>(
        `select value from public.app_store where key = '${key}'`,
      );
      const value = plainRows(rows)[0]?.value;
      expect(
        value,
        'la fila sin claim no existe. deniedAs devuelve null en el camino de ' +
          'éxito Y commitea, así que si no está es que el insert no entró.',
      ).toBeDefined();
      // La clave EXISTE con valor null, que es distinto de no existir: por eso
      // el mapper devuelve `reporter_id: null` y no un `undefined` que el
      // schema leería distinto.
      expect(value).toHaveProperty('reporter_id');
      expect(value?.reporter_id).toBeNull();
    });
  });

  /**
   * La función del trigger no se puede llamar a mano, aunque tenga EXECUTE.
   *
   * `has_function_privilege('anon', 'public.stamp_bug_reporter()', 'execute')` es
   * `true`, porque el ACL por defecto de Postgres da EXECUTE a PUBLIC sobre las
   * funciones. No importa: una función de trigger no se puede invocar como una
   * función común, y Postgres contesta `0A000 trigger functions can only be
   * called as triggers`.
   *
   * Se asserta porque un `SECURITY DEFINER` ejecutable por `anon` es la forma
   * exacta de una escalada, y en este caso la forma no existe. Que el privilegio
   * exista sin que la función sea invocable es el tipo de detalle que se lee mal
   * en una revisión: mejor que el test lo diga.
   */
  test('la función del trigger tiene EXECUTE para todos y aun así no es invocable', async () => {
    const exec = await ctx.sql.unsafe<{ anon: boolean; auth: boolean }[]>(
      `select has_function_privilege('anon', 'public.stamp_bug_reporter()', 'execute') as anon,
              has_function_privilege('authenticated', 'public.stamp_bug_reporter()', 'execute') as auth`,
    );
    expect(
      plainRows(exec)[0],
      'los privilegios de ejecución sobre stamp_bug_reporter cambiaron. Si ' +
        'algún rol pierde EXECUTE no pasa nada — una función de trigger se ' +
        'dispara por el evento, no por una llamada —, pero si ALGUN rol lo gana ' +
        'y sigue sin ser invocable, este archivo tiene que decirlo.',
    ).toEqual({ anon: true, auth: true });

    for (const [role, userId] of [
      ['anon', null],
      ['authenticated', REPORTER],
    ] as const) {
      const denial = await deniedAs(ctx.sql, role, userId, (tx) =>
        tx.unsafe(`select public.stamp_bug_reporter()`),
      );
      expect(
        denial,
        `${role} pudo llamar la función del trigger a mano. Es SECURITY ` +
          'DEFINER, y con EXECUTE en la mano sería una escalada.',
      ).not.toBeNull();
      expect(denial?.code).toBe('0A000');
      expect(denial?.message).toContain(
        'trigger functions can only be called as triggers',
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('las capturas: bucket privado y carpeta con el prefijo del uid', () => {
  /**
   * El bucket y las dos policies, desde el catálogo.
   *
   * `public = false` es la diferencia entre "una captura con pedidos,
   * direcciones y teléfonos accesible solo con la URL" y lo que hay acá. El API
   * firma URLs de cinco minutos en vez de publicar rutas, y eso solo funciona si
   * el bucket es privado.
   *
   * El `file_size_limit` de 5 MB y los tres MIME types son la regla de escritura
   * del lado de Storage. El móvil además valida los bytes antes de subir, y son
   * dos capas que miden cosas distintas: esta el tamaño declarado del objeto, el
   * móvil el contenido.
   *
   * Y la forma de las policies es la del repo —la de
   * `20260925155445`— con el `owner` Y el folder: el `owner` solo ya no basta,
   * porque el folder es lo que separa los reportes de una misma persona, y el
   * `owner` solo lo que evita que alguien escriba en la carpeta de otra. Ningún
   * término es decorativo y por eso el texto se asserta completo.
   *
   * No hay policy de UPDATE ni de DELETE sobre este bucket. Un reporte con su
   * evidencia es de solo lectura para el cliente: puede adjuntar capturas
   * nuevas y mirar las suyas, y no puede borrar ni reemplazar las que ya subió.
   */
  test('el bucket bug_report_images es privado, con tope de 5 MB, y las policies son de INSERT y SELECT', async () => {
    const bucket = await ctx.sql.unsafe<
      {
        id: string;
        public: boolean;
        file_size_limit: string;
        allowed_mime_types: string[];
      }[]
    >(
      `select id, public, file_size_limit::text, allowed_mime_types
         from storage.buckets where id = 'bug_report_images'`,
    );

    expect(plainRows(bucket)).toEqual([
      {
        id: 'bug_report_images',
        public: false,
        file_size_limit: '5242880',
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
      },
    ]);

    const policies = await ctx.sql.unsafe<
      {
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >(`select policyname, cmd, roles, qual, with_check
         from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'Reporters%'
        order by policyname`);

    expect(plainRows(policies)).toEqual([
      {
        policyname: 'Reporters attach their own screenshots',
        cmd: 'INSERT',
        roles: ['authenticated'],
        qual: null,
        with_check:
          `((bucket_id = 'bug_report_images'::text) AND ` +
          `(owner = ( SELECT auth.uid() AS uid)) AND ` +
          `((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))`,
      },
      {
        policyname: 'Reporters read their own screenshots',
        cmd: 'SELECT',
        roles: ['authenticated'],
        qual:
          `((bucket_id = 'bug_report_images'::text) AND ` +
          `(owner = ( SELECT auth.uid() AS uid)) AND ` +
          `((storage.foldername(name))[1] = ( SELECT (auth.uid())::text AS uid)))`,
        with_check: null,
      },
    ]);

    const comandos = await ctx.sql.unsafe<{ cmd: string }[]>(
      `select cmd from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname like 'Reporters%'
        order by cmd`,
    );
    expect(plainRows(comandos).map((c) => c.cmd)).toEqual(['INSERT', 'SELECT']);
  });

  /**
   * LA BRECHA DEL HARNESS, medida y anotada.
   *
   * Las dos policies de arriba no son ejecutables desde una sesión cliente en
   * esta base: `authenticated` no tiene USAGE sobre el schema `storage` ni
   * privilegio alguno sobre `storage.objects`, y la tabla tiene RLS
   * desactivado porque el harness la declara como stub. Supabase real otorga
   * las tres cosas.
   *
   * No se arregla acá. `PLATFORM_GRANTS_AFTER_REPLAY` en
   * `test/supabase-platform.ts` lleva escrito, con el caso del `grant usage on
   * schema auth_helpers` que volvió verde un test de admin describiendo una base
   * que nadie corre, que agregar un privilegio para que un test pase convierte
   * la medición en ficción. Y acá el privilegio que falta es de la PLATAFORMA, no
   * del ledger: no hay un solo `grant` sobre `storage` en
   * `supabase/migrations/`, y no debería haberlo.
   *
   * La aserción existe para que la brecha sea visible, y para que alguien que
   * decidiera agregar el grant al harness se entere por un fallo y no por un
   * test que empieza a decir otra cosa.
   */
  test('las policies de storage son inalcanzables en esta base, y eso es del harness', async () => {
    const alcance = await ctx.sql.unsafe<
      {
        usage: boolean;
        insert: boolean;
        select: boolean;
        rls: boolean;
      }[]
    >(
      `select has_schema_privilege('authenticated', 'storage', 'usage') as usage,
              has_table_privilege('authenticated', 'storage.objects', 'insert') as insert,
              has_table_privilege('authenticated', 'storage.objects', 'select') as select,
              (select c.relrowsecurity
                 from pg_class c
                 join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'storage' and c.relname = 'objects') as rls`,
    );

    expect(
      plainRows(alcance)[0],
      'la superficie de Storage cambió en esta base. Si el harness empezó a ' +
        'otorgar USAGE, INSERT o SELECT sobre storage.objects, o a habilitar ' +
        'RLS ahí, las dos policies del bloque anterior se vuelven alcanzables de ' +
        'verdad y este archivo tiene que medirlas fuera del contrafáctual.',
    ).toEqual({ usage: false, insert: false, select: false, rls: false });

    const denial = await deniedAs(ctx.sql, 'authenticated', REPORTER, (tx) =>
      tx.unsafe(`select name from storage.objects`),
    );
    expect(
      denial,
      'authenticated leyó storage.objects en esta base',
    ).not.toBeNull();
    expect(denial?.code).toBe('42501');
    expect(
      denial?.message,
      'el rechazo de storage.objects no nombró el schema. Con USAGE ausente, ' +
        'el schema se resuelve antes que la tabla, y ese es el mensaje que lo ' +
        'distingue de un rechazo de policy.',
    ).toContain('permission denied for schema storage');
  });

  /**
   * Con los privilegios de Storage de Supabase —y solo esos, la policy es la del
   * ledger—, el prefijo de uid separa a las personas.
   *
   * Se mide lo que la policy dice, en transacciones que se tiran hacia atrás:
   *
   *   adjuntar en `<uid>/…`         → entra. Es lo que hace el móvil:
   *                                    `${userId}/report/${captureId}.${ext}`.
   *   adjuntar en la carpeta de otro → rechazado. Sin el prefijo del uid no hay
   *                                    forma de meter una captura en el
   *                                    namespace de otra persona.
   *   adjuntar sin carpeta           → rechazado. Una captura sin prefijo
   *                                    quedaría fuera del alcance de cualquiera.
   *   adjuntar con el owner de otro  → rechazado. La policy exige las DOS
   *                                    cosas, owner Y prefijo, y esta es la
   *                                    combinación que separa los dos términos.
   *   leer la propia                 → entra.
   *   leer la de otro                → cero filas, sin error.
   *
   * El cero filas SIN ERROR es el resultado correcto acá: la fila existe, el
   * cliente no la ve, y RLS filtra en vez de levantar. Un `42501` habría dicho
   * que la fila no existe, que es una afirmación más fuerte y más falsa.
   *
   * Lo que NO se mide, y por qué no se puede: `anon`. No hay policy de storage
   * para `anon` —el INSERT de capturas es `TO authenticated`—, así que habría
   * que agregar otra platform grant, y esa es la que ya se decidió no
   * agregar.
   */
  test('el prefijo de uid separa las capturas: entra en la suya y no en la de nadie más', async () => {
    await ctx.sql.unsafe(`
      insert into storage.objects (bucket_id, name, owner)
      values ('bug_report_images', '${REPORTER}/report/mia.png', '${REPORTER}'),
             ('bug_report_images', '${STRANGER}/report/suya.png', '${STRANGER}');
    `);

    try {
      await withStoragePlatform(async (asMember) => {
        expect(
          await asMember(
            `insert into storage.objects (bucket_id, name, owner)
             values ('bug_report_images', '${REPORTER}/report/nueva.png', '${REPORTER}')
             returning id`,
          ),
          'no pudo adjuntar una captura en su propia carpeta, que es lo que ' +
            'hace el móvil con cada captura de un reporte.',
        ).toBe('ok:1');

        expect(
          await asMember(
            `insert into storage.objects (bucket_id, name, owner)
             values ('bug_report_images', '${STRANGER}/report/infiltrada.png', '${REPORTER}')`,
          ),
          'adjuntó una captura en la carpeta de otra persona. El folder de la ' +
            'policy es lo único que lo impide.',
        ).toBe('42501');

        expect(
          await asMember(
            `insert into storage.objects (bucket_id, name, owner)
             values ('bug_report_images', 'sin-carpeta.png', '${REPORTER}')`,
          ),
          'adjuntó una captura sin prefijo de uid.',
        ).toBe('42501');

        expect(
          await asMember(
            `insert into storage.objects (bucket_id, name, owner)
             values ('bug_report_images', '${REPORTER}/report/con-owner-ajeno.png', '${STRANGER}')`,
          ),
          'adjuntó una captura con el owner de otra persona. La policy exige ' +
            'las dos cosas, owner Y prefijo.',
        ).toBe('42501');

        expect(
          await asMember(
            `select name from storage.objects where name = '${REPORTER}/report/mia.png'`,
          ),
          'no pudo leer su propia captura.',
        ).toBe('ok:1');

        expect(
          await asMember(
            `select name from storage.objects where name = '${STRANGER}/report/suya.png'`,
          ),
          'una sesión autenticada leyó la captura de otra persona. Que el ' +
            'bucket sea privado solo impedía el acceso anónimo.',
        ).toBe('ok:0');

        expect(
          await asMember(`select name from storage.objects order by name`),
          'el listado completo del bucket no es solo el de una persona.',
        ).toBe('ok:1');
      });
    } finally {
      await ctx.sql
        .unsafe(
          `delete from storage.objects where bucket_id = 'bug_report_images'`,
        )
        .catch(() => {});
    }

    const restan = await ctx.sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from storage.objects where bucket_id = 'bug_report_images'`,
    );
    expect(
      plainRows(restan)[0]?.n,
      'quedaron objetos de Storage. El bucket es de este archivo y las filas ' +
        'vienen del beforeAll de la base compartida.',
    ).toBe(0);
  });
});
