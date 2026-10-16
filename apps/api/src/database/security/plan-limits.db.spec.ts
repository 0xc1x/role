import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  BUSINESS_FEATURES,
  BUSINESS_PLAN_CODES,
  BUSINESS_PLAN_FEATURES,
  BUSINESS_PLAN_LIMITS,
} from '@0xc1x/role-commons';
import {
  as,
  createSupabaseTestDb,
  deniedAs,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * El catálogo de planes de `packages/commons` contra el motor que lo aplica.
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
 * MISMO. Son dos copias —`BUSINESS_PLAN_LIMITS` en TypeScript y el `case v_plan`
 * dentro de `enforce_business_location_limit` y `enforce_business_member_limit`
 * en Postgres— y entre dos copias no hay nada que las ate. El dueño lee «2
 * miembros» en el panel, el motor corta en 3, y nada en el sistema se da cuenta:
 * el panel no sabe lo que el trigger va a hacer y el trigger no sabe qué dice el
 * panel. Esa es exactamente la clase de mentira que la §4.5 dice que no quiere.
 *
 * ─── POR QUÉ SE LEE EL CATÁLOGO VIVO Y NO UNA COPIA DEL TEST ──────────────────
 *
 * Los cuatro assertions de abajo leen `pg_proc.prosrc` y `pg_enum` de la base
 * que este spec acaba de construir replicando `supabase/migrations/`, y los
 * comparan contra el archivo de TypeScript. No hay una segunda lista de números
 * escrita a mano que pueda quedarse vieja: si alguien cambia `free` de 2 a 3 en
 * el trigger y olvida el `.ts`, este spec se pone rojo señalando el `case`.
 *
 * Y al revés también, que es la mitad que importa más: si alguien sube el plan
 * gratis a 3 miembros en `commons` para venderlo, el motor sigue cortando en 2 y
 * el spec lo dice.
 *
 * `expect(BUSINESS_PLAN_LIMITS).toEqual(BUSINESS_PLAN_LIMITS)` sería verde con
 * cualquier base y para cualquier número. Nunca se compara una constante consigo
 * misma.
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
 * ─── LA ANTI-VACUIDAD ESTÁ EN LOS MISMOS TESTS, NO EN UNO DE PERDA ───────────
 *
 * Cada parsing afirma cuántas ramas encontró, antes de afirmar qué dicen. Un
 * regex que deja de matchear devuelve un objeto vacío, y `toEqual({})` contra un
 * catálogo de tres planes falla —pero por la razón equivocada, y un mensaje de
 * fallo que dice «no hay arms» es mucho más útil que uno que dice «los límites no
 * coinciden». Por eso el conteo va primero y con su propio `expect`.
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
