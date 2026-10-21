import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  BUSINESS_FEATURES,
  BUSINESS_PLAN_CODES,
  BUSINESS_PLAN_FEATURES,
  BUSINESS_PLAN_LIMITS,
  PLAN_AUDIENCES,
} from '@0xc1x/role-commons';
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
 * el `case v_plan` que el motor lleva escrito a mano—, y entre copias no hay
 * nada que las ate. El dueño lee «2 miembros» en el panel, el motor corta en 3, y
 * nada en el sistema se da cuenta: el panel no sabe lo que el motor va a hacer
 * y el motor no sabe qué dice el panel. Esa es exactamente la clase de mentira
 * que el §4.5 dice que no quiere.
 *
 * ─── LAS DOS MITADES DE ESTE ARCHIVO, Y POR QUÉ HAY DOS ──────────────────────
 *
 * Una mira a la fila del catálogo —lo que el panel muestra— y la otra al cuerpo
 * de los triggers —lo que el motor aplica—. Las dos son necesarias mientras el
 * motor lleve su propia copia, y las dos se van cuando el motor lea la fila:
 * entonces la fila se compara con el espejo de TypeScript y el cuerpo del
 * trigger se compara con la fila, y el número que se hace cumplir y el que se
 * dice en voz alta salen de la MISMA fila por construcción y no por
 * monitorización.
 *
 * ─── POR QUÉ SE LEE LA BASE VIVA Y NO UNA COPIA DEL TEST ─────────────────────
 *
 * Las assertions de abajo leen `public.subscription_plans` y
 * `public.subscription_plan_features` de la base que este spec acaba de
 * construir replicando `supabase/migrations/`, y el `pg_proc.prosrc` de los
 * triggers, y los comparan contra el archivo de TypeScript. No hay una segunda
 * lista de números escrita a mano que pueda quedarse vieja: si alguien sube el
 * plan gratis a 3 miembros en la tabla y olvida el `.ts`, este spec se pone rojo
 * señalando la celda; y si lo sube en el trigger, se pone rojo señalando el
 * `case`.
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
 * rechazan. Es el mismo número por una vía distinta: el `raise` lo formatea desde
 * `v_limit`, y `v_limit` sale del `case`. Por eso el último test de este archivo
 * no pregunta sólo si el `case` dice 2, sino si lo que el motor dice en voz alta
 * es el 2 de `BUSINESS_PLAN_LIMITS`. Un `case` correcto con un `raise` que
 * imprime otra cosa también le está mintiendo al dueño, y por eso la pregunta
 * tiene que incluir el mensaje.
 *
 * Y el `case` se lee por TEXTO —`pg_proc.prosrc`— y no ejecutando la función:
 * el `case` es la única statement de Postgres donde vive el número, y leerla por
 * texto es lo que permite comparar sin ejecutar nada. Esa lectura es la que se
 * retira cuando el motor lea el catálogo: entonces el cuerpo del trigger no
 * tendrá ningún número, y la comparación pasa a ser «el cuerpo menciona el
 * catálogo y no contiene ningún literal de los topes».
 *
 * ─── LA ANTI-VACUIDAD ESTÁ EN LOS MISMOS TESTS, NO EN UNO DE PERDA ───────────
 *
 * Cada lectura afirma cuántas filas encontró —o cuántas ramas— antes de afirmar
 * qué dicen. Una tabla vacía —una migración que no corrió, un nombre mal
 * escrito— devuelve `[]`, y `toEqual([])` contra un catálogo de tres planes
 * falla —pero por la razón equivocada, y un mensaje de fallo que dice «no hay
 * filas» es mucho más útil que uno que dice «los límites no coinciden». Un
 * regex que deja de matchear devuelve un objeto vacío, y `toEqual({})` contra un
 * catálogo de tres planes falla por la misma razón equivocada. Por eso el conteo
 * va primero y con su propio `expect`.
 */

let ctx: SupabaseTestDb;

/** El dueño y los tres usuarios que van a chocar contra el tope. */
const OWNER = 'e1000000-0000-4000-8000-000000000001';
const STAFF_A = 'e1000000-0000-4000-8000-000000000002';
const STAFF_B = 'e1000000-0000-4000-8000-000000000003';
const STAFF_C = 'e1000000-0000-4000-8000-000000000004';

