import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  BUSINESS_FEATURES,
  BUSINESS_PLAN_CODES,
  BUSINESS_PLAN_LIMITS,
  PLAN_AUDIENCES,
} from '@0xc1x/role-commons';
import type { TransactionSql } from 'postgres';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * El catálogo de planes de `packages/commons` contra la base que lo aplica.
 *
 * ─── POR QUÉ ESTE ARCHIVO, Y POR QUÉ NO ES EL DE LOS TRIGGERS ────────────────
 *
 * `business-members.rls.db.spec.ts` prueba que los triggers de la §5.3 HACEN LO
 * QUE DEBEN: que `free` no crea su segunda sucursal, que un negocio por encima
 * del tope sigue operando, que el dueño no consume cupo. Ese archivo es del
 * comportamiento, y todas sus afirmaciones son correctas.
 *
 * Lo que no existe en ninguna parte del repositorio es la otra mitad: que el
 * número que el dueño ve en el panel y el número que el motor aplica sean EL
 * MISMO. Y hoy ese número está en TRES copias —la constante de TypeScript
 * (`BUSINESS_PLAN_LIMITS`), la fila del catálogo (`public.subscription_plans`) y
 * el `case v_plan` que el motor llevaba escrito a mano—, y entre copias no hay
 * nada que las ate. El dueño lee «2 miembros» en el panel, el motor corta en 3, y
 * nada en el sistema se da cuenta: el panel no sabe lo que el motor va a hacer
 * y el motor no sabe qué dice el panel. Esa es exactamente la clase de mentira
 * que el §4.5 dice que no quiere.
 *
 * ─── LAS TRES MITADES DE ESTE ARCHIVO, Y POR QUÉ HAY TRES ────────────────────
 *
 * La primera mira a la fila del catálogo —lo que el panel muestra— y la
 * compara con el espejo de TypeScript. La segunda mira el CUERPO de los
 * triggers —lo que el motor aplica— y afirma que ya no lleva su propia copia:
 * que lee la fila y que no le queda ningún número que pueda ser un tope. La
 * tercera mide: cambia el número EN LA TABLA y mira qué hace el motor y qué
 * dice en voz alta.
 *
 * Las tres son necesarias porque se pueden mentir por separado. Un cuerpo sin
 * números no prueba que el número salga de la fila: prueba que no está escrito
 * en el motor, y el motor podría estar leyéndolo de cualquier otra parte —de
 * una constante, de un `greatest`, de una tabla que no es el catálogo—. Y una
 * tabla correcta no prueba que el motor la lea: el motor puede seguir usando
 * su copia y los dos pueden coincidir por casualidad. La medición del final
 * es la que cierra el §4.5 de verdad, porque es la única que cambia el número
 * y mira qué pasa.
 *
 * ─── POR QUÉ SE LEE LA BASE VIVA Y NO UNA COPIA DEL TEST ─────────────────────
 *
 * Las assertions de abajo leen `public.subscription_plans` de la base que este
 * spec acaba de construir replicando `supabase/migrations/`, y el
 * `pg_proc.prosrc` de los tres cuerpos del motor, y los comparan contra el
 * archivo de TypeScript. No hay una segunda lista de números escrita a mano que
 * pueda quedarse vieja: si alguien sube el plan gratis a 3 miembros en la
 * tabla y olvida el `.ts`, este spec se pone rojo señalando la celda; y si lo
 * sube en el trigger, se pone rojo señalando el `case`.
 *
 * El catálogo de FEATURES no se consulta para COMPARARLO contra el espejo: la
 * tabla `public.subscription_plan_features` no se lee para contrastarla con el
 * TypeScript, porque ya no hay una copia del plan → feature que comparar —la
 * hay en la tabla, y `business-members.rls.db.spec.ts` la consulta y la llama
 * como `authenticated`—. Lo que este archivo mira de las features es el TEXTO
 * del cuerpo de `business_has_feature`, que es lo que tiene que nombrarlas.
 *
 * Y hay UNA lectura de esa tabla, y no es una comparación: es la PRECONDICIÓN
 * del caso del plan que no está en el catálogo —el `on delete cascade` se lleva
 * las features con la fila del plan, y sin afirmar que las features se fueron
 * ese test mediría el orden de las comprobaciones sin saberlo—.
 *
 * Y al revés también, que es la mitad que importa más: si alguien sube el plan
 * gratis a 3 miembros en `commons` para venderlo, la tabla y el trigger siguen
 * diciendo 2 y el spec lo dice.
 *
 * `expect(BUSINESS_PLAN_LIMITS).toEqual(BUSINESS_PLAN_LIMITS)` sería verde con
 * cualquier base y para cualquier número. Nunca se compara una constante consigo
 * misma.
 *
 * ─── POR QUÉ SE COMPARA CELDA POR CELDA, Y POR QUÉ EL `null` CUENTA ───────────
 *
 * Un plan sin tope es `null`, y `null` es una celda como cualquier otra: el
 * `pro_plus` no tiene tope, y eso NO es lo mismo que tener un tope de cero. Un
 * `0` donde va un `null` es un tope, y un tope de cero es un plan distinto del
 * que el dueño compró —uno en el que no puede tener ni una sucursal—. La
 * comparación incluye el `null` justamente para que esa diferencia se vea en el
 * diff y no en un fallo de runtime.
 *
 * ─── `is_active` NO ENTRA EN LA COMPARACIÓN, Y POR QUÉ ───────────────────────
 *
 * Porque es OPERATIVO: retira un plan de la oferta sin borrarlo —dejar de vender
 * el `pro` no es borrar el `pro`— y no tiene espejo en TypeScript. No hay
 * `BUSINESS_PLAN_IS_ACTIVE` porque no es un dato del catálogo sino una decisión
 * del día. Por eso queda fuera a propósito, y por eso este párrafo existe: para
 * que nadie lo agregue al espejo por simetría y rompa el catálogo entero para
 * poder observar una columna que no está en el contrato.
 *
 * ─── POR QUÉ SE PARSEA EL CUERPO Y NO SE LLAMA A LA FUNCIÓN ───────────────────
 *
 * El mensaje que el motor levanta lleva el número adentro —«el plan free admite
 * hasta 2 miembros, no más»—, y ese mensaje es lo que el dueño lee cuando lo
 * rechazan. Es el mismo número por una vía distinta: el `raise` lo formatea
 * desde `v_limit`, y `v_limit` sale de la fila del catálogo. Por eso la
 * pregunta de este archivo no es sólo «¿qué número tiene la fila?» sino «¿el
 * motor dice en voz alta el número que hace cumplir?». Un catálogo correcto con
 * un `raise` que imprime otra cosa también le está mintiendo al dueño, y por
 * eso la pregunta tiene que incluir el mensaje.
 *
 * Y el cuerpo se lee por TEXTO —`pg_proc.prosrc`— y no ejecutando la función:
 * leerlo por texto es lo que permite comprobar, sin ejecutar nada, que el motor
 * ya no lleva su propia copia de los topes. La pregunta de esa lectura es
 * doble: que el cuerpo MENCIONE el catálogo, y que no le quede ningún número
 * que pueda ser un tope.
 *
 * ─── LA ANTI-VACUIDAD ESTÁ EN LOS MISMOS TESTS, NO EN UNO DE PERDA ───────────
 *
 * Cada lectura afirma cuántas filas encontró —o cuántos cuerpos— antes de
 * afirmar qué dicen. Una tabla vacía —una migración que no corrió, un nombre mal
 * escrito— devuelve `[]`, y `toEqual([])` contra un catálogo de tres planes
 * falla —pero por la razón equivocada, y un mensaje de fallo que dice «no hay
 * filas» es mucho más útil que uno que dice «los límites no coinciden». Un
 * regex que deja de matchear devuelve un objeto vacío, y `toEqual({})` contra un
 * catálogo de tres planes falla por la misma razón equivocada. Por eso el
 * conteo va primero y con su propio `expect`.
 */

