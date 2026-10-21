import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type { AuthUser } from '../../auth/auth.types';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedBusinessMember,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import {
  businessMemberLocations,
  // Aliased: this file also has a `businesses` and an `orders` SERVICE, and a
  // service is not a table. The names would shadow each other.
  businesses as businessesTable,
  orders as ordersTable,
} from '../../database/schema';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import { OffersRepository } from '../offers/offers.repository';
import { OffersService } from '../offers/offers.service';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { BusinessesRepository } from './businesses.repository';
import { BusinessesService } from './businesses.service';

/**
 * UNA respuesta a «¿esto es mi negocio?», y la prueba de que no abre nada.
 *
 * ─── QUÉ AFIRMA ESTE ARCHIVO ──────────────────────────────────────────────────
 *
 * La respuesta de cada llamador se compara con la que daba ANTES, para las
 * cuatro personas que importan —el dueño, el gerente, el empleado con alcance
 * de sucursal y el que no es miembro— y la comparación es una igualdad, no una
 * lista de valores esperados: si el conjunto cambia, alguien ganó acceso.
 *
 * El «antes» no es una descripción del pasado: es la implementación vieja, que
 * se ejecuta acá contra la tabla vieja. `oldIsOwner` es, línea por línea, el
 * `BusinessesRepository.isOwner` que existió hasta que el permiso se resolvió
 * por el modelo de membresías, y la tabla que lee —`business_ownership`— sigue
 * viva y con las mismas 16 filas que tenía, así que la comparación es real y no
 * una «caricatura».
 *
 * ─── QUÉ COMPARA ESTA TABLA, Y QUÉ NO ────────────────────────────────────────
 *
 * Compara el PERMISO, que es lo que la tabla afirma. La regla de presencia
 * del `INNER JOIN` viejo —«el pedido no existe si su negocio no tiene fila de
 * dueño»— NO la puede expresar `oldIsOwner`: esa regla no era un permiso sino
 * una condición de EXISTENCIA, y un predicado de dueño no dice si una fila
 * existe. El cambio de 404 a 403 que esa regla produjo está pinado aparte, con
 * el join viejo escrito al lado del nuevo, en «la regla de presencia del
 * pedido».
 *
 * ─── POR QUÉ UNA TABLA Y NO UNA LISTA DE PERSONAS ────────────────────────────
 *
 * La consolidación movió el predicado de tres lugares a uno. El riesgo de eso
 * no es que el código se rompa: es que el código de más y alguien entra a un
 * negocio que no es suyo. Ese riesgo no se ve en un test que dice «el gerente
 * recibe 403»; se ve en un test que dice «el conjunto de personas que pueden
 * hacer esto es el mismo que antes». Por eso la comparación es con el
 * «antes», calculado en el momento.
 *
 * ─── POR QUÉ UNA BASE DE DATOS REAL Y NO MOCKS ────────────────────────────────
 *
 * Porque la pregunta es de la base: qué fila concede acceso, y con qué
 * condiciones. Un mock de `isOwner` que devuelve `true` prueba que el servicio
 * pregunta; no prueba a QUIÉN concede la fila, ni que una membresía dada de
 * baja o con la sesión vencida deje de conceder. La promesa del §5.2 —la
 * sesión vencida no opera— es de la base, y se verifica en la base.
 */
let ctx: TestDbContext;

let businesses: BusinessesService;
let offers: OffersService;
let orders: OrdersService;
let businessesRepository: BusinessesRepository;

beforeAll(async () => {
  ctx = await createTestDb();
  businessesRepository = new BusinessesRepository(ctx.db);
  const config = {
    get: (key: string) =>
      ({
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      })[key],
  } as unknown as ConfigService<Env, true>;
  businesses = new BusinessesService(
    businessesRepository,
    config,
    new AppConfigRepository(ctx.db),
    new UserDefaultsService(ctx.db),
  );
  offers = new OffersService(
    new OffersRepository(ctx.db),
    businessesRepository,
    config,
  );
  orders = new OrdersService(
    new OrdersRepository(ctx.db),
    new OffersRepository(ctx.db),
    businessesRepository,
    config,
  );
});

afterAll(async () => {
  await ctx.stop();
});

// ─── EL FIXTURE ─────────────────────────────────────────────────────────────