/** Un negocio `free` —sin suscripción— y uno `pro_plus`. */
const BIZ_FREE = 'e2000000-0000-4000-8000-000000000001';
const BIZ_PRO_PLUS = 'e2000000-0000-4000-8000-000000000002';
const LOC_FREE = 'e3000000-0000-4000-8000-000000000001';

function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
}

/**
 * Los topes que el trigger declara, leídos del CUERPO de la función.
 *
 * El `case` está escrito en el `prosrc`, no en un comentario: es la única
 *statement de Postgres donde vive el número, y leerla por texto es lo que
 * permite comparar sin ejecutar nada.
 *
 * `null` se devuelve como `null` y no como `0` porque `pro_plus` no tiene tope:
 * `0` significaría «no puede tener ninguna sucursal», que es un plan distinto y
 * uno que nadie quiere.
 */
function limitsFrom(source: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const arms = source.matchAll(
    /when\s+'([^']+)'\s+then\s+v_limit\s*:=\s*(null|\d+)/gi,
  );
  for (const arm of arms) {
    const plan = (arm[1] ?? '').toLowerCase();
    const value = (arm[2] ?? '').toLowerCase();
    out[plan] = value === 'null' ? null : Number(value);
  }
  return out;
}

/**
 * Las features que el trigger concede, leídas del CUERPO de
 * `business_has_feature`. Es `language sql`, así que el catálogo entero está en
 * el `prosrc` y no detrás de una llamada.
 *
 * El brazo se captura hasta el SIGUIENTE `when` y no por paréntesis, porque las
 * dos formas que escriben las dos cosas distintas: `free` concede una sola
 * feature con `p_feature = 'staff_access'` y `pro` la concede con `p_feature in
 * (…)`. Un parser que sólo entendiera la segunda habría leído dos de tres
 * planes y lo habría reportado como una discrepancia del catálogo en vez de como
 * lo que es —un parser que no conocía una forma del SQL que el motor sí.
 */
function featuresFrom(source: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const arms = source.matchAll(
    /when\s+'([^']+)'\s+then\s+p_feature\s*(?:=|in)\s*([^\n]*?)(?=\s+when\s+'|\s+else\b)/gi,
  );
  for (const arm of arms) {
    const plan = (arm[1] ?? '').toLowerCase();
    out[plan] = [...(arm[2] ?? '').matchAll(/'([^']+)'/g)].map((f) =>
      (f[1] ?? '').toLowerCase(),
    );
  }
  return out;
}

/** El centinela que fuerza el `rollback` de la transacción. */
const ROLLED_BACK = 'plan-limits.spec: rollback on purpose';

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