let ctx: SupabaseTestDb;

/** El dueño y los cuatro usuarios que van a chocar contra el tope. */
const OWNER = 'e1000000-0000-4000-8000-000000000001';
const STAFF_A = 'e1000000-0000-4000-8000-000000000002';
const STAFF_B = 'e1000000-0000-4000-8000-000000000003';
const STAFF_C = 'e1000000-0000-4000-8000-000000000004';
const STAFF_D = 'e1000000-0000-4000-8000-000000000005';

/** Un negocio `free` —sin suscripción— y dos `pro_plus` y `pro`. */
const BIZ_FREE = 'e2000000-0000-4000-8000-000000000001';
const BIZ_PRO_PLUS = 'e2000000-0000-4000-8000-000000000002';
const BIZ_PRO = 'e2000000-0000-4000-8000-000000000003';
const LOC_FREE = 'e3000000-0000-4000-8000-000000000001';

function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * El cuerpo de la función, SIN sus comentarios y SIN sus literales de texto.
 *
 * Los dos se quitan por la misma razón, y es una razón buena: los comentarios
 * llevan números que son PROSA —el `§4.5`, el `R0001` escrito dentro de una
 * frase, los ejemplos del header— y los literales llevan el código del error y
 * los mensajes del dueño. Ninguno de los dos es un tope, y un escáner que los
 * contara estaría contando prosa.
 *
 * Lo que queda es el CÓDIGO, y el código es donde una segunda copia del tope
 * escondería su número.
 *
 * ─── LOS DOS ORDENES, Y POR QUÉ ─────────────────────────────────────────────
 *
 * Los comentarios se quitan PRIMERO porque son los únicos que tienen comillas
 * dentro (`'owner'`), y si se quitaran después romperían el conteo de comillas
 * de los literales. El patrón de los literales admite la comilla escapada
 * (`''`), que es la forma en que un mensaje puede llevar un apóstrofo.
 *
 * Y hay un supuesto: que ningún literal del cuerpo tenga un `--` dentro. Si lo
 * tuviera, el comentario se comería el resto de la línea y el escáner miraría
 * menos código del que hay —y miraría menos, nunca más, así que un tope
 * escondido en esa línea seguiría viéndose.
 */
function codigoDe(source: string): string {
  return (
    source
      .replace(/--[^\n]*/g, ' ')
      .replace(/'(?:[^']|'')*'/g, "''")
  );
}

/**
 * Los NÚMEROS que quedan en el código de un cuerpo.
 *
 * Es la pregunta más fuerte que se le puede hacer a un motor de topes: si el
 * cuerpo no tiene NINGÚN número, no puede tener un tope escrito a mano. Y el
 * único número que puede quedar es el que decide el singular del mensaje, que
 * es GRAMÁTICA y no un tope.
 */
function numerosDe(source: string): string[] {
  return codigoDe(source).match(/\d+/g) ?? [];
}

/**
 * Los tres cuerpos del motor, leídos de `pg_proc.prosrc`.
 *
 * El TEXTO, y no la ejecución: la pregunta de esta lectura es «¿qué lleva
 * escrito el motor?», y eso se lee en el texto. Un reformateo que no cambia lo
 * que el motor hace no puede romper la prueba, y un número nuevo escrito a mano
 * sí.
 */
async function cuerposDelMotor(): Promise<Record<string, string>> {
  const rows = plainRows<{ proname: string; prosrc: string }>(
    await ctx.sql.unsafe(`
				select p.proname, p.prosrc
				  from pg_proc p
				  join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.proname in ('business_has_feature',
				                     'enforce_business_location_limit',
				                     'enforce_business_member_limit')
				 order by p.proname`),
  );

  // El conteo ANTES del contenido. Una función que no existe devuelve `{}`, y
  // `{}` contra un catálogo de tres cuerpos falla por el motivo equivocado: el
  // archivo entero se volvería verde porque no encontró nada que contrastar.
  expect(
    rows.map((r) => r.proname),
    'faltan los cuerpos del motor. Si este spec no los lee, no está ' +
      'comparando nada.',
  ).toEqual([
    'business_has_feature',
    'enforce_business_location_limit',
    'enforce_business_member_limit',
  ]);

  return Object.fromEntries(rows.map((r) => [r.proname, r.prosrc]));
}

/** El centinela que fuerza el `rollback` de la transacción. */
const ROLLED_BACK = 'plan-limits.spec: rollback on purpose';

/**
 * El resultado de UN enunciado dentro de la transacción que se descarta.
 */
interface Attempt {
  /** El SQLSTATE del error, o `null` si el enunciado pasó. */
  code: string | null;
  /** El mensaje del servidor, o `''` si el enunciado pasó. */
  message: string;
  /** El `detail` del servidor, o `''` si el enunciado pasó. */
  detail: string;
}

/**
 * Corre varios enunciados en UNA transacción —la que se descarta— y devuelve
 * el resultado de CADA uno.
 *
 * ─── POR QUÉ EL `SAVEPOINT` Y NO EL ORDEN ────────────────────────────────────
 *
 * En Postgres, un enunciado que falla ABORTA la transacción entera, y todo lo
 * que viene después falla con `25P02` —«no hay transacción en curso»— en vez de
 * con su propio error. Sin `savepoint`, la única forma de medir dos enunciados
 * en la misma transacción sería poner el que se espera que falle AL FINAL, y
 * entonces «el anterior pasó» sólo se sabría por el mensaje del que falló.
 *
 * Con un `savepoint` por enunciado, el que falla se revierte SÓLO a su
 * savepoint y la transacción sigue viva para el siguiente. Por eso el que se
 * espera que falle puede ir en medio, y por eso cada enunciado se puede
 * afirmar por su nombre.
 *
 * ─── POR QUÉ EL `throw` DE ADENTRO ───────────────────────────────────────────
 *
 * Una transacción que resuelve COMMITEA. El camino de éxito de estas pruebas ES
 * escribir filas —una fila que entra, un tope que se cambia— y una fila
 * commiteada ahí envenena el resto del archivo, que cuenta filas del catálogo
 * sobre el mismo fixture. La única forma de garantizar que no sobreviva nada
 * es no dejar que la transacción resuelva nunca: el `throw` va después del
 * `try`, así que tanto si algo falló como si no, la transacción se descarta y
 * el código del error ya quedó copiado fuera.
 */
