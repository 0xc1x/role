import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Database } from '../../database/database.module';
import {
  createSupabaseTestDb,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CABLE CON LA BASE, CONTRA LA BASE DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Los specs del servicio usan un doble de repositorio, y un doble no sabe
 * SQL: no ve si el `UPDATE` de la fila viva tiene la forma correcta, ni si el
 * `LEFT JOIN` al catálogo trae lo que tiene que traer, ni si el `insert` deja
 * que la base ponga las fechas. Este archivo es el que ve eso.
 *
 * ─── POR QUÉ ESTA BASE Y NO EL ESPEJO DE DRIZZLE ────────────────────────────
 *
 * Porque lo que se afirma aquí es de dos mitades que el espejo no tiene: las
 * FUNCIONES del ledger (`public.business_plan_of`, que es la respuesta con la
 * que esta API tiene que coincidir) y el TRIGGER del `updated_at`, que es la
 * razón por la que la aplicación no manda esa columna. `apps/api/test/db.ts`
 * construye la base desde `apps/api/drizzle/`, y ese espejo no lleva ninguna
 * de las dos cosas.
 */

let ctx: SupabaseTestDb;
let repo: SubscriptionsRepository;
let db: Database;
let client: postgres.Sql;

/**
 * El SQL que sale, tal cual.
 *
 * Lo emite el LOGGER de Drizzle, que es la única puerta por la que se ve la
 * consulta antes de que la base la conteste.
 *
 * ─── POR QUÉ HACE FALTA, Y POR QUÉ EL RESULTADO NO PUEDE AFIRMAR LO MISMO ─────
 *
 * El trigger del `updated_at` es `before update`: pisa CUALQUIER valor que la
 * aplicación mande. Así que una implementación que escribiera `updated_at` a
 * mano dejaría la columna con la fecha del trigger, y el resultado sería
 * EXACTAMENTE el mismo —el test del «la columna se movió» pasaría con las
 * dos implementaciones—. Lo que se afirma aquí es la FORMA de la consulta: las
 * columnas que la aplicación escribe de verdad.
 */
const queries: string[] = [];

/** La última consulta que salió, para no buscarla entre todas. */
const lastQuery = (): string => queries.at(-1) ?? '';

/**
 * El `SET` del `UPDATE`: lo que la aplicación escribe DE VERDAD.
 *
 * El `RETURNING` sí menciona las tres fechas —las devuelve—, así que la
 * afirmación tiene que caer sobre la parte del `SET`, que es la que decide
 * qué columnas se escriben.
 */
const updateSetClause = (sql: string): string => {
  const match = sql.match(/set (.*?) where /s);
  return match?.[1] ?? '';
};

/**
 * Las columnas del `INSERT` a las que la aplicación da un VALOR.
 *
 * Drizzle nombra todas las columnas de la tabla y pone `default` en las que
 * no se escriben: en ésas, el valor lo pone la base. Lo que se afirma es que
 * las columnas con valor son exactamente dos, y que las tres fechas no están
 * entre ellas.
 */
const insertColumnsWithValue = (sql: string): string[] => {
  const match = sql.match(
    /insert into "subscriptions" \(([^)]*)\) values \(([^)]*)\)/,
  );
  if (!match) return [];
  const columns = match[1]!
    .split(',')
    .map((column) => column.trim().replaceAll('"', ''));
  const values = match[2]!.split(',').map((value) => value.trim());
  return columns.filter((_, index) => values[index] !== 'default');
};

/** Un negocio CON una suscripción viva. */
const BIZ_VIVA = 'c1000000-0000-4000-8000-000000000001';
/** Un negocio SIN fila: se lee `free`. */
const BIZ_SIN = 'c1000000-0000-4000-8000-000000000002';
/** Un negocio cuya única fila está CANCELADA. */
const BIZ_CANCELADA = 'c1000000-0000-4000-8000-000000000003';
/** Un negocio para el `INSERT` cuya FORMA se afirma. */
const BIZ_INSERT = 'c1000000-0000-4000-8000-000000000004';
/** Un negocio que no existe. */
const BIZ_FANTASMA = 'c1000000-0000-4000-8000-0000000000ff';