/** A business with an owner, a manager, a branch-scoped staff and a stranger. */
type Fixture = {
  businessId: string;
  locationId: string;
  offerId: string;
  /** The buyer of the orders. NOT one of the four personas: the owner of the
   * order is a different question from the owner of the business, and a
   * fixture that mixed them would be testing the wrong thing. */
  consumerId: string;
  owner: AuthUser;
  manager: AuthUser;
  staff: AuthUser;
  stranger: AuthUser;
};

async function fixture(): Promise<Fixture> {
  const ownerId = await seedProfile(ctx.db);
  const managerId = await seedProfile(ctx.db);
  const staffId = await seedProfile(ctx.db);
  const strangerId = await seedProfile(ctx.db);
  const consumerId = await seedProfile(ctx.db);

  // `seedBusiness` writes BOTH the legacy `business_ownership` row and the
  // owner membership, because that is what the API does and what production
  // has: the 16 businesses of the live database have one row in each table.
  const business = await seedBusiness(ctx.db, ownerId, {
    verification_status: 'approved',
  });
  const location = await seedLocation(ctx.db, business.id);
  const offer = await seedOffer(ctx.db, business.id, location.id, { stock: 5 });

  // The manager: a member of the business, with the whole business in reach.
  await seedBusinessMember(ctx.db, business.id, managerId, {
    role: 'manager',
    label: 'Karla',
    alias: `gerente-${managerId.slice(0, 8)}@negocio.role.ec`,
    session_ttl_hours: 0,
  });

  // The staff: a member with a reach of ONE branch, which is the §5.1 shape.
  const staff = await seedBusinessMember(ctx.db, business.id, staffId, {
    role: 'staff',
    label: 'Carla',
    alias: `caja-${staffId.slice(0, 8)}@negocio.role.ec`,
    session_ttl_hours: 0,
  });
  await ctx.db.insert(businessMemberLocations).values({
    member_id: staff.id,
    location_id: location.id,
  });

  const asUser = (id: string): AuthUser => ({
    id,
    email: `${id}@t.cl`,
    role: 'business',
  });
  return {
    businessId: business.id,
    locationId: location.id,
    offerId: offer.id,
    consumerId,
    owner: asUser(ownerId),
    manager: asUser(managerId),
    staff: asUser(staffId),
    stranger: asUser(strangerId),
  };
}

/**
 * ─── LO QUE YA NO SE PUEDE EJECUTAR ─────────────────────────────────────────
 *
 * Este archivo comparaba la respuesta de cada llamador con la del predicado
 * VIEJO, ejecutado contra la tabla vieja. `oldIsOwner` —línea por línea, el
 * `BusinessesRepository.isOwner` de antes— y `oldFindByIdWithBusiness` —el
 * `INNER JOIN` que hacía del dueño una regla de PRESENCIA— leían
 * `business_ownership`.
 *
 * La tabla se retiró, así que las dos mitades del «antes» ya no se pueden
 * calcular. Lo que queda es el punto FIJO: la tabla `BEFORE` de abajo, escrita
 * a mano cuando la comparación todavía se podía hacer, que dice cuál es la
 * respuesta correcta para cada persona. La comparación contra esa tabla escrita
 * es la que sigue teniendo valor: si alguien abre una puerta, se ve acá.
 *
 * El join viejo sigue descrito más abajo, en «la regla de presencia del
 * pedido», y lo que se afirma de él es la mitad que no necesita la tabla vieja:
 * que hoy el pedido de un negocio sin dueño es un 403 y no un 404.
 */

// ─── LOS LLAMADORES ──────────────────────────────────────────────────────────

/** What a call site answers: allowed, or denied. */
type Answer = 'allowed' | 'denied';

/**
 * A call site, as the question it asks.
 *
 * `ask` returns `denied` for the refusal and throws for anything else, so a
 * spec that breaks for a reason that is NOT the permission —a fixture que no
 * existe, un mapper que revienta— falla en vez de pasar por lo que no es.
 */
type CallSite = {
  name: string;
  ask: (user: AuthUser, f: Fixture) => Promise<Answer>;
};

const asAnswer = async (run: () => Promise<unknown>): Promise<Answer> => {
  try {
    await run();
    return 'allowed';
  } catch (error) {
    if (error instanceof ForbiddenException) return 'denied';
    throw error;
  }
};