async function rolledBackAttempts(
  fn: (
    tx: TransactionSql,
    attempt: (label: string, sql: string) => Promise<Attempt>,
  ) => Promise<void>,
): Promise<Map<string, Attempt>> {
  const results = new Map<string, Attempt>();

  try {
    await ctx.sql.begin(async (tx) => {
      const attempt = async (
        label: string,
        sql: string,
      ): Promise<Attempt> => {
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(sql);
          });
          const passed: Attempt = { code: null, message: '', detail: '' };
          results.set(label, passed);
          return passed;
        } catch (error) {
          const err = error as {
            code?: string;
            message?: string;
            detail?: string;
          };
          const refused: Attempt = {
            code: err.code ?? '????',
            message: (err.message ?? '').replace(/\s+/g, ' ').trim(),
            detail: err.detail ?? '',
          };
          results.set(label, refused);
          return refused;
        }
      };

      await fn(tx, attempt);
      throw new Error(ROLLED_BACK);
    });
  } catch (error) {
    // Cualquier otra cosa es una conexión rota y tiene que salir: tragarse ese
    // error dejaría los resultados vacíos y la aserción culparía al motor de
    // algo que no fue el motor.
    if ((error as Error).message !== ROLLED_BACK) throw error;
  }

  return results;
}

/**
 * Corre una función en UNA transacción y devuelve el SQLSTATE del primer
 * enunciado que rechazó, o `null` si llegó al final — SIEMPRE sin dejar nada
 * atrás.
 *
 * Es el mismo arnés que usa `business-members.rls.db.spec.ts`, y por el mismo
 * motivo: una transacción que resuelve COMMITEA. El camino de éxito de estas
 * pruebas ES escribir una fila —una fila con `null` en el tope, que el CHECK
 * tiene que aceptar—, y una fila commiteada ahí envenena el resto del archivo,
 * que cuenta filas del catálogo sobre el mismo fixture. La única forma de
 * garantizar que no sobreviva nada es no dejar que la transacción resuelva
 * nunca: el `throw` va después del `try`, así que tanto si algo falló como si
 * no, la transacción se descarta y el código del error ya quedó copiado fuera.
 *
 * Sin suplantación de rol: el CHECK es una constraint de tabla y no depende de
 * quién escriba, así que la sesión del dueño —la que escribe el catálogo— basta.
 */
async function rolledBack(
  fn: (tx: Parameters<typeof as>[0]) => Promise<void>,
): Promise<string | null> {
  let refusal: string | null = null;
  try {
    await ctx.sql.begin(async (tx) => {
      try {
        await fn(tx as unknown as Parameters<typeof as>[0]);
      } catch (error) {
        refusal = (error as { code?: string }).code ?? '????';
      }
      throw new Error(ROLLED_BACK);
    });
  } catch (error) {
    // Cualquier otra cosa es una conexión rota y tiene que salir: tragarse ese
    // error dejaría `refusal` en `null` y la aserción culparía al CHECK de algo
    // que no fue el CHECK.
    if ((error as Error).message !== ROLLED_BACK) throw error;
  }
  return refusal;
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    for (const [id, email] of [
      [OWNER, 'plancat-owner@test'],
      [STAFF_A, 'plancat-staff-a@test'],
      [STAFF_B, 'plancat-staff-b@test'],
      [STAFF_C, 'plancat-staff-c@test'],
      [STAFF_D, 'plancat-staff-d@test'],
    ] as const) {
      await tx.unsafe(
        `insert into auth.users (id, email) values ('${id}', '${email}')
				 on conflict (id) do nothing`,
      );
    }

    await tx.unsafe(`
			insert into public.businesses (id, name, type, slug)
			values ('${BIZ_FREE}', 'Plan cat free',  'restaurant', 'plancat-free'),
			       ('${BIZ_PRO_PLUS}', 'Plan cat plus', 'restaurant', 'plancat-plus');

			insert into public.subscriptions (business_id, plan_code)
			values ('${BIZ_PRO_PLUS}', 'pro_plus');
		`);

    // El `free` NO lleva suscripción a propósito: `business_plan_of` cae a `free`
    // por ausencia, que es el caso por el que el dueño se encuentra el plan
    // gratis sin haber elegido nada.
    await tx.unsafe(`
			insert into public.business_locations
			  (id, business_id, name, address, latitude, longitude, is_active)
			values ('${LOC_FREE}', '${BIZ_FREE}', 'Única', 'dir', 0, 0, true);
		`);

    // El `free` nace YA EN EL TOPE: dueño más `members` accesses vivos. El
    // dueño no cuenta, así que el tope del §4.5 lo ocupa el personal de a pie
    // — y sembrar el tope con un número escrito a mano sería exactly la copia
    // que este spec viene a eliminar, así que se siembran los dos y se deja
    // que el motor diga cuál es el siguiente que no entra.
    await tx.unsafe(`
			insert into public.business_members
			  (id, business_id, user_id, role, label, alias, status,
			   session_ttl_hours, last_authenticated_at)
			values ('e4000000-0000-4000-8000-000000000001', '${BIZ_FREE}', '${OWNER}',
			        'owner', 'Dueña', 'plancat-owner@test',   'active', 0, null),
			       ('e4000000-0000-4000-8000-000000000002', '${BIZ_FREE}', '${STAFF_A}',
			        'staff', 'Cajero A', 'plancat-staff-a@test', 'active', 0, null),
			       ('e4000000-0000-4000-8000-000000000003', '${BIZ_FREE}', '${STAFF_B}',
			        'staff', 'Cajero B', 'plancat-staff-b@test', 'active', 0, null);
		`);
  });
});

afterAll(async () => {
  await ctx.stop();
});

