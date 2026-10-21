import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  createSupabaseTestDb,
  type SupabaseTestDb,
} from '../../../test/supabase-platform';
import { StaffRepository } from './staff.repository';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CABLE CON LA BASE, CONTRA LA BASE DE VERDAD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Este archivo existe por una razón muy chica y muy concreta: las dos
 * preguntas del alcance las contesta la base, y el repositorio las hace con
 * `db.transaction` + `set_config('request.jwt.claims', …)`. Los mocks de
 * `staff.service.spec.ts` no ven nada de eso, así que un error de FORMA —que
 * la fila que vuelve no sea la que se cree— no lo encuentra nadie.
 *
 * ─── POR QUÉ ESTA BASE Y NO EL ESPEJO DE DRIZZLE ────────────────────────────
 *
 * `apps/api/test/db.ts` construye la base desde `apps/api/drizzle/`, y ese
 * espejo no tiene las funciones de `supabase/migrations/`: no tiene
 * `business_member_reaches_member` ni `business_member_covers_locations` ni
 * `business_member_session_state`. La base que replayea el ledger es la única
 * donde las dos preguntas se pueden hacer de verdad.
 *
 * ─── EL DATO QUE SE PIDE, Y POR QUÉ NO SE PIDE EL ROL ───────────────────────
 *
 * El repositorio declara QUIÉN PREGUNTA con `request.jwt.claims`, y por eso
 * la respuesta es la de esa persona y no la de la dueña de la base. Estas
 * pruebas lo comprueban preguntando con DOS personas distintas sobre el mismo
 * negocio: si la identidad no llegara, las dos respostas serían la misma.
 */

let ctx: SupabaseTestDb;
let repo: StaffRepository;
let client: postgres.Sql;

const BIZ = 'b1000000-0000-4000-8000-000000000001';
const LOC_A = 'b2000000-0000-4000-8000-000000000001';
const LOC_B = 'b2000000-0000-4000-8000-000000000002';

const USER_OWNER = 'b3000000-0000-4000-8000-000000000001';
const USER_MANAGER = 'b3000000-0000-4000-8000-000000000002';
const USER_STAFF = 'b3000000-0000-4000-8000-000000000003';

