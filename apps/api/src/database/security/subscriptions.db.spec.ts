import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Sql } from 'postgres';
import {
  createSupabaseTestDb,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';

/**
 * La suscripción con sujeto genérico: el plan deja de ser una COLUMNA del
 * negocio y pasa a ser una FILA con sujeto.
 *
 * ─── POR QUÉ ESTE ARCHIVO Y NO EL ESPEJO DE DRIZZLE ─────────────────────────
 *
 * Misma razón que `plan-limits.db.spec.ts`: `apps/api/test/db.ts` construye la
 * base desde `apps/api/drizzle/`, y ese espejo no tiene las funciones de
 * `supabase/migrations/`. La pregunta de este archivo —«qué plan tiene este
 * negocio»— la contesta `public.business_plan_of`, y esa función vive en el
 * ledger. Este archivo replayea `supabase/migrations/` de verdad.
 *
 * ─── LO QUE ESTA TABLA CAMBIA, Y LO QUE NO ─────────────────────────────────
 *
 * Antes: `public.business_plans_state(business_id primary key, plan_code, …)`.
 * Una fila por negocio, el negocio ERA la llave, y el plan era una columna de
 * esa fila.
 *
 * Ahora: `public.subscriptions(id, business_id | user_id, plan_code, …)`. El
 * sujeto es una COLUMNA y el negocio es UNO de los dos sujetos posibles —hoy
 * un negocio, mañana una persona—, así que la tabla admite las dos cosas y
 * `business_plan_of` sólo mira la que le compete.
 *
 * ─── LAS CUATRO MITADES QUE ESTE ARCHIVO MIDE ───────────────────────────────
 *
 *   (a) un negocio SIN fila se lee `free` — el `coalesce` que hoy tienen los 16
 *       negocios de producción, y que esta migración no puede romper;
 *   (b) un negocio CON una suscripción viva se lee su `plan_code`;
 *   (c) una fila con `cancelled_at` o con `deleted_at` NO cuenta: se vuelve a
 *       `free`, porque una suscripción cancelada o archivada no concede plan;
 *   (d) una suscripción de PERSONA no afecta a ningún negocio — comparten tabla,
 *       no sujeto.
 *
 * Y las dos invariantes de la tabla: dos suscripciones VIVAS del mismo negocio
 * son rechazadas por el índice único, y una fila con `business_id` y `user_id` a
 * la vez viola el CHECK del sujeto.
 *
 * ─── POR QUÉ `business_plan_of` NO LA EJECUTA NINGÚN CLIENTE ────────────────
 *
 * Porque la función responde «qué plan tiene ESTE negocio», y un cliente que
 * pueda llamarla con cualquier id que se le ocurra se lleva el plan de
 * cualquier negocio. En producción la ACL es `{postgres, service_role}` —la
 * API resuelve el plan por el catálogo, con `service_role`, y no por esta
 * función—, y `public`/`anon`/`authenticated` están revocados.
 *
 * El arnés NO reproduce el `default privileges` de Supabase sobre las funciones
 * de `public` (a propósito: `supabase-platform.ts`, "ON FUNCTIONS IN `public`
 * THIS DELIBERATELY GRANTS NOTHING"), así que acá `service_role` tampoco la
 * ejecuta. Lo que sí se afirma —y es lo que importa— es que `anon` y
 * `authenticated` NO la ejecutan, y esa aserción vale igual en los dos lados.
 */

let ctx: SupabaseTestDb;

/** Un negocio SIN suscripción: se lee `free`. */
const BIZ_SIN = 'a1000000-0000-4000-8000-000000000001';
/** Un negocio con una suscripción VIVA `pro`. */
const BIZ_VIVA = 'a1000000-0000-4000-8000-000000000002';
/** Un negocio cuya suscripción está CANCELADA. */
const BIZ_CANCELADA = 'a1000000-0000-4000-8000-000000000003';
/** Un negocio cuya suscripción está ARCHIVADA. */
const BIZ_ARCHIVADA = 'a1000000-0000-4000-8000-000000000004';
/** Un negocio para el trigger del `updated_at`. */
const BIZ_UPDATED_AT = 'a1000000-0000-4000-8000-000000000005';
/** Una persona con suscripción propia: no es el plan de ningún negocio. */
const PERSONA = 'a2000000-0000-4000-8000-000000000001';

/**
 * La fecha de 2020 con la que nace la fila del trigger del `updated_at`.
 *
 * Escrita A MANO en el `insert`, y esa es la gracia: si el `updated_at` se
 * moviera solo, sería por el trigger, y no por un `now()` que casara con el
 * del `insert`.
 */
const FECHA_VIEJA = '2020-01-01T00:00:00Z';

/** El centinela que fuerza el `rollback` de la transacción. */
const ROLLED_BACK = 'subscriptions.spec: rollback on purpose';

/**
 * Corre una función en UNA transacción y devuelve el SQLSTATE del primer
 * enunciado que rechazó, o `null` si llegó al final — SIEMPRE sin dejar nada
 * atrás.
 *
 * Es el mismo arnés que usa `plan-limits.db.spec.ts`, y por el mismo motivo: una
 * transacción que resuelve COMMITEA, y una fila commiteada envenena el resto
 * del archivo, que cuenta filas sobre el mismo fixture. El `throw` va después
 * del `try`, así que tanto si algo falló como si no, la transacción se descarta
 * y el código del error ya quedó copiado fuera.
 */
async function refusal(fn: (tx: Sql) => Promise<void>): Promise<string | null> {
  let code: string | null = null;
  try {
    await ctx.sql.begin(async (tx) => {
      try {
        await fn(tx as unknown as Sql);
      } catch (error) {
        code = (error as { code?: string }).code ?? '????';
      }
      throw new Error(ROLLED_BACK);
    });
  } catch (error) {
    // Cualquier otra cosa es una conexión rota y tiene que salir: tragarse ese
    // error dejaría `code` en `null` y la aserción culparía al CHECK de algo
    // que no fue el CHECK.
    if ((error as Error).message !== ROLLED_BACK) throw error;
  }
  return code;
}

/**
 * El plan que la base le da a un negocio.
 *
 * Se lee como el dueño de la base —`postgres`, que es el rol con el que
 * conecta el API por `DATABASE_URL`— porque `business_plan_of` no es ejecutable
 * por `authenticated` a propósito, y leerla como `authenticated` mediría el
 * ACL en vez del plan.
 */
async function planOf(businessId: string): Promise<string | null> {
  const rows = await ctx.sql.unsafe<{ plan: string }[]>(
    `select public.business_plan_of('${businessId}'::uuid) as plan`,
  );
  return rows[0]?.plan ?? null;
}

/**
 * El `updated_at` de la suscripción viva de un negocio, en epoch.
 *
 * En epoch y no como texto porque la columna es `timestamptz`: su texto
 * depende del `TimeZone` de la sesión, y una aserción que depende del `TimeZone`
 * es una aserción que mide la configuración y no el dato.
 */
async function updatedAtOf(businessId: string): Promise<number> {
  const rows = await ctx.sql.unsafe<{ updated_at: number }[]>(
    `select extract(epoch from updated_at)::float8 as updated_at
       from public.subscriptions
      where business_id = '${businessId}'
        and cancelled_at is null
        and deleted_at is null`,
  );
  return rows[0]?.updated_at ?? -1;
}

beforeAll(async () => {
  ctx = await createSupabaseTestDb();

  await ctx.sql.begin(async (tx) => {
    // El perfil lo crea `handle_new_user` a partir del `auth.users`, que es lo
    // que hace la FK `subscriptions.user_id -> profiles(id)`.
    await tx.unsafe(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ('${PERSONA}', 'suscripcion-persona@test', '{"role":"user"}'::jsonb)
       on conflict (id) do nothing`,
    );

    await tx.unsafe(
      `insert into public.businesses (id, name, type, slug)
       values ('${BIZ_SIN}',       'Suscripción sin fila',   'restaurant', 'susc-sin'),
              ('${BIZ_VIVA}',      'Suscripción viva',      'restaurant', 'susc-viva'),
              ('${BIZ_CANCELADA}', 'Suscripción cancelada', 'restaurant', 'susc-cancelada'),
              ('${BIZ_ARCHIVADA}', 'Suscripción archivada', 'restaurant', 'susc-archivada'),
              ('${BIZ_UPDATED_AT}','Suscripción con fecha',  'restaurant', 'susc-fecha')`,
    );

    // Las cuatro filas que el archivo mide. La cuarta NO tiene negocio: es una
    // suscripción de persona, y comparte tabla con las de negocio sin dejar de
    // ser de otro sujeto.
    await tx.unsafe(
      `insert into public.subscriptions
         (business_id, user_id, plan_code, cancelled_at, deleted_at)
       values ('${BIZ_VIVA}',      null,         'pro',      null, null),
              ('${BIZ_CANCELADA}', null,         'pro_plus', now(), null),
              ('${BIZ_ARCHIVADA}', null,         'pro_plus', null, now()),
              (null,              '${PERSONA}', 'pro_plus', null, null)`,
    );

    // Y una quinta, para el trigger del `updated_at`: la fila nace con una
    // fecha VIEJA escrita a mano. Si el `updated_at` se mueve al actualizarla,
    // el que lo movió fue el trigger y no un `now()` que empatara con el del
    // `insert`.
    await tx.unsafe(
      `insert into public.subscriptions
         (business_id, plan_code, started_at, updated_at)
       values ('${BIZ_UPDATED_AT}', 'free', '${FECHA_VIEJA}', '${FECHA_VIEJA}')`,
    );
  });
});

afterAll(async () => {
  await ctx.stop();
});

describe('la suscripción viva es la que cuenta', () => {
  test('un negocio sin suscripción se lee free', async () => {
    // El `coalesce` a `free` es lo que le da su plan a los 16 negocios de
    // producción, que hoy no tienen fila: nadie eligió plan, y afirmar que
    // eligieron `free` sería inventar una compra.
    expect(await planOf(BIZ_SIN)).toBe('free');
  });

  test('una suscripción viva se lee como su plan_code', async () => {
    expect(await planOf(BIZ_VIVA)).toBe('pro');
  });

  test('una suscripción cancelada no cuenta: el negocio vuelve a free', async () => {
    // `cancelled_at` es la baja del contrato: la fila se queda para saber qué
    // hubo, pero no concede plan ni topes.
    expect(await planOf(BIZ_CANCELADA)).toBe('free');
  });

  test('una suscripción archivada no cuenta: el negocio vuelve a free', async () => {
    // `deleted_at` es el archivo: el mismo silencio que el de la tabla vieja.
    expect(await planOf(BIZ_ARCHIVADA)).toBe('free');
  });

  test('una suscripción de persona no afecta a ningún negocio', async () => {
    // La fila de la persona dice `pro_plus`. Si el plan se resolviera por
    // cualquier fila de la tabla, los cuatro negocios de este archivo se
    // leerían `pro_plus` — y con ellos, los 16 de producción.
    expect(await planOf(BIZ_SIN)).toBe('free');
    expect(await planOf(BIZ_VIVA)).toBe('pro');
    expect(await planOf(BIZ_CANCELADA)).toBe('free');
    expect(await planOf(BIZ_ARCHIVADA)).toBe('free');
  });

  test('la suscripción de persona es una fila viva, y se lee', async () => {
    // Lo de arriba afirma que la fila de la persona NO hace nada a los
    // negocios; esto afirma que la fila EXISTE y que está viva. Sin esta
    // mitad, un `insert` que no escribiera nada cumpliría la primera
    // aserción igual de bien: la ausencia de efecto y la ausencia de fila son
    // la misma cosa desde el punto de vista de un negocio.
    const rows = await ctx.sql.unsafe<
      {
        plan_code: string;
        business_id: string | null;
        user_id: string;
        cancelled_at: string | null;
        deleted_at: string | null;
      }[]
    >(
      `select plan_code,
              business_id::text as business_id,
              user_id::text    as user_id,
              cancelled_at::text as cancelled_at,
              deleted_at::text   as deleted_at
         from public.subscriptions
        where user_id = '${PERSONA}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      plan_code: 'pro_plus',
      business_id: null,
      user_id: PERSONA,
      cancelled_at: null,
      deleted_at: null,
    });
  });
});