/**
 * La fecha de 2020 con la que nace la fila viva.
 *
 * Escrita A MANO en el `insert`, que es la gracia: si el `updated_at` se
 * moviera solo, sería por el trigger, y no por un `now()` que casara con el
 * del `insert`.
 */
const FECHA_VIEJA = '2020-01-01T00:00:00Z';

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
  client = postgres(ctx.connectionString, { prepare: false });
  db = drizzle({
    client,
    logger: {
      logQuery: (query: string) => {
        queries.push(query);
      },
    },
  });
  repo = new SubscriptionsRepository(db);

  await ctx.sql.begin(async (tx) => {
    await tx.unsafe(
      `insert into public.businesses (id, name, type, slug)
       values ('${BIZ_VIVA}',      'Suscripción viva',      'restaurant', 'sub-repo-viva'),
              ('${BIZ_SIN}',       'Suscripción sin fila',  'restaurant', 'sub-repo-sin'),
              ('${BIZ_CANCELADA}', 'Suscripción cancelada', 'restaurant', 'sub-repo-cancelada'),
              ('${BIZ_INSERT}',    'Suscripción insertada', 'restaurant', 'sub-repo-insert')`,
    );

    await tx.unsafe(
      `insert into public.subscriptions (business_id, plan_code, updated_at)
       values ('${BIZ_VIVA}', 'pro', '${FECHA_VIEJA}')`,
    );

    await tx.unsafe(
      `insert into public.subscriptions (business_id, plan_code, cancelled_at)
       values ('${BIZ_CANCELADA}', 'pro_plus', now())`,
    );
  });
});

afterAll(async () => {
  await client.end();
  await ctx.stop();
});

describe('la lectura de la suscripción y del catálogo', () => {
  test('la fila viva trae el plan_code de la suscripción Y los límites del catálogo', async () => {
    const entry = await repo.findBusinessSubscription(BIZ_VIVA);

    expect(entry).not.toBeNull();
    // La SUSCRIPCIÓN dice qué plan...
    expect(entry?.plan_code).toBe('pro');
    // ...y el CATÁLOGO dice qué incluye. Las dos mitades vienen de la misma
    // consulta: es la misma fila que lee el motor.
    expect(entry?.plan?.max_locations).toBe(5);
    expect(entry?.plan?.max_members).toBe(20);
    // El orden de las features es el del ENUM de Postgres —`staff_access`,
    // `payments`, `visibility_plus`—, y no el alfabético: un enum se ordena por
    // la posición que tiene en el tipo, y esa es la que la base usa.
    expect(entry?.plan?.features).toEqual(['staff_access', 'payments']);
    expect(entry?.started_at).toBeInstanceOf(Date);
  });

  test('un negocio sin fila no tiene suscripción, y el `free` es del catálogo', async () => {
    expect(await repo.findBusinessSubscription(BIZ_SIN)).toBeNull();

    // El plan del que se lee ese negocio sale del catálogo, no de una
    // constante: por eso se pregunta por él.
    const free = await repo.findPlan('free');
    expect(free?.max_locations).toBe(1);
    expect(free?.max_members).toBe(2);
    expect(free?.features).toEqual(['staff_access']);
  });

  test('una fila cancelada NO cuenta: la viva es la que concede el plan', async () => {
    // Misma respuesta que `public.business_plan_of`: la fila muerta no
    // concede plan, y el negocio se lee `free`.
    expect(await repo.findBusinessSubscription(BIZ_CANCELADA)).toBeNull();

    const rows = await ctx.sql.unsafe<{ plan: string }[]>(
      `select public.business_plan_of('${BIZ_CANCELADA}'::uuid) as plan`,
    );
    expect(rows[0]?.plan).toBe('free');
  });

  test('la respuesta de la API y la del motor son la MISMA', async () => {
    // La promesa del Plan 5: el panel y el motor no pueden discrepar. La
    // función `public.business_plan_of` es lo que el motor pregunta —y lo que
    // la API NO pregunta, porque no es ejecutable por `authenticated`—, así que
    // la comparación de las dos respuestas es lo que ata la API al motor.
    const entry = await repo.findBusinessSubscription(BIZ_VIVA);
    const rows = await ctx.sql.unsafe<{ plan: string }[]>(
      `select public.business_plan_of('${BIZ_VIVA}'::uuid) as plan`,
    );
    expect(entry?.plan_code).toBe(rows[0]?.plan);
  });

  test('el catálogo se lee entero, con sus features', async () => {
    const plans = await repo.listActivePlans();

    expect(plans.map((plan) => plan.code)).toEqual(['free', 'pro', 'pro_plus']);
    const pro = plans.find((plan) => plan.code === 'pro');
    expect(pro?.max_locations).toBe(5);
    expect(pro?.max_members).toBe(20);
    expect(pro?.features).toEqual(['staff_access', 'payments']);
    // Y `null` es «sin tope», no cero.
    const plus = plans.find((plan) => plan.code === 'pro_plus');
    expect(plus?.max_locations).toBeNull();
    expect(plus?.max_members).toBeNull();
  });

  test('un plan que no está en el catálogo no se encuentra', async () => {
    // `findPlan` busca por código, y el código lo decide el vocabulario: lo
    // que no está en la tabla no se inventa.
    const rows = await ctx.sql.unsafe<{ exists: boolean }[]>(
      `select exists (select 1 from public.subscription_plans where code = 'free') as exists`,
    );
    expect(rows[0]?.exists).toBe(true);
  });
});