const M_OWNER = 'b4000000-0000-4000-8000-000000000001';
const M_MANAGER = 'b4000000-0000-4000-8000-000000000002';
const M_STAFF = 'b4000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  ctx = await createSupabaseTestDb();
  client = postgres(ctx.connectionString, { prepare: false });
  repo = new StaffRepository(drizzle({ client }));

  await ctx.sql.begin(async (tx) => {
    for (const id of [USER_OWNER, USER_MANAGER, USER_STAFF]) {
      await tx.unsafe(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ('${id}', 'alcance-repo-${id}@test', '{"role":"business"}'::jsonb)
         on conflict (id) do nothing`,
      );
    }

    await tx.unsafe(
      `insert into public.businesses (id, name, type, slug)
       values ('${BIZ}', 'Alcance Repo', 'restaurant', 'alcance-repo')`,
    );

    // El plan se escribe a mano: sin esta suscripción el negocio se lee como
    // `free`, y `free` admite UNA sucursal y DOS miembros.
    await tx.unsafe(
      `insert into public.subscriptions (business_id, plan_code, deleted_at)
       values ('${BIZ}', 'pro', null)`,
    );

    await tx.unsafe(
      `insert into public.business_locations (id, business_id, name, address, latitude, longitude)
       values ('${LOC_A}', '${BIZ}', 'A', 'Street', 40.41680000, -3.70380000),
              ('${LOC_B}', '${BIZ}', 'B', 'Street2', 40.41680000, -3.70380000)`,
    );

    await tx.unsafe(
      `insert into public.business_members
         (id, business_id, user_id, role, label, alias, status, session_ttl_hours, last_authenticated_at, created_at, deleted_at)
       values
         ('${M_OWNER}', '${BIZ}', '${USER_OWNER}', 'owner', 'Dueña', 'alcance-repo-owner@test', 'active', 0, null, now(), null),
         ('${M_MANAGER}', '${BIZ}', '${USER_MANAGER}', 'manager', 'Gerente', 'alcance-repo-manager@test', 'active', 24, now(), now(), null),
         ('${M_STAFF}', '${BIZ}', '${USER_STAFF}', 'staff', 'Empleada', 'alcance-repo-staff@test', 'active', 24, now(), now(), null)`,
    );

    await tx.unsafe(
      `insert into public.business_member_locations (member_id, location_id, deleted_at)
       values ('${M_MANAGER}', '${LOC_A}', null),
              ('${M_STAFF}', '${LOC_A}', null)`,
    );
  });
});

afterAll(async () => {
  await client.end();
  await ctx.stop();
});

describe('las dos preguntas del alcance, contra la base de verdad', () => {
  test('reachesMember responde POR EL QUE PREGUNTA, no por la dueña de la base', async () => {
    // El dueño alcanza a todos los accesos de su negocio, y el gerente de {A}
    // alcanza al empleado de {A} pero no al dueño.
    expect(await repo.reachesMember(BIZ, M_STAFF, USER_OWNER)).toBe(true);
    expect(await repo.reachesMember(BIZ, M_OWNER, USER_OWNER)).toBe(true);
    expect(await repo.reachesMember(BIZ, M_OWNER, USER_MANAGER)).toBe(false);
    expect(await repo.reachesMember(BIZ, M_STAFF, USER_MANAGER)).toBe(true);
  });

  test('coversLocations responde lo mismo, y el conjunto vacío no lo cubre nadie salvo el dueño', async () => {
    expect(await repo.coversLocations(BIZ, [LOC_A], USER_MANAGER)).toBe(true);
    expect(await repo.coversLocations(BIZ, [LOC_B], USER_MANAGER)).toBe(false);
    expect(await repo.coversLocations(BIZ, [], USER_MANAGER)).toBe(false);
    expect(await repo.coversLocations(BIZ, [], USER_OWNER)).toBe(true);
  });

  test('sessionStateAsCaller devuelve el estado del que pregunta', async () => {
    // Este método ya existía, y leía la fila que vuelve de una forma que
    // devolvía `undefined` en TODAS las llamadas: sacaba la primera fila del
    // arreglo y después la indexaba otra vez. La prueba está porque ese
    // error no lo ve ningún mock.
    const state = await repo.sessionStateAsCaller(BIZ, USER_MANAGER);

    expect(state.reason).toBe('ok');
    expect(state.role).toBe('manager');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DERECHO A LA FEATURE DE PERSONAL, Y LAS TRES RESPUESTAS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * La puerta del §5.1 pregunta al catálogo si el negocio puede tener accesos de
 * personal, y la respuesta tiene TRES formas —tiene la feature, no la tiene, o
 * el plan no tiene fila en el catálogo— porque `business_has_feature` contesta
 * `false` para las dos negativas y el motor las separa mirando la fila del
 * plan ANTES de preguntarle por la feature.
 *
 * Estas pruebas miran las tres contra la base de verdad, y las dos últimas
 * ROMPEN el catálogo a propósito y lo vuelven a armar: un doble no puede
 * afirmar nada de esto, y un catálogo roto que se contesta como una negativa
 * del plan manda al dueño a una puerta que no arregla nada.
 */
describe('el derecho del negocio a la feature de personal', () => {
  test('un plan del catálogo que concede la feature', async () => {
    const entitlement = await repo.staffAccessEntitlement(BIZ);

    expect(entitlement).toEqual({ status: 'entitled', plan: 'pro' });
  });

  test('un plan del catálogo que NO concede la feature', async () => {
    // La fila del plan SIGUE AHÍ: lo que falta es la feature. Por eso esto no
    // es un catálogo roto, y la respuesta tiene que ser la del plan —un 422
    // con «subí de plan»—, no la de una avería.
    await ctx.sql.unsafe(
      `delete from public.subscription_plan_features
        where plan_code = 'pro' and feature = 'staff_access'`,
    );
    try {
      const entitlement = await repo.staffAccessEntitlement(BIZ);

      expect(entitlement).toEqual({ status: 'not_entitled', plan: 'pro' });
    } finally {
      await ctx.sql.unsafe(
        `insert into public.subscription_plan_features (plan_code, feature)
         values ('pro', 'staff_access')
         on conflict do nothing`,
      );
    }
  });

  test('un plan SIN fila en el catálogo: el catálogo está roto', async () => {
    // El `on delete cascade` de `subscription_plan_features` se lleva las
    // features con la fila, así que `business_has_feature` contesta `false`
    // —como en el caso de arriba— y las dos noticias son distintas: la fila
    // que falta es la avería.
    await ctx.sql.unsafe(
      `delete from public.subscription_plans where code = 'pro'`,
    );
    try {
      const entitlement = await repo.staffAccessEntitlement(BIZ);

      expect(entitlement).toEqual({
        status: 'plan_not_in_catalogue',
        plan: 'pro',
      });
    } finally {
      await ctx.sql.unsafe(
        `insert into public.subscription_plans
           (code, audience, max_locations, max_members, is_active)
         values ('pro', 'business', 5, 20, true)
         on conflict do nothing`,
      );
      await ctx.sql.unsafe(
        `insert into public.subscription_plan_features (plan_code, feature)
         values ('pro', 'staff_access'), ('pro', 'payments')
         on conflict do nothing`,
      );
    }
  });
});