describe('las invariantes de la tabla', () => {
  test('dos suscripciones vivas del mismo negocio son rechazadas', async () => {
    // El índice único parcial es lo que impide que un negocio tenga dos planes
    // vivos a la vez: dos respuestas a «qué plan tiene este negocio» son la
    // forma más corta de que se separen.
    const code = await refusal(async (tx) => {
      await tx.unsafe(
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_VIVA}', 'pro_plus')`,
      );
    });
    expect(code).toBe('23505');
  });

  test('una suscripción cancelada no bloquea la siguiente', async () => {
    // La contraparte del índice parcial: lo único que se rechaza es la SEGUNDA
    // fila VIVA. La cancelada está ahí para decir que hubo un plan, y la nueva
    // puede entrar al lado.
    const code = await refusal(async (tx) => {
      await tx.unsafe(
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_CANCELADA}', 'pro')`,
      );
    });
    expect(code).toBeNull();
  });

  test('una suscripción archivada tampoco bloquea la siguiente', async () => {
    // El TERCER término del predicado del índice —`deleted_at is null`— es el
    // que se mide acá. El archivo es HISTORIA: la fila archivada dice que hubo
    // un plan y se queda ahí, y la nueva entra al lado. Un índice único sin
    // ese término affirmaría que un negocio sólo puede haber tenido un plan en
    // su vida.
    const code = await refusal(async (tx) => {
      await tx.unsafe(
        `insert into public.subscriptions (business_id, plan_code)
         values ('${BIZ_ARCHIVADA}', 'pro')`,
      );
    });
    expect(code).toBeNull();
  });

  test('una fila con negocio y persona a la vez viola el check del sujeto', async () => {
    // El CHECK es lo que hace que el sujeto sea UNO: una fila que se dice de
    // un negocio y de una persona no tiene un sujeto, y una fila sin sujeto
    // tampoco.
    const code = await refusal(async (tx) => {
      await tx.unsafe(
        `insert into public.subscriptions (business_id, user_id, plan_code)
         values ('${BIZ_SIN}', '${PERSONA}', 'pro')`,
      );
    });
    expect(code).toBe('23514');
  });

  test('una fila sin sujeto tampoco entra', async () => {
    const code = await refusal(async (tx) => {
      await tx.unsafe(
        `insert into public.subscriptions (plan_code) values ('pro')`,
      );
    });
    expect(code).toBe('23514');
  });
});