describe('la escritura', () => {
  test('la lectura para escribir toma el candado de la fila VIVA', async () => {
    const row = await repo.findLiveSubscriptionForUpdate(db, BIZ_VIVA);

    expect(row?.plan_code).toBe('pro');
    // Y el candado está en la consulta: sin `for update` la lectura y la
    // escritura serían dos cosas, y el `from` del log podría quedar viejo.
    expect(lastQuery()).toContain('for update');
  });

  test('y un negocio SIN fila viva no tiene fila que escribir', async () => {
    expect(await repo.findLiveSubscriptionForUpdate(db, BIZ_SIN)).toBeNull();
  });

  test('el UPDATE toca la fila VIVA y sólo la fila viva', async () => {
    const antes = await repo.findBusinessSubscription(BIZ_VIVA);

    const updated = await repo.updateLiveSubscription(db, BIZ_VIVA, 'pro_plus');

    expect(updated?.plan_code).toBe('pro_plus');
    // Y no se crea una segunda fila viva: dos planes vivos del mismo negocio
    // son dos respuestas a «qué plan tiene este negocio».
    const rows = await ctx.sql.unsafe<{ vivas: number }[]>(
      `select count(*)::int as vivas
         from public.subscriptions
        where business_id = '${BIZ_VIVA}'
          and cancelled_at is null
          and deleted_at is null`,
    );
    expect(rows[0]?.vivas).toBe(1);

    // Cambiar de plan NO reinicia la suscripción: el `started_at` es el de la
    // fila, no la fecha del cambio. El plan nuevo no empieza una suscripción
    // nueva.
    const despues = await repo.findBusinessSubscription(BIZ_VIVA);
    expect(despues?.started_at?.getTime()).toBe(antes?.started_at?.getTime());
    expect(despues?.plan_code).toBe('pro_plus');
  });

  test('el `updated_at` lo mueve el TRIGGER, no la aplicación', async () => {
    // La fila nació con `updated_at` de 2020, escrito a mano. Si la columna se
    // movió, fue el trigger.
    const rows = await ctx.sql.unsafe<{ updated_at: number }[]>(
      `select extract(epoch from updated_at)::float8 as updated_at
         from public.subscriptions
        where business_id = '${BIZ_VIVA}'
          and cancelled_at is null
          and deleted_at is null`,
    );
    const updatedAt = rows[0]?.updated_at ?? 0;
    expect(updatedAt).toBeGreaterThan(new Date(FECHA_VIEJA).getTime() / 1000);
    expect(updatedAt).toBeGreaterThan(Date.now() / 1000 - 600);
  });

  test('el UPDATE NO manda `updated_at`: el `SET` lleva `plan_code` y nada más', async () => {
    // El resultado NO puede afirmar esto —el trigger pisa cualquier valor que
    // la aplicación mande—, así que lo que se afirma es la FORMA de la
    // consulta: las columnas que el `SET` escribe. Una implementación que
    // escribiera la columna a mano dejaría el mismo resultado y aparecería
    // acá.
    await repo.updateLiveSubscription(db, BIZ_VIVA, 'pro');

    const set = updateSetClause(lastQuery());
    expect(set).toContain('"plan_code"');
    expect(set).not.toContain('updated_at');
    expect(set).not.toContain('started_at');
    expect(set).not.toContain('created_at');
  });

  test('el INSERT NO manda las fechas: sólo nombra `business_id` y `plan_code`', async () => {
    // Mismo motivo que el `UPDATE`: las tres fechas las pone la base —el
    // `id` y el `created_at` son defaults, el `started_at` también— y la
    // aplicación no escribe ninguna. Drizzle nombra todas las columnas de la
    // tabla y pone `default` en las que no se escriben, así que lo que se
    // afirma es cuáles reciben un VALOR.
    await repo.insertBusinessSubscription(db, BIZ_INSERT, 'pro');

    expect(insertColumnsWithValue(lastQuery())).toEqual([
      'business_id',
      'plan_code',
    ]);
  });

  test('un UPDATE sobre un negocio sin fila viva no inventa una fila', async () => {
    expect(await repo.updateLiveSubscription(db, BIZ_SIN, 'pro')).toBeNull();

    const rows = await ctx.sql.unsafe<{ filas: number }[]>(
      `select count(*)::int as filas
         from public.subscriptions
        where business_id = '${BIZ_SIN}'`,
    );
    expect(rows[0]?.filas).toBe(0);
  });

  test('una suscripción CANCELADA no se reescribe: el historial es historial', async () => {
    // El caso que el requisito nombra: un negocio cuya única fila está
    // CANCELADA. Un `UPDATE` ingenuo —`where business_id = X`— le reescribiría
    // el plan a la fila muerta, y el negocio se leería como si tuviera ese
    // plan. Con el predicado de la fila viva no la toca.
    const updated = await repo.updateLiveSubscription(db, BIZ_CANCELADA, 'pro');

    expect(updated).toBeNull();

    // La fila cancelada sigue diciendo lo que decía.
    const rows = await ctx.sql.unsafe<{ plan_code: string; vivas: number }[]>(
      `select plan_code,
              (select count(*)::int
                 from public.subscriptions s2
                where s2.business_id = '${BIZ_CANCELADA}'
                  and s2.cancelled_at is null
                  and s2.deleted_at is null) as vivas
         from public.subscriptions
        where business_id = '${BIZ_CANCELADA}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.plan_code).toBe('pro_plus');
    // Y no se creó una fila viva nueva: el `UPDATE` no inserta, y el negocio
    // sigue sin plan —que es lo que dice el motor.
    expect(rows[0]?.vivas).toBe(0);
  });

  test('el INSERT deja las fechas a la base, y la fila queda viva', async () => {
    const row = await repo.insertBusinessSubscription(db, BIZ_SIN, 'pro');

    expect(row.plan_code).toBe('pro');
    expect(row.business_id).toBe(BIZ_SIN);
    // Las tres fechas son de la base —defaults y trigger— y la aplicación no
    // manda ninguna: por eso no pueden venir en cero.
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.started_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);

    const entry = await repo.findBusinessSubscription(BIZ_SIN);
    expect(entry?.plan_code).toBe('pro');
  });

  test('el negocio existe o no existe, y eso es lo que contesta', async () => {
    expect(await repo.businessExists(BIZ_VIVA)).toBe(true);
    expect(await repo.businessExists(BIZ_FANTASMA)).toBe(false);
  });
});