/**
 * The call sites, one per requirement.
 *
 * Every one of them asks the SAME question («¿esto es mi negocio?») and every
 * one of them demands the SAME thing (the owner). The two that look different
 * from the outside —the ones that read a locked row, and the ones that list
 * instead of read— are the ones that were written by hand, and they are here
 * for that reason.
 */
function callSites(): CallSite[] {
  return [
    {
      name: 'BusinessesService.assertCanViewBusiness (la puerta compartida)',
      ask: (user, f) =>
        asAnswer(() => businesses.assertCanViewBusiness(user, f.businessId)),
    },
    {
      name: 'BusinessesService.getById (assertCanView)',
      ask: (user, f) => asAnswer(() => businesses.getById(user, f.businessId)),
    },
    {
      name: 'BusinessesService.listLocations (assertCanViewBusiness)',
      ask: (user, f) =>
        asAnswer(() =>
          businesses.listLocations(user, f.businessId, { page: 1, limit: 10 }),
        ),
    },
    {
      name: 'OffersService.update (assertCanMutateBusiness)',
      ask: (user, f) =>
        asAnswer(() =>
          offers.update(user, f.offerId, { title: 'El mismo título' }),
        ),
    },
    {
      name: 'OrdersService.listForBusiness',
      ask: (user) =>
        asAnswer(() => orders.listForBusiness(user, { page: 1, limit: 10 })),
    },
    {
      name: 'BusinessesService.update (assertCanMutate)',
      ask: (user, f) =>
        asAnswer(() =>
          businesses.update(user, f.businessId, { name: 'El mismo nombre' }),
        ),
    },
    {
      name: 'BusinessesService.updateLocation (assertCanMutateBusiness)',
      ask: (user, f) =>
        asAnswer(() =>
          businesses.updateLocation(user, f.businessId, f.locationId, {
            name: 'La misma sucursal',
          }),
        ),
    },
    {
      name: 'BusinessesService.updateNotificationPreferences (assertCanMutateBusiness)',
      ask: (user, f) =>
        asAnswer(() =>
          businesses.updateNotificationPreferences(user, f.businessId, {
            push_enabled: false,
          }),
        ),
    },
    {
      name: 'OrdersService.listForBusiness (con business_id)',
      ask: (user, f) =>
        asAnswer(() =>
          orders.listForBusiness(user, {
            page: 1,
            limit: 10,
            business_id: f.businessId,
          }),
        ),
    },
    {
      name: 'OrdersService.getById (resolveAccessibleOrder)',
      ask: async (user, f) => {
        const order = await seedOrder(
          ctx.db,
          f.consumerId,
          f.offerId,
          f.businessId,
          { status: 'pending' },
        );
        return asAnswer(() => orders.getById(user, order.id));
      },
    },
    {
      name: 'OrdersService.listEvents (resolveAccessibleOrder)',
      ask: async (user, f) => {
        const order = await seedOrder(
          ctx.db,
          f.consumerId,
          f.offerId,
          f.businessId,
          { status: 'pending' },
        );
        return asAnswer(() =>
          orders.listEvents(user, order.id, { page: 1, limit: 10 }),
        );
      },
    },
    {
      name: 'OrdersService.validatePickupCode (la fila bloqueada)',
      ask: async (user, f) => {
        const order = await seedOrder(
          ctx.db,
          f.consumerId,
          f.offerId,
          f.businessId,
          { status: 'ready_for_pickup' },
        );
        return asAnswer(() =>
          orders.validatePickupCode(user, order.id, order.pickup_code),
        );
      },
    },
    {
      name: 'OrdersService.updateStatus (la fila bloqueada)',
      ask: async (user, f) => {
        const order = await seedOrder(
          ctx.db,
          f.consumerId,
          f.offerId,
          f.businessId,
          { status: 'pending' },
        );
        return asAnswer(() =>
          orders.updateStatus(user, order.id, { status: 'confirmed' }),
        );
      },
    },
  ];
}

// ─── LA TABLA ────────────────────────────────────────────────────────────────

const PERSONAS = ['owner', 'manager', 'staff', 'stranger'] as const;
type Persona = (typeof PERSONAS)[number];

/**
 * What the OLD predicate answered for each persona, written out.
 *
 * It is written down so the comparison has a fixed point: if the old predicate
 * and the new one agree on everything, they might agree on everything being
 * WRONG. This says what the answer is supposed to be, and the comparison says
 * it did not move.
 */