describe('el enum de Postgres y el de TypeScript son el mismo catálogo', () => {
  test('business_plan_code', async () => {
    const labels = plainRows<{ label: string }>(
      await ctx.sql.unsafe(`
				select e.enumlabel as label
				  from pg_type t
				  join pg_enum e on e.enumtypid = t.oid
				 where t.typname = 'business_plan_code'
				 order by e.enumsortorder`),
    );

    expect(labels.length, 'el enum de planes de Postgres está vacío').toBe(
      BUSINESS_PLAN_CODES.length,
    );
    expect(
      labels.map((l) => l.label),
      'BUSINESS_PLAN_CODES y el enum public.business_plan_code no son la ' +
        'misma lista. Un plan que existe en TypeScript y no en la base no ' +
        'puede guardarse, y uno que existe en la base y no aquí no se puede ' +
        'mostrar.',
    ).toEqual([...BUSINESS_PLAN_CODES]);
  });

  test('business_feature', async () => {
    const labels = plainRows<{ label: string }>(
      await ctx.sql.unsafe(`
				select e.enumlabel as label
				  from pg_type t
				  join pg_enum e on e.enumtypid = t.oid
				 where t.typname = 'business_feature'
				 order by e.enumsortorder`),
    );

    expect(labels.length, 'el enum de features de Postgres está vacío').toBe(
      BUSINESS_FEATURES.length,
    );
    expect(labels.map((l) => l.label)).toEqual([...BUSINESS_FEATURES]);
  });

  test('plan_audience', async () => {
    // `n.nspname = 'public'` y no sólo el nombre: el tipo tiene que ser ÉSTE y
    // no otro `plan_audience` de otro esquema. El enum lo trae la migración
    // del catálogo y su segundo valor —`consumer`— existe para el futuro que
    // este plan no siembra: la tabla lo admite y no hay fila que lo use.
    const labels = plainRows<{ label: string }>(
      await ctx.sql.unsafe(`
				select e.enumlabel as label
				  from pg_type t
				  join pg_enum e on e.enumtypid = t.oid
				  join pg_namespace n on n.oid = t.typnamespace
				 where n.nspname = 'public'
				   and t.typname = 'plan_audience'
				 order by e.enumsortorder`),
    );

    expect(labels.length, 'el enum de audiencias de Postgres está vacío').toBe(
      PLAN_AUDIENCES.length,
    );
    expect(
      labels.map((l) => l.label),
      'PLAN_AUDIENCES y el enum public.plan_audience no son la misma lista. ' +
        'Una audiencia que la API no conoce no se puede pedir, y una que la ' +
        'base tiene y la API no, no se puede pintar.',
    ).toEqual([...PLAN_AUDIENCES]);
  });
});

describe('el catálogo de planes lleva los topes del §4.5', () => {
  test('celda por celda, con el `null` del `pro_plus` incluido', async () => {
    const rows = plainRows<{
      code: string;
      audience: string;
      max_locations: number | null;
      max_members: number | null;
    }>(
      await ctx.sql.unsafe(`
				select code, audience, max_locations, max_members
				  from public.subscription_plans
				 order by code`),
    );

    // El conteo ANTES del valor. Una tabla vacía —una migración que no corrió,
    // un nombre mal escrito— devuelve `[]`, y `[]` contra un catálogo de tres
    // planes falla por el motivo equivocado.
    expect(
      rows.length,
      'el catálogo de planes está vacío. O la migración no corrió, o la tabla ' +
        'no existe, o este spec se quedó viejo.',
    ).toBe(BUSINESS_PLAN_CODES.length);

    // El `order by code` ordena por el ORDEN DEL ENUM —`free`, `pro`,
    // `pro_plus`—, que es el mismo orden que `BUSINESS_PLAN_CODES`. La
    // comparación es posicional a propósito: un plan de más o de menos tiene
    // que verse como una fila de más o de menos, y no como un conjunto que
    // casualmente tiene el mismo tamaño.
    expect(
      rows.map((r) => r.code),
      'el catálogo no tiene los mismos planes que el espejo de TypeScript. Un ' +
        'plan que existe en la tabla y no en el `.ts` no se puede pedir en el ' +
        'panel, y uno que existe en el `.ts` y no en la tabla no se puede ' +
        'cobrar.',
    ).toEqual([...BUSINESS_PLAN_CODES]);

    // La audiencia: los tres planes que existen son de negocio. El enum también
    // admite `consumer`, pero no se siembra ninguno —y no sembrar ninguno es
    // una decisión, no un olvido: un plan de consumidor sin superficie que lo
    // ofrezca es una promesa que nadie puede cobrar.
    expect(
      rows.map((r) => r.audience),
      'un plan del catálogo no es de negocio. Los tres planes del §4.5 son ' +
        'de negocio, y la audiencia es lo que decide a quién se le puede ' +
        'asignar.',
    ).toEqual(BUSINESS_PLAN_CODES.map(() => 'business'));

    // Y los topes, celda por celda. El `null` del `pro_plus` va incluido: es
    // una celda como cualquier otra, y es la que distingue «sin tope» de
    // «tope de cero».
    expect(
      rows.map((r) => r.max_locations),
      'El número de sucursales del catálogo no es el del §4.5. La fila es la ' +
        'fuente de la que salen el panel y el motor, así que una diferencia ' +
        'aquí es el dueño leyendo un número y topando con otro.',
    ).toEqual(
      BUSINESS_PLAN_CODES.map((plan) => BUSINESS_PLAN_LIMITS[plan].locations),
    );

    expect(
      rows.map((r) => r.max_members),
      'El número de miembros del catálogo no es el del §4.5. Y el dueño sí lo ' +
        'va a notar, porque es el número que compra.',
    ).toEqual(
      BUSINESS_PLAN_CODES.map((plan) => BUSINESS_PLAN_LIMITS[plan].members),
    );
  });
});

describe('el CHECK de los topes separa «sin tope» de «tope de cero»', () => {
  test('un `0` se rechaza con 23514 y un `null` se acepta', async () => {
    // El `0` es el caso que el CHECK existe para cerrar: un tope de cero es un
    // plan en el que no se puede tener ni una sucursal, que es un plan DISTINTO
    // del que se vendió. Medido en esta base: el `23514` salta ANTES que el
    // `23505` de la primary key, así que el enunciado puede llevar un código que
    // ya existe y lo que se está midiendo es el CHECK y no el índice único.
    const cero = await rolledBack((tx) =>
      tx.unsafe(`
        insert into public.subscription_plans (code, audience, max_locations, max_members)
        values ('free', 'business', 0, 2)`),
    );

    expect(
      cero,
      'un `max_locations = 0` entró en el catálogo. Un tope de cero es un ' +
        'plan que el dueño no compró, y el CHECK es lo único que lo impide.',
    ).toBe('23514');

    // Y el `null` —«sin tope»— tiene que ENTRAR: es lo que el `pro_plus` entero
    // es.
    //
    // El `free` de este enunciado ya está sembrado, así que el mismo INSERT con
    // `null` chocaría con la primary key (`23505`, medido) y no mediría el
    // CHECK. Por eso la fila se borra antes, dentro de la MISMA transacción que
    // se descarta: lo que se mide es que el CHECK acepta un `null`, no que la
    // tabla acepte un duplicado.
    const nulo = await rolledBack(async (tx) => {
      await tx.unsafe(
        `delete from public.subscription_plans where code = 'free'`,
      );
      await tx.unsafe(`
        insert into public.subscription_plans (code, audience, max_locations, max_members)
        values ('free', 'business', null, null)`);
    });

    expect(
      nulo,
      'un `max_locations = null` fue rechazado. `null` es «sin tope» —el ' +
        '`pro_plus` entero—, y un CHECK que lo rechazara dejaría al plan más ' +
        'caro sin poder guardarse.',
    ).toBeNull();
  });
});