describe('la postura de la tabla', () => {
  test('la suscripción no tiene ninguna policy', async () => {
    // CERO policies, y no por descuido: lo que frena la lectura de un cliente
    // es la AUSENCIA de una policy que la admita, no una policy que la niegue.
    // La API la lee y la escribe con `service_role`, que salta el RLS.
    const rows = await ctx.sql.unsafe<{ policyname: string }[]>(
      `select policyname
         from pg_policies
        where schemaname = 'public'
          and tablename = 'subscriptions'`,
    );
    expect(rows).toEqual([]);
  });

  test('business_plan_of conserva su ACL: ningún cliente la ejecuta', async () => {
    const rows = await ctx.sql.unsafe<
      { anon: boolean; authenticated: boolean }[]
    >(
      `select has_function_privilege('anon',         'public.business_plan_of(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.business_plan_of(uuid)', 'execute') as authenticated`,
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false });
  });

  test('el updated_at lo mantiene el trigger, no la aplicación', async () => {
    // El trigger `set_subscriptions_updated_at` pone `now()` en la columna, y
    // esa es la razón de que exista: la fila la escribe la PLATAFORMA, que es
    // la que asigna el plan, y una columna que dice cuándo se cambió el plan
    // no puede depender de que quien escribe se acuerde de escribirla.
    //
    // La fila de este test nace con `updated_at` de 2020, escrito a mano, así
    // que el movimiento que se afirma es el del trigger y no un empate de
    // reloj. Y `extract(epoch …)` en vez de un texto: la columna es
    // `timestamptz` y su texto depende del `TimeZone` de la sesión.
    const antes = await updatedAtOf(BIZ_UPDATED_AT);
    expect(antes).toBe(new Date(FECHA_VIEJA).getTime() / 1000);

    await ctx.sql.unsafe(
      `update public.subscriptions
          set plan_code = 'pro'
        where business_id = '${BIZ_UPDATED_AT}'`,
    );

    const despues = await updatedAtOf(BIZ_UPDATED_AT);
    expect(despues).toBeGreaterThan(antes);
    // Y es AHORA, no cualquier otra fecha: la columna dice cuándo la cambió
    // la base. La ventana es ancha a propósito —el reloj de la sesión y el de
    // la máquina son el mismo, pero el test no depende de eso para ser cierto.
    expect(despues).toBeGreaterThan(Date.now() / 1000 - 600);
  });
});

describe('la tabla que se retira', () => {
  test('business_plans_state ya no existe', async () => {
    // La tabla vieja se queda en la base con 0 filas y sin backfill: `drop
    // table` no pierde datos porque no los había. Lo que se afirma aquí es que
    // la tabla NO está, para que nadie la lea por costumbre.
    const rows = await ctx.sql.unsafe<{ vieja: string | null }[]>(
      `select to_regclass('public.business_plans_state')::text as vieja`,
    );
    expect(rows[0]?.vieja).toBeNull();
  });
});