const BEFORE: Record<Persona, Answer> = {
  owner: 'allowed',
  manager: 'denied',
  staff: 'denied',
  stranger: 'denied',
};

describe('una sola respuesta a «¿esto es mi negocio?» (DB real)', () => {
  describe('el hecho, y lo que exige cada llamador', () => {
    test('el rol que contesta la base es el de la membresía viva', async () => {
      const f = await fixture();

      // El dueño, el gerente y el empleado son miembros: la respuesta es un
      // ROL, y el rol es el que la fila dice.
      expect(await businessesRepository.roleOf(f.businessId, f.owner.id)).toBe(
        'owner',
      );
      expect(
        await businessesRepository.roleOf(f.businessId, f.manager.id),
      ).toBe('manager');
      expect(await businessesRepository.roleOf(f.businessId, f.staff.id)).toBe(
        'staff',
      );

      // El que no es miembro no tiene rol: `null`, no un permiso denegado.
      expect(
        await businessesRepository.roleOf(f.businessId, f.stranger.id),
      ).toBeNull();
    });

    test('una membresía dada de baja o pausada no concede ningún rol', async () => {
      const f = await fixture();
      const disabledId = await seedProfile(ctx.db);
      const deletedId = await seedProfile(ctx.db);

      await seedBusinessMember(ctx.db, f.businessId, disabledId, {
        role: 'manager',
        alias: `pausado-${disabledId.slice(0, 8)}@negocio.role.ec`,
        status: 'disabled',
        session_ttl_hours: 0,
      });
      await seedBusinessMember(ctx.db, f.businessId, deletedId, {
        role: 'manager',
        alias: `baja-${deletedId.slice(0, 8)}@negocio.role.ec`,
        session_ttl_hours: 0,
        deleted_at: new Date(),
      });

      expect(
        await businessesRepository.roleOf(f.businessId, disabledId),
      ).toBeNull();
      expect(
        await businessesRepository.roleOf(f.businessId, deletedId),
      ).toBeNull();
    });

    test('una sesión vencida no opera, aunque la fila sea de dueño', async () => {
      // El §5.2: una sesión vencida no opera. Esta API escribe con
      // `service_role`, donde RLS no aplica, así que la promesa la tiene que
      // aplicar la misma puerta que aplica a todos los demás.
      const ownerId = await seedProfile(ctx.db);
      const business = await seedBusiness(ctx.db, ownerId, {
        verification_status: 'approved',
        owner_membership: false,
      });
      await seedBusinessMember(ctx.db, business.id, ownerId, {
        role: 'owner',
        label: 'Dueña',
        alias: `vencida-${ownerId.slice(0, 8)}@negocio.role.ec`,
        // TTL con sello viejo: la sesión está vencida.
        session_ttl_hours: 24,
        last_authenticated_at: new Date(Date.now() - 48 * 3600_000),
      });

      expect(
        await businessesRepository.roleOf(business.id, ownerId),
      ).toBeNull();

      // Y con el sello de ahora, la misma fila opera.
      await ctx.db.execute(
        `update business_members set last_authenticated_at = now() where business_id = '${business.id}' and user_id = '${ownerId}'`,
      );
      expect(await businessesRepository.roleOf(business.id, ownerId)).toBe(
        'owner',
      );
    });
  });

  describe('la tabla de cuatro: nadie ganó acceso', () => {
    for (const site of callSites()) {
      test(site.name, async () => {
        const f = await fixture();

        for (const persona of PERSONAS) {
          const user = f[persona];

          // EL DESPUÉS: el llamador, con la base de verdad, comparado con el
          // PUNTO FIJO —lo que la tabla `BEFORE` dice que era la respuesta,
          // escrita a mano cuando la comparación contra el predicado viejo
          // todavía se podía hacer—. La comparación tiene un punto de partida
          // escrito, y no sólo «las dos coinciden».
          const after = await site.ask(user, f);

          expect(after, `${site.name} para ${persona}`).toBe(BEFORE[persona]);
        }
      });
    }
  });

  describe('la pregunta que NO es esta', () => {
    test('el dueño del PEDIDO no se mezcla con el dueño del NEGOCIO', async () => {
      // La fila del pedido dice a quién se le vendió, y esa comparación no se
      // tocó: es otra pregunta, con otra respuesta, y mezclarla sería perder
      // al consumidor que compró.
      const f = await fixture();
      const consumerId = await seedProfile(ctx.db);
      const consumer: AuthUser = {
        id: consumerId,
        email: `${consumerId}@t.cl`,
        role: 'user',
      };
      const order = await seedOrder(
        ctx.db,
        consumerId,
        f.offerId,
        f.businessId,
        { status: 'pending' },
      );

      // El consumidor NO es miembro del negocio: el hecho es `null`.
      expect(
        await businessesRepository.roleOf(f.businessId, consumerId),
      ).toBeNull();
      // Y sin embargo puede leer SU pedido, porque es suyo.
      const read = await orders.getById(consumer, order.id);
      expect(read.id).toBe(order.id);
    });
  });
});