describe('la fila del catálogo sabe cuándo cambió', () => {
  test('el `updated_at` se mueve solo cuando se retira un plan de la oferta', async () => {
    // `is_active` es la columna que este catálogo existe para cambiar: retirar
    // un plan de la oferta es ponerla en `false` sin borrarlo. Y la pregunta que
    // hace esta fila es «¿cuándo se retiró?», que es una pregunta de FECHA. Si
    // `updated_at` no se moviera sola, la respuesta sería la fecha de creación
    // del catálogo —una mentira—, y la pregunta no tendría dónde esconderse.
    //
    // El trigger es `set_subscription_plans_updated_at` sobre
    // `public.handle_updated_at()`, el de la casa (catorce tablas lo llevan).
    // La comparación es DENTRO de una transacción que se descarta, así que el
    // `free` y el `pro` del catálogo quedan como estaban.
    let antes: Date | null = null;
    let despues: Date | null = null;

    await rolledBack(async (tx) => {
      const [previo] = await tx.unsafe<{ updated_at: Date }[]>(
        `select updated_at from public.subscription_plans where code = 'pro'`,
      );
      antes = previo?.updated_at ?? null;

      await tx.unsafe(
        `update public.subscription_plans set is_active = false where code = 'pro'`,
      );

      const [posterior] = await tx.unsafe<{ updated_at: Date }[]>(
        `select updated_at from public.subscription_plans where code = 'pro'`,
      );
      despues = posterior?.updated_at ?? null;
    });

    expect(
      antes,
      'no se leyó el `updated_at` de la fila del `pro`',
    ).not.toBeNull();
    expect(
      despues,
      'no se leyó el `updated_at` de la fila del `pro`',
    ).not.toBeNull();
    expect(
      (despues as Date).getTime(),
      'el `updated_at` de la fila no se movió al cambiar `is_active`. La ' +
        'columna dice la fecha en que se retiró el plan, y si no se mueve dice ' +
        'una fecha que no es la de nada.',
    ).toBeGreaterThan((antes as Date).getTime());
  });
});

describe('el motor lee el catálogo, y no lleva su propia copia', () => {
  test('los dos triggers leen `subscription_plans`', async () => {
    const cuerpos = await cuerposDelMotor();

    expect(
      cuerpos['enforce_business_location_limit'],
      'el trigger de sucursales no lee `public.subscription_plans`: el tope ' +
        'tiene que salir de la fila del catálogo, no de un número escrito en ' +
        'el cuerpo.',
    ).toContain('public.subscription_plans');

    expect(
      cuerpos['enforce_business_member_limit'],
      'el trigger de miembros no lee `public.subscription_plans`: el tope ' +
        'tiene que salir de la fila del catálogo, no de un número escrito en ' +
        'el cuerpo.',
    ).toContain('public.subscription_plans');

    // Y los dos preguntan la feature POR LA FUNCIÓN y no por la tabla: una
    // pregunta, una respuesta. La función es la que sabe qué concede cada
    // plan, y hay una sola.
    expect(
      cuerpos['enforce_business_location_limit'],
      'el trigger de sucursales no pregunta la feature por ' +
        '`public.business_has_feature`: el catálogo de features tiene una ' +
        'sola respuesta y la función es la que la da.',
    ).toContain('public.business_has_feature(');

    expect(
      cuerpos['enforce_business_member_limit'],
      'el trigger de miembros no pregunta la feature por ' +
        '`public.business_has_feature`: el catálogo de features tiene una ' +
        'sola respuesta y la función es la que la da.',
    ).toContain('public.business_has_feature(');
  });

  test('`business_has_feature` lee `subscription_plan_features`', async () => {
    const cuerpos = await cuerposDelMotor();

    expect(
      cuerpos['business_has_feature'],
      '`business_has_feature` no lee `public.subscription_plan_features`: el ' +
        'catálogo de QUÉ incluye cada plan es una tabla, y la copia que vivía ' +
        'en su `case` tiene que estar fuera.',
    ).toContain('public.subscription_plan_features');
  });

  test('ningún cuerpo lleva un tope ni un catálogo escritos a mano', async () => {
    const cuerpos = await cuerposDelMotor();

    // (a) LA FORMA DEL `case v_plan`. Es lo que escribió los topes a mano: un
    // `case` sobre el plan que asignaba el número. Y es la forma más difícil
    // de volver a colarse: un `case` sobre el plan se lee como algo normal.
    for (const nombre of [
      'enforce_business_location_limit',
      'enforce_business_member_limit',
    ]) {
      expect(
        cuerpos[nombre],
        `${nombre} tiene un \`case v_plan\`: el número del tope tiene que ` +
          'salir de la fila del catálogo, y un `case` sobre el plan es una ' +
          'copia escrita a mano.',
      ).not.toMatch(/case\s+v_plan\b/i);

      // (b) LA FORMA DEL `v_limit := <n>`. Aunque el `case` desapareciera, un
      // `v_limit := 2` en cualquier línea sería la misma copia, y una que el
      // regexp anterior no vería.
      expect(
        cuerpos[nombre],
        `${nombre} asigna un número a \`v_limit\`: el tope sale de la fila ` +
          'del catálogo, y un número asignado en el cuerpo es una segunda ' +
          'copia.',
      ).not.toMatch(/v_limit\s*:=\s*\d/i);
    }

    // (c) LA FORMA DEL CATÁLOGO DE FEATURES: un `case` sobre el plan que decía
    // qué feature concede cada uno.
    expect(
      cuerpos['business_has_feature'],
      '`business_has_feature` tiene un `case` sobre el plan: el catálogo de ' +
        'features es `public.subscription_plan_features`, y el `case` era la ' +
        'copia que se quería eliminar.',
    ).not.toMatch(/case\s+public\.business_plan_of/i);

    // (d) Y NOMBRAR UN PLAN. Un `case` no es la única forma de escribir el
    // catálogo a mano: también lo es una lista de planes con sus features.
    expect(
      cuerpos['business_has_feature'],
      '`business_has_feature` nombra un plan: el catálogo dice qué concede ' +
        'cada plan, y nombrarlos en el cuerpo es volver a copiarlo.',
    ).not.toMatch(/'(free|pro|pro_plus)'/i);
  });

  test('el único número que queda en el motor es el singular del mensaje', async () => {
    const cuerpos = await cuerposDelMotor();

    // El trigger de miembros: NINGÚN número. Su mensaje dice «miembros» igual
    // en singular y en plural, así que no necesita ninguno.
    expect(
      numerosDe(cuerpos['enforce_business_member_limit']),
      'el cuerpo del trigger de miembros tiene un número. Cualquier número ' +
        'que quede en el cuerpo de un trigger es un número que un día puede ' +
        'ser un tope.',
    ).toEqual([]);

    // El trigger de sucursales: UN número, el `1` del singular. Su mensaje
    // dice «sucursal» o «sucursales», y el plural lo decide ese número.
    expect(
      numerosDe(cuerpos['enforce_business_location_limit']),
      'el cuerpo del trigger de sucursales tiene un número que no es el ' +
        'singular del mensaje. Cualquier número que quede en el cuerpo de un ' +
        'trigger es un número que un día puede ser un tope.',
    ).toEqual(['1']);

    // Y el helper: NINGÚN número. Su cuerpo no tiene ni un `1` —ni el del
    // `exists`— porque la forma que se usa es `in (select …)`.
    expect(
      numerosDe(cuerpos['business_has_feature']),
      '`business_has_feature` tiene un número. El catálogo de features no ' +
        'tiene ningún número, así que el cuerpo tampoco debería.',
    ).toEqual([]);
  });

  test('el `1` del singular está marcado como GRAMÁTICA y no como un tope', async () => {
    const cuerpos = await cuerposDelMotor();
    const cuerpo = cuerpos['enforce_business_location_limit'];

    // El número que queda tiene que SELLARSE como lo que es. Sin el
    // comentario, un `1` suelto en el cuerpo de un trigger se lee como un
    // tope —que es lo que era antes— y el que lo lea no tiene por dónde
    // saber que ya no lo es.
    expect(
      cuerpo,
      'el `1` que decide el singular del mensaje tiene que estar marcado en ' +
        'un comentario como GRAMÁTICA y no como un tope: el tope sale de la ' +
        'fila del catálogo y este número sólo dice si la palabra va en ' +
        'singular.',
    ).toMatch(/--[^\n]*singular/i);

    expect(
      cuerpo,
      'el `1` que decide el singular del mensaje tiene que estar marcado en ' +
        'un comentario como GRAMÁTICA y no como un tope: el tope sale de la ' +
        'fila del catálogo y este número sólo dice si la palabra va en ' +
        'singular.',
    ).toMatch(/--[^\n]*no un tope/i);
  });
});

