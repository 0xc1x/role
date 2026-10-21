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
 * El catálogo de planes de `packages/commons` contra la tabla que lo guarda.
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
 * MISMO. Son dos copias —`BUSINESS_PLAN_LIMITS` en TypeScript y la fila del
 * catálogo en Postgres— y entre dos copias no hay nada que las ate. El dueño lee
 * «2 miembros» en el panel, el motor corta en 3, y nada en el sistema se da
 * cuenta: el panel no sabe lo que el motor va a hacer y el motor no sabe qué dice
 * el panel. Esa es exactamente la clase de mentira que la §4.5 dice que no quiere.
 *
 * ─── POR QUÉ SE LEE EL CATÁLOGO VIVO Y NO UNA COPIA DEL TEST ──────────────────
 *
 * Las assertions de abajo leen `public.subscription_plans` y
 * `public.subscription_plan_features` de la base que este spec acaba de
 * construir replicando `supabase/migrations/`, y las comparan contra el archivo
 * de TypeScript. No hay una segunda lista de números escrita a mano que pueda
 * quedarse vieja: si alguien sube el plan gratis a 3 miembros en la tabla y
 * olvida el `.ts`, este spec se pone rojo señalando la celda.
 *
 * Y al revés también, que es la mitad que importa más: si alguien sube el plan
 * gratis a 3 miembros en `commons` para venderlo, la tabla sigue diciendo 2 y el
 * spec lo dice.
 *
 * `expect(BUSINESS_PLAN_LIMITS).toEqual(BUSINESS_PLAN_LIMITS)` sería verde con
 * cualquier base y para cualquier número. Nunca se compara una constante consigo
 * misma.
 *
 * ─── LO QUE MIDE HOY, Y LA COPIA QUE TODAVÍA QUEDA ───────────────────────────
 *
 * Este archivo mide que la FILA del catálogo y el espejo de TypeScript digan lo
 * mismo. El motor, en cambio, todavía lleva sus propios números escritos a mano
 * —el `case v_plan` de `enforce_business_location_limit` y
 * `enforce_business_member_limit`, y el `case` de `business_has_feature`—, y
 * esa es la copia que se retira cuando los triggers lean el catálogo. Hasta
 * entonces, este archivo no puede afirmar que el número que el motor aplica es
 * el de la fila: afirma que el número de la fila es el del §4.5, y el bloque
 * final —el del mensaje en voz alta— es lo que todavía ata al motor.
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
 * ─── POR QUÉ SE MIDE EL MENSAJE Y NO SÓLO EL COMPORTAMIENTO ──────────────────
 *
 * El mensaje que el motor levanta lleva el número adentro —«el plan free admite
 * hasta 2 miembros, no más»—, y ese mensaje es lo que el dueño lee cuando lo
 * rechazan. Es el mismo número por una vía distinta: el `raise` lo formatea desde
 * el valor que el motor aplicó. Por eso el último bloque de este archivo no
 * pregunta sólo si el motor rechaza, sino si lo que el motor dice en voz alta es
 * el 2 de `BUSINESS_PLAN_LIMITS`. Un rechazo correcto con un `raise` que imprime
 * otra cosa también le está mintiendo al dueño, y por eso la pregunta tiene que
 * incluir el mensaje.
 *
 * ─── LA ANTI-VACUIDAD ESTÁ EN LOS MISMOS TESTS, NO EN UNO DE PERDA ───────────
 *
 * Cada lectura afirma cuántas filas encontró, antes de afirmar qué dicen. Una
 * tabla vacía —una migración que no corrió, un nombre mal escrito— devuelve
 * `[]`, y `toEqual([])` contra un catálogo de tres planes falla —pero por la
 * razón equivocada, y un mensaje de fallo que dice «no hay filas» es mucho más
 * útil que uno que dice «los límites no coinciden». Por eso el conteo va primero
 * y con su propio `expect`.
 */

let ctx: SupabaseTestDb;

/** El dueño y los tres usuarios que van a chocar contra el tope. */
const OWNER = 'e1000000-0000-4000-8000-000000000001';
const STAFF_A = 'e1000000-0000-4000-8000-000000000002';
const STAFF_B = 'e1000000-0000-4000-8000-000000000003';
const STAFF_C = 'e1000000-0000-4000-8000-000000000004';

/** Un negocio `free` —sin fila en `business_plans_state`— y uno `pro_plus`. */
const BIZ_FREE = 'e2000000-0000-4000-8000-000000000001';
const BIZ_PRO_PLUS = 'e2000000-0000-4000-8000-000000000002';
const LOC_FREE = 'e3000000-0000-4000-8000-000000000001';

function plainRows<T>(result: unknown): T[] {
  return [...(result as Iterable<T>)];
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

			insert into public.business_plans_state (business_id, plan_code)
			values ('${BIZ_PRO_PLUS}', 'pro_plus');
		`);

    // El `free` NO lleva fila a propósito: `business_plan_of` cae a `free`
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

  test('`pro_plus` no tiene tope, y eso no es lo mismo que un tope de cero', async () => {
    // El motor tiene un `else` que levanta excepción, así que un plan sin fila
    // en el catálogo no cae en `null` por accidente. Lo que se afirma aquí es el
    // otro lado: que `null` de verdad no limita, y que se comporta distinto de
    // `0`.
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