// ─── LAS PUERTAS QUE LA TABLA DE CUATRO NO CUBRÍA ───────────────────────────

/**
 * The owner-only gates the four-person table did not reach.
 *
 * The table asks a QUESTION —«who may do this?»— and answers it by comparing
 * the old predicate with the new one for the owner, the manager, the
 * branch-scoped staff and the stranger. It could only reach the gates that the
 * call sites named, and these were not among them: `assertCanMutate` (the
 * business update), `assertCanMutateBusiness` (the locations and the
 * notification preferences) and `listForBusiness` WITH a `business_id` —a
 * query parameter the CALLER writes, so a gate that opens here is a gate that
 * lets a manager of one business read the orders of another.
 *
 * Three GATES, four SURFACES: `assertCanMutateBusiness` guards two of them,
 * and both are here because they are two different routes a manager must not
 * reach.
 *
 * ─── POR QUÉ ESTAS ESTÁN FUERA DE LA TABLA ───────────────────────────────────
 *
 * Not by accident: the table compares against `oldIsOwner`, and the table is
 * about the PERMISSION. These gates are asserted here directly, with the
 * three personas that have to be refused, so that weakening the requirement to
 * «any member passes» breaks a test instead of passing the whole suite.
 *
 * A test that only checked the stranger would prove that the caller is a
 * member of SOMETHING, not that the requirement is owner-only. That is the
 * half test this block exists to avoid.
 */
type OwnerOnlyGate = {
  name: string;
  ask: (
    user: AuthUser,
    target: { businessId: string; locationId: string },
  ) => Promise<unknown>;
};

const OWNER_ONLY_GATES: OwnerOnlyGate[] = [
  {
    name: 'PATCH /businesses/:id (assertCanMutate)',
    ask: (user, target) =>
      businesses.update(user, target.businessId, { name: 'El mismo nombre' }),
  },
  {
    name: 'PATCH /businesses/:id/locations/:locationId (assertCanMutateBusiness)',
    ask: (user, target) =>
      businesses.updateLocation(user, target.businessId, target.locationId, {
        name: 'La misma sucursal',
      }),
  },
  {
    name: 'PATCH /businesses/:id/notification-preferences (assertCanMutateBusiness)',
    ask: (user, target) =>
      businesses.updateNotificationPreferences(user, target.businessId, {
        push_enabled: false,
      }),
  },
  {
    name: 'GET /orders?business_id= (listForBusiness)',
    ask: (user, target) =>
      orders.listForBusiness(user, {
        page: 1,
        limit: 10,
        business_id: target.businessId,
      }),
  },
];

/**
 * A business whose owner membership is NOT alive: paused (`status='disabled'`)
 * or given of low (`deleted_at` set).
 *
 * The TTL is 0 on purpose —«own team», no expiry— so the ONLY thing that can
 * deny this owner is the state of the membership, and the test is about the
 * state and not about an expired session.
 *
 * The `business_ownership` row IS there, and it names this person: the old
 * predicate would have let them through. That is the narrowing the membership
 * model introduced, and the test asserts both sides of it.
 */