describe('`pro_plus` no tiene tope, y eso no es lo mismo que un tope de cero', () => {
  test('el plan sin tope entra sin límite', async () => {
    // La fila del `pro_plus` tiene los dos topes en `null`, y `null` es «sin
    // tope». Un plan sin fila en el catálogo NO es lo mismo: eso es un catálogo
    // roto, y el motor lo dice en voz alta (ver el describe de abajo). Lo que
    // se afirma aquí es el otro lado: que `null` de verdad no limita, y que se
    // comporta distinto de `0`.
    const rows = plainRows<{ locs: number }>(
      await as(ctx.sql, 'service_role', null, (tx) =>
        tx.unsafe<{ locs: number }[]>(`
					insert into public.business_locations
					  (business_id, name, address, latitude, longitude)
					select '${BIZ_PRO_PLUS}', 'Extra ' || g, 'dir', 0, 0
					  from generate_series(1, 2) g
					returning id`),
      ),
    );

    expect(
      rows.length,
      '`pro_plus` tiene `locations: null` en el catálogo y el motor lo ' +
        'rechazó. Un `null` que se comporta como un tope no es «sin tope»: ' +
        'es un tope que nadie escribió, y el dueño lo descubre creando su ' +
        'sucursal número uno.',
    ).toBe(2);

    expect(
      await plainRows<{ locs: number }>(
        await ctx.sql.unsafe<{ locs: number }[]>(`
					select count(*)::int as locs
					  from public.business_locations
					 where business_id = '${BIZ_PRO_PLUS}'`),
      )[0]?.locs,
    ).toBe(2);
  });
});

describe('el número que el motor dice en voz alta es el del catálogo', () => {
  test('la segunda sucursal de un free', async () => {
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(`
				insert into public.business_locations
				  (business_id, name, address, latitude, longitude)
				values ('${BIZ_FREE}', 'Segunda', 'dir', 0, 0)`),
    );

    expect(err, 'un free creó su segunda sucursal').not.toBeNull();
    expect(err?.message).toContain(
      `${BUSINESS_PLAN_LIMITS.free.locations} sucursal`,
    );
  });

  test('el miembro que no entra en un free', async () => {
    const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
      tx.unsafe(`
				insert into public.business_members
				  (business_id, user_id, role, label, alias)
				values ('${BIZ_FREE}', '${STAFF_C}', 'staff', 'Tercero',
				        'plancat-staff-c@test')`),
    );

    expect(
      err,
      'un free admits más miembros de los que dice el catálogo, y el dueño ' +
        'se entera comprando un plan que no compró.',
    ).not.toBeNull();
    expect(err?.message).toContain(
      `${BUSINESS_PLAN_LIMITS.free.members} miembros`,
    );
  });

  // ─── LA MEDICIÓN: EL NÚMERO SALE DE LA FILA ────────────────────────────────
  //
  // Todo lo de arriba lee el catálogo y lo compara con el espejo de
  // TypeScript. Eso prueba que el catálogo dice lo que dice el §4.5, y que el
  // motor no lleva su propia copia. NO prueba que el motor LEA la fila: un
  // motor podría leer el número de una constante, de un `greatest` o de una
  // tabla que no es el catálogo, y dar el mismo número mientras todo lo demás
  // cuadra.
  //
  // La prueba de que el motor lee la fila es de COMPORTAMIENTO: se cambia el
  // número EN LA TABLA, dentro de una transacción que se descarta, y se mira
  // qué hace el motor y qué dice en voz alta. Si el motor no leyera la fila, el
  // cambio no movería nada y estos tests seguirían verdes —que es exactamente
  // la clase de mentira que el §4.5 no quiere.
  //
  // Y el `detail` se mira también, porque es lo que el API parsea para
  //.draw el número al dueño (`staff.service.ts`): si el `raise` dijera 3 y el
  // `detail` dijera 2, el panel y el mensaje se contradirían.

  test('subir el tope de `free` en la tabla deja entrar al tercer miembro', async () => {
    const r = await rolledBackAttempts(async (_tx, attempt) => {
      await attempt(
        'subir el tope',
        `update public.subscription_plans set max_members = 3 where code = 'free'`,
      );
      await attempt(
        'el tercer miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_FREE}', '${STAFF_C}', 'staff', 'Tercero',
                 'plancat-staff-c@test')`,
      );
      await attempt(
        'el cuarto miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_FREE}', '${STAFF_D}', 'staff', 'Cuarto',
                 'plancat-staff-d@test')`,
      );
    });

    expect(
      r.get('subir el tope')?.code,
      'no se pudo cambiar el tope del `free` en la tabla. Sin esto no se está ' +
        'midiendo nada.',
    ).toBeNull();

    expect(
      r.get('el tercer miembro')?.code,
      'con el tope del `free` en 3, el tercer miembro NO entró. El motor no ' +
        'está leyendo la fila del catálogo: tiene su propia copia.',
    ).toBeNull();

    expect(
      r.get('el cuarto miembro')?.code,
      'con el tope del `free` en 3, el cuarto miembro entró. El motor no está ' +
        'leyendo la fila del catálogo: tiene su propia copia.',
    ).toBe('R0001');

    expect(
      r.get('el cuarto miembro')?.message,
      'el mensaje no dice el número de la fila. El número que el motor dice en ' +
        'voz alta tiene que salir de la misma fila que el que hace cumplir.',
    ).toBe('el plan free admite hasta 3 miembros, no más');

    // Y el `detail`, que es lo que el API parsea para dibujar el número.
    expect(
      r.get('el cuarto miembro')?.detail,
      'el `detail` no lleva el número de la fila. El API lo parsea y lo ' +
        'muestra al dueño, así que también tiene que salir de la fila.',
    ).toContain('plan=free limit=3 current=4');
  });

  test('bajar el tope de `pro` en la tabla hace que el mensaje diga 1', async () => {
    const r = await rolledBackAttempts(async (_tx, attempt) => {
      await attempt(
        'el negocio pro',
        `insert into public.businesses (id, name, type, slug)
         values ('${BIZ_PRO}', 'Plan cat pro', 'restaurant', 'plancat-pro')`,
      );
      await attempt(
        'la suscripción pro',
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_PRO}', 'pro')`,
      );
      await attempt(
        'bajar el tope',
        `update public.subscription_plans set max_members = 1 where code = 'pro'`,
      );
      await attempt(
        'el primer miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${STAFF_A}', 'staff', 'Uno',
                 'plancat-pro-uno@test')`,
      );
      await attempt(
        'el segundo miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${STAFF_B}', 'staff', 'Dos',
                 'plancat-pro-dos@test')`,
      );
    });

    expect(
      r.get('bajar el tope')?.code,
      'no se pudo cambiar el tope del `pro` en la tabla. Sin esto no se está ' +
        'midiendo nada.',
    ).toBeNull();

    expect(
      r.get('el primer miembro')?.code,
      'con el tope del `pro` en 1, el primer miembro no entró. Un tope de uno ' +
        'admite una fila, y el dueño la está pagando.',
    ).toBeNull();

    expect(r.get('el segundo miembro')?.code).toBe('R0001');

    expect(
      r.get('el segundo miembro')?.message,
      'el mensaje no dice el número de la fila. El `pro` está en 1 en la ' +
        'tabla, y el mensaje tiene que decir 1.',
    ).toBe('el plan pro admite hasta 1 miembros, no más');
  });

  test('el sustantivo sigue al número: `sucursales` en plural y `sucursal` en singular', async () => {
    // El mensaje de las sucursales dice «hasta 1 sucursal» o «hasta 2
    // sucursales», y el plural lo decide el número. Si el sustantivo fuera un
    // texto fijo, el dueño leería «el plan free admite hasta 2 sucursal» y
    // sería la primera señal de que el número y el mensaje no salen de la
    // misma fila.
    const enPlural = await rolledBackAttempts(async (_tx, attempt) => {
      await attempt(
        'subir el tope',
        `update public.subscription_plans set max_locations = 2 where code = 'free'`,
      );
      await attempt(
        'la segunda sucursal',
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_FREE}', 'Segunda', 'dir', 0, 0)`,
      );
      await attempt(
        'la tercera sucursal',
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_FREE}', 'Tercera', 'dir', 0, 0)`,
      );
    });

    expect(
      enPlural.get('la segunda sucursal')?.code,
      'con el tope de sucursales del `free` en 2, la segunda sucursal NO ' +
        'entró. El motor no está leyendo la fila del catálogo.',
    ).toBeNull();

    expect(enPlural.get('la tercera sucursal')?.code).toBe('R0001');

    expect(
      enPlural.get('la tercera sucursal')?.message,
      'con el tope en 2, el mensaje no dice «2 sucursales».',
    ).toBe('el plan free admite hasta 2 sucursales, no más');

    const enSingular = await rolledBackAttempts(async (_tx, attempt) => {
      await attempt(
        'bajar el tope',
        `update public.subscription_plans set max_locations = 1 where code = 'free'`,
      );
      await attempt(
        'la segunda sucursal',
        `insert into public.business_locations
           (business_id, name, address, latitude, longitude)
         values ('${BIZ_FREE}', 'Segunda', 'dir', 0, 0)`,
      );
    });

    expect(enSingular.get('la segunda sucursal')?.code).toBe('R0001');

    expect(
      enSingular.get('la segunda sucursal')?.message,
      'con el tope en 1, el mensaje no dice «1 sucursal».',
    ).toBe('el plan free admite hasta 1 sucursal, no más');
  });
});