describe('los dos triggers llevan los topes del §4.5', () => {
  test('los topes de business_locations y de business_members', async () => {
    const bodies = plainRows<{ proname: string; prosrc: string }>(
      await ctx.sql.unsafe(`
				select p.proname, p.prosrc
				  from pg_proc p
				  join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.proname in ('enforce_business_location_limit',
				                     'enforce_business_member_limit')
				 order by p.proname`),
    );

    expect(
      bodies.map((b) => b.proname),
      'faltan los dos triggers de límite de la §5.3. Si este spec no los ' +
        'lee, no está comparando nada: el archivo entero se vuelve verde ' +
        'porque no encontró nada que contrastar.',
    ).toEqual([
      'enforce_business_location_limit',
      'enforce_business_member_limit',
    ]);

    const fromLocation = limitsFrom(
      bodies.find((b) => b.proname === 'enforce_business_location_limit')
        ?.prosrc ?? '',
    );
    const fromMember = limitsFrom(
      bodies.find((b) => b.proname === 'enforce_business_member_limit')
        ?.prosrc ?? '',
    );

    // El conteo ANTES del valor. Un regex que dejó de matchear devuelve `{}`,
    // y `{}` contra un catálogo de tres planes falla por el motivo equivocado.
    expect(
      Object.keys(fromLocation),
      'no se encontraron las tres ramas del `case v_plan` del trigger de ' +
        'sucursales. O el `case` cambió de forma, o este spec quedó viejo: ' +
        'las dos cosas se arreglan aquí, no volviendo a aflojar la comparación.',
    ).toEqual([...BUSINESS_PLAN_CODES]);
    expect(Object.keys(fromMember)).toEqual([...BUSINESS_PLAN_CODES]);

    expect(
      fromLocation,
      'El número de sucursales que el motor aplica no es el que el panel ' +
        'muestra. El dueño lee BUSINESS_PLAN_LIMITS[plan].locations y el ' +
        'trigger corta en otra cosa, así que le están cobrando por encima ' +
        'del plan que compró.',
    ).toEqual(
      Object.fromEntries(
        BUSINESS_PLAN_CODES.map((plan) => [
          plan,
          BUSINESS_PLAN_LIMITS[plan].locations,
        ]),
      ),
    );

    expect(
      fromMember,
      'El número de miembros que el motor aplica no es el que el panel ' +
        'muestra. Y el dueño sí lo va a notar, porque es el número que ' +
        'compra.',
    ).toEqual(
      Object.fromEntries(
        BUSINESS_PLAN_CODES.map((plan) => [
          plan,
          BUSINESS_PLAN_LIMITS[plan].members,
        ]),
      ),
    );
  });

  test('`pro_plus` no tiene tope, y eso no es lo mismo que un tope de cero', async () => {
    // El `case` del trigger tiene un `else` que levanta excepción, así que un
    // plan sin fila en el catálogo no cae en `null` por accidente. Lo que se
    // afirma aquí es el otro lado: que `null` de verdad no limita, y que se
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

describe('el catálogo de features lleva lo que el §4.5 dice', () => {
  test('celda por celda', async () => {
    const rows = plainRows<{ plan_code: string; feature: string }>(
      await ctx.sql.unsafe(`
				select plan_code, feature
				  from public.subscription_plan_features
				 order by plan_code, feature`),
    );

    // El espejo, aplanado: un par (plan, feature) por fila.
    //
    // El `order by` ordena por el orden de los ENUM (`business_plan_code` y
    // `business_feature`), y ese orden es el que declaran las migraciones: los
    // planes de primero a último y, dentro de cada plan, las features en el
    // orden en que `BUSINESS_PLAN_FEATURES` las lista. La comparación es
    // posicional por eso, y el orden de las features no es un dato de negocio:
    // es el orden del enum.
    const expected = BUSINESS_PLAN_CODES.flatMap((plan) => {
      const features: readonly string[] = BUSINESS_PLAN_FEATURES[plan];
      return features.map((feature) => ({ plan_code: plan, feature }));
    });

    expect(
      rows.length,
      'el catálogo de features no tiene las filas que dice el §4.5. O la ' +
        'migración no corrió, o la tabla no existe, o este spec se quedó ' +
        'viejo.',
    ).toBe(expected.length);

    expect(
      rows.map((r) => `${r.plan_code}:${r.feature}`),
      'El catálogo plan → feature de la tabla no es BUSINESS_PLAN_FEATURES. ' +
        'Una celda equivocada no rompe nada visible: le cobra de más a un ' +
        'plan, o le regala una feature de otro.',
    ).toEqual(expected.map((e) => `${e.plan_code}:${e.feature}`));
  });
});

describe('business_has_feature lleva el catálogo de features del §4.5', () => {
  test('celda por celda', async () => {
    const body = plainRows<{ prosrc: string }>(
      await ctx.sql.unsafe(`
				select p.prosrc
				  from pg_proc p
				  join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
				   and p.proname = 'business_has_feature'`),
    );
    expect(body).toHaveLength(1);

    const fromTrigger = featuresFrom(body[0]?.prosrc ?? '');
    expect(
      Object.keys(fromTrigger),
      'no se encontraron las tres ramas del `case` de ' +
        '`business_has_feature`. El catálogo se mudó de forma o este spec ' +
        'quedó viejo.',
    ).toEqual([...BUSINESS_PLAN_CODES]);

    const expected = Object.fromEntries(
      BUSINESS_PLAN_CODES.map((plan) => [
        plan,
        [...BUSINESS_PLAN_FEATURES[plan]],
      ]),
    );
    expect(
      fromTrigger,
      'El catálogo plan → feature del motor no es BUSINESS_PLAN_FEATURES. ' +
        'Una celda equivocada no rompe nada visible: le cobra de más a un ' +
        'plan, o le regala una feature de otro.',
    ).toEqual(expected);
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
});