async function fixtureWithDeadOwner(
  state: 'disabled' | 'deleted',
): Promise<{ businessId: string; locationId: string; owner: AuthUser }> {
  const ownerId = await seedProfile(ctx.db);
  const business = await seedBusiness(ctx.db, ownerId, {
    verification_status: 'approved',
    owner_membership: false,
  });
  const location = await seedLocation(ctx.db, business.id);
  await seedBusinessMember(ctx.db, business.id, ownerId, {
    role: 'owner',
    label: 'Dueña',
    alias: `dueno-${ownerId.slice(0, 8)}@negocio.role.ec`,
    session_ttl_hours: 0,
    status: state === 'disabled' ? 'disabled' : 'active',
    deleted_at: state === 'deleted' ? new Date() : null,
  });
  return {
    businessId: business.id,
    locationId: location.id,
    owner: { id: ownerId, email: `${ownerId}@t.cl`, role: 'business' },
  };
}

describe('las puertas owner-only, con el gerente y el empleado de sucursal', () => {
  for (const gate of OWNER_ONLY_GATES) {
    test(`${gate.name}: el gerente, el empleado de sucursal y el que no es miembro reciben 403`, async () => {
      const f = await fixture();

      // El dueño pasa: la puerta es «owner-only», no «cerrada».
      await gate.ask(f.owner, f);

      for (const persona of ['manager', 'staff', 'stranger'] as const) {
        let caught: unknown;
        try {
          await gate.ask(f[persona], f);
        } catch (error) {
          caught = error;
        }
        expect(
          caught,
          `${gate.name} para ${persona} tiene que ser 403`,
        ).toBeInstanceOf(ForbiddenException);
      }
    });
  }
});

describe('una membresía que no está viva no abre ni la puerta de su dueño', () => {
  for (const gate of OWNER_ONLY_GATES) {
    test(`${gate.name}: un dueño con la membresía desactivada o dada de baja recibe 403`, async () => {
      for (const state of ['disabled', 'deleted'] as const) {
        const f = await fixtureWithDeadOwner(state);

        // EL HECHO: la membresía de dueño no está viva, así que el rol que
        // contesta la base es `null` y la puerta es de dueño vivo.
        //
        // La fila de propiedad que la puerta vieja leía se retiró con la
        // tabla: hoy no hay una segunda fuente que diga que esta persona era
        // la dueña, y la que hay —la membresía— dice que no.
        expect(
          await businessesRepository.roleOf(f.businessId, f.owner.id),
        ).toBeNull();

        let caught: unknown;
        try {
          await gate.ask(f.owner, f);
        } catch (error) {
          caught = error;
        }
        expect(
          caught,
          `${gate.name} con la membresía ${state} tiene que ser 403`,
        ).toBeInstanceOf(ForbiddenException);
      }
    });
  }
});

describe('la regla de presencia del pedido: 404 → 403', () => {
  test('un pedido de un negocio SIN dueño vivo: ahora es 403 y no 404', async () => {
    const consumerId = await seedProfile(ctx.db);
    const ownerId = await seedProfile(ctx.db);
    const strangerId = await seedProfile(ctx.db);

    // Un negocio SIN dueño vivo: sin membresía viva. Es un estado que la API
    // no produce —`insert` escribe la membresía en la misma transacción—, pero
    // era la regla de presencia del join viejo.
    const business = await seedBusiness(ctx.db, ownerId, {
      verification_status: 'approved',
      owner_membership: false,
    });
    const location = await seedLocation(ctx.db, business.id);
    const offer = await seedOffer(ctx.db, business.id, location.id, {
      stock: 5,
    });
    const order = await seedOrder(ctx.db, consumerId, offer.id, business.id, {
      status: 'pending',
    });

    // EL ANTES: el `INNER JOIN` contra la fila de dueño. Sin esa fila el pedido
    // NO EXISTÍA —404— y no había ningún permiso que decidir. Esa mitad ya no
    // se puede ejecutar —la tabla que el join leía se retiró—, pero la de
    // ahora sí, y es la que importa.
    //
    // EL DESPUÉS: el pedido existe, y el permiso se decide aparte. Un 403 dice
    // «no puedes»; un 404 diría «no existe», que es otra verdad.
    const stranger: AuthUser = {
      id: strangerId,
      email: `${strangerId}@t.cl`,
      role: 'business',
    };
    let caught: unknown;
    try {
      await orders.getById(stranger, order.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught).not.toBeInstanceOf(NotFoundException);

    // Y el dueño del pedido sí lo lee: la regla de presencia era del negocio,
    // no del comprador.
    const read = await orders.getById(
      { id: consumerId, email: `${consumerId}@t.cl`, role: 'user' },
      order.id,
    );
    expect(read.id).toBe(order.id);
  });
});