describe('retirar un plan de la oferta no le cambia el tope a nadie', () => {
  // ─── POR QUÉ `is_active` NO FILTRA EL MOTOR ────────────────────────────────
  //
  // `is_active` es OPERATIVO: retira un plan de la oferta sin borrarlo —dejar
  // de vender el `pro` no es borrar el `pro`—. Un negocio que ya lo tiene lo
  // sigue teniendo, y su tope NO cambia.
  //
  // Y no puede cambiar: si el tope desapareciera al retirar el plan, todos los
  // negocios que lo tuvieran se quedarían sin techo DE GOLPE, y un negocio sin
  // techo es un negocio que crece sin que nadie lo haya comprado. Que nadie
  // pueda decidir, con una bandera, que un plan deja de tener límites es
  // justamente lo que hace que el catálogo sea un catálogo.
  //
  // La fila que falta en el catálogo es OTRA cosa: eso es un catálogo roto, y
  // se dice en voz alta (el describe de abajo). Una fila que está y está
  // retirada sigue contando.

  test('el tope del `pro` sigue siendo el mismo con el plan retirado de la oferta', async () => {
    const r = await rolledBackAttempts(async (_tx, attempt) => {
      await attempt(
        'el negocio pro',
        `insert into public.businesses (id, name, type, slug)
         values ('${BIZ_PRO}', 'Plan cat pro', 'restaurant', 'plancat-pro')`,
      );
      await attempt(
        'la suscripción pro',
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_PRO}', 'pro')`,
      );
      await attempt(
        'retirar el plan',
        `update public.subscription_plans set is_active = false where code = 'pro'`,
      );
      for (let i = 1; i <= 6; i += 1) {
        await attempt(
          `la sucursal ${i}`,
          `insert into public.business_locations
             (business_id, name, address, latitude, longitude)
           values ('${BIZ_PRO}', 'Sucursal ${i}', 'dir', 0, 0)`,
        );
      }
    });

    expect(
      r.get('retirar el plan')?.code,
      'no se pudo retirar el `pro` de la oferta. Sin esto no se está midiendo ' +
        'nada.',
    ).toBeNull();

    for (let i = 1; i <= 5; i += 1) {
      expect(
        r.get(`la sucursal ${i}`)?.code,
        `la sucursal ${i} no entró con el plan retirado de la oferta. ` +
          'Retirar un plan de la oferta no le cambia el tope a los negocios ' +
          'que ya lo tienen.',
      ).toBeNull();
    }

    expect(r.get('la sucursal 6')?.code).toBe('R0001');

    expect(
      r.get('la sucursal 6')?.message,
      'el mensaje no dice el tope del `pro`. Retirar el plan de la oferta no ' +
        'le cambia el tope a nadie, y el mensaje tiene que seguir diciendo el ' +
        'mismo número.',
    ).toBe('el plan pro admite hasta 5 sucursales, no más');
  });
});

describe('un plan que no está en el catálogo', () => {
  // ─── POR QUÉ ESTE CASO EXISTE ──────────────────────────────────────────────
  //
  // `subscriptions.plan_code` es el ENUM y no una FK al catálogo, y a
  // propósito: un `on delete cascade` haría que borrar un plan del catálogo se
  // llevara encima las suscripciones de los negocios que lo tienen, y el
  // negocio volvería a `free` EN SILENCIO, sin que nadie lo pidiera y sin que
  // su `updated_at` se moviera. Es la peor forma de perder un plan: la que no
  // deja rastro.
  //
  // Por eso la fila puede sobrevivir sin su plan en el catálogo, y ese estado
  // es EXACTAMENTE el que el motor tiene que saber detectar: es un catálogo
  // roto, y el motor tiene que decirlo en voz alta.
  //
  // Y lo dice RUIDOSO y sin `R0001`: `R0001` significa «subí de plan», y un
  // dueño que sube de plan no arregla un catálogo roto. La excepción no
  // lleva `errcode` —la genérica de Postgres, `P0001`— porque lo que hay que
  // arreglar no está en el panel.
  //
  // Y lo dice SÓLO CUANDO LA ESCRITURA CRECE. El motor necesita el tope para
  // decidir si una fila entra; renombrar un acceso, pausarlo o cambiarle la
  // etiqueta no crece, y un negocio con el catálogo roto tiene que poder
  // seguir operándose entero (§5.3 bloquea crecer, no operar).

  test('el motor se niega en voz alta, y no es `R0001`', async () => {
    // ─── LA PRECONDICIÓN, Y POR QUÉ HAY QUE AFIRMARLA ───────────────────────
    //
    // Este test mide una cosa que sólo se mide si las features del `pro` se
    // fueron con su fila: que el motor mira la fila del PLAN antes de
    // preguntar por la feature.
    //
    // Con las features todavía en la tabla, los dos órdenes se niegan —con la
    // feature primero por el `R0001` de siempre, con la fila primero por el
    // refusal de catálogo roto— y el test seguiría en verde sin probar nada.
    // Por eso el `on delete cascade` de `subscription_plan_features` es una
    // PRECONDICIÓN de esta medición, y una precondición que no se afirma no es
    // una precondición: es un supuesto que se rompe en silencio.
    let featuresDelPro = -1;

    const r = await rolledBackAttempts(async (tx, attempt) => {
      await attempt(
        'el negocio pro',
        `insert into public.businesses (id, name, type, slug)
         values ('${BIZ_PRO}', 'Plan cat pro', 'restaurant', 'plancat-pro')`,
      );
      await attempt(
        'la suscripción pro',
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_PRO}', 'pro')`,
      );
      await attempt(
        'el dueño',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${OWNER}', 'owner', 'Dueña',
                 'plancat-pro-duena@test')`,
      );
      await attempt(
        'el primer miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${STAFF_A}', 'staff', 'Uno',
                 'plancat-pro-uno@test')`,
      );
      // El `cascade` se lleva las features del `pro` con su fila: por eso el
      // motor tiene que mirar la fila del PLAN antes de preguntar por la
      // feature, o contestaría «tu plan no incluye el acceso del personal»,
      // que es mentira.
      await attempt(
        'borrar el plan del catálogo',
        `delete from public.subscription_plans where code = 'pro'`,
      );

      // Y SE COMPRUEBA, dentro de la MISMA transacción: las features tienen que
      // ser cero. Esta es la lectura que hace que lo de abajo signifique algo.
      const [{ restantes }] = await tx.unsafe<{ restantes: number }[]>(
        `select count(*)::int as restantes
           from public.subscription_plan_features
          where plan_code = 'pro'`,
      );
      featuresDelPro = restantes;

      await attempt(
        'renombrar un acceso',
        `update public.business_members set label = 'Renombrado'
          where business_id = '${BIZ_PRO}' and role <> 'owner'::public.business_member_role`,
      );
      await attempt(
        'el segundo miembro',
        `insert into public.business_members
           (business_id, user_id, role, label, alias)
         values ('${BIZ_PRO}', '${STAFF_B}', 'staff', 'Dos',
                 'plancat-pro-dos@test')`,
      );
    });

    expect(
      featuresDelPro,
      'las features del `pro` siguen en el catálogo después de borrar su fila. ' +
        'El `on delete cascade` de `subscription_plan_features` es lo que deja ' +
        'al motor con la fila del plan pero sin features, y SIN esa precondición ' +
        'este test no mide el orden de las comprobaciones: con las features ' +
        'presentes, los dos órdenes se niegan y el test sigue en verde.',
    ).toBe(0);

    expect(
      r.get('borrar el plan del catálogo')?.code,
      'no se pudo borrar la fila del `pro` del catálogo. Sin esto no se está ' +
        'midiendo nada.',
    ).toBeNull();

    // La suscripción sobrevive sin catálogo, y el negocio sigue siendo `pro`.
    // Eso es lo que hace posible el estado que se está midiendo.
    expect(
      r.get('el segundo miembro')?.code,
      'un plan que no está en el catálogo dejó crecer al negocio. El motor ' +
        'tiene que negarse, porque «sin tope» no es lo mismo que «sin fila».',
    ).not.toBeNull();

    expect(
      r.get('el segundo miembro')?.code,
      'la negativa por catálogo roto salió con `R0001`. `R0001` significa ' +
        '«subí de plan», y un dueño que sube de plan no arregla un catálogo ' +
        'roto: la avería tiene que ser ruidosa y de otro tipo.',
    ).not.toBe('R0001');

    // Y el código exacto es el que dice «sin `errcode`»: el `raise` sin
    // `USING` es el `P0001` genérico de Postgres. El API sólo traduce `R0001`,
    // `R0002` y `R0004`; un `P0001` llega al panel como un 500, que es lo
    // que tiene que llegar: esta avería no se arregla en el panel.
    expect(
      r.get('el segundo miembro')?.code,
      'la negativa por catálogo roto no es el `P0001` genérico de Postgres, ' +
        'que es lo que significa un `raise` sin `errcode`.',
    ).toBe('P0001');

    expect(
      r.get('el segundo miembro')?.detail,
      'la negativa por catálogo roto lleva un `detail`. El `detail` es lo que ' +
        'el API parsea para dibujar números, y aquí lo que falta es la fila, ' +
        'no un número.',
    ).toBe('');

    expect(
      r.get('el segundo miembro')?.message,
      'la negativa por catálogo roto no habla del catálogo.',
    ).toContain('catálogo');

    expect(
      r.get('el segundo miembro')?.message,
      'la negativa por catálogo roto no nombra el plan que falta.',
    ).toContain('pro');

    // Y el renombrar NO se negó: no crece, y el motor no necesita el tope para
    // dejarlo pasar. Un negocio con el catálogo roto tiene que poder seguir
    // operándose entero.
    expect(
      r.get('renombrar un acceso')?.code,
      'un negocio con el catálogo roto no puede ni renombrar un acceso. El ' +
        'motor necesita el tope para DECIDIR si una fila entra; renombrar no ' +
        'crece, y una reparación del catálogo no puede dejar al negocio sin ' +
        'poder operar (§5.3 bloquea crecer, no operar).',
    ).toBeNull();
  });
});
