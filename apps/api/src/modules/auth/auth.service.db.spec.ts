import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, count, eq, isNull } from 'drizzle-orm';
import { ConflictException } from '@nestjs/common';
import {
  businesses,
  businessFinance,
  businessMemberLocations,
  businessMembers,
  consumerNotificationPreferences,
  deviceTokens,
  marketingPreferences,
  orderEvents,
  orders,
  offers,
  profiles,
  reviews,
  userConsents,
  userPreferences,
} from '../../database/schema';
import {
  createTestDb,
  type TestDbContext,
  type TestDatabase,
} from '../../../test/db';
import {
  seedBusiness,
  seedBusinessMember,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { UserDefaultsService } from '../users/user-defaults.service';
import { AuthAccountRepository } from './auth-account.repository';
import { AuthService } from './auth.service';

let ctx: TestDbContext;

/** Postgres error codes, which Drizzle wraps one level down. */
function sqlErrorCode(error: unknown): string {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.cause?.code ?? candidate?.code ?? 'unknown';
}

/**
 * The constraint Postgres blamed, which is the half the code does not say.
 *
 * `23505` alone says «some unique thing was violated»: this table has TWO unique
 * rules —`(business_id, lower(alias))` and `(business_id, user_id)`— so the code
 * alone cannot say which one fired, and an assertion that names a rule has to
 * read the rule, not the class of the error.
 *
 * The name comes from the driver's own error: `postgres.js` calls it
 * `constraint_name` and Drizzle carries it one level down, in `cause`.
 */
function sqlErrorConstraint(error: unknown): string {
  const candidate = error as {
    constraint?: string;
    constraint_name?: string;
    cause?: { constraint?: string; constraint_name?: string };
  };
  return (
    candidate?.cause?.constraint_name ??
    candidate?.cause?.constraint ??
    candidate?.constraint_name ??
    candidate?.constraint ??
    'unknown'
  );
}

const CONFIG = {
  get: (key: string) =>
    ({
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AUTH_REDIRECT_TO: 'https://app.role.ec/reset',
    })[key],
} as never;

function buildService(seeder: UserDefaultsService): AuthService {
  return new AuthService(
    CONFIG,
    ctx.db,
    seeder,
    { listTemplates: async () => ({ rows: [], total: 0 }) } as never,
    new AuthAccountRepository(ctx.db),
    { verify: async () => ({ sub: '', email: null }) } as never,
  );
}

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

/** Stubs a successful password sign-in for `user`. */
function stubSignIn(service: AuthService, user: Record<string, unknown>): void {
  (service as unknown as { supabaseAnon: unknown }).supabaseAnon = {
    auth: {
      signInWithPassword: async () => ({
        data: { user, session },
        error: null,
      }),
    },
  };
}

async function rowCounts(db: TestDatabase, userId: string) {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId));
  const [preferences] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId));
  const [consumerPreferences] = await db
    .select()
    .from(consumerNotificationPreferences)
    .where(eq(consumerNotificationPreferences.user_id, userId));
  const consents = await db
    .select()
    .from(userConsents)
    .where(eq(userConsents.user_id, userId));
  return {
    profile: profile ? 1 : 0,
    preferences: preferences ? 1 : 0,
    consumerPreferences: consumerPreferences ? 1 : 0,
    consents: consents.length,
  };
}

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.stop();
});

/**
 * The failure window phase 1.5 opens: seeding is a separate step from the
 * `auth.users` INSERT, so an auth user can exist with no profile — and
 * AuthGuard answers 401 to every protected route for an account with no
 * profile. Login repairs it instead of the registration deleting the account.
 */
describe('AuthService.login repairs a missing profile (DB real)', () => {
  test('provisions the default rows and returns the repaired profile', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    stubSignIn(service, {
      id,
      email: `${id}@repair.cl`,
      phone: '+593911111111',
      user_metadata: { full_name: 'Repair Me', role: 'business' },
    });

    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 0,
      preferences: 0,
      consumerPreferences: 0,
      consents: 0,
    });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.user).toEqual({
      id,
      email: `${id}@repair.cl`,
      full_name: 'Repair Me',
      avatar_url: null,
      // The repair honours the allowlisted role from metadata, exactly like
      // the trigger did: an 'admin' would land as 'user'.
      role: 'business',
    });
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 1,
      consumerPreferences: 1,
      consents: 3,
    });
  });

  test('never lets metadata promote an account to admin', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    stubSignIn(service, {
      id,
      email: `${id}@repair.cl`,
      user_metadata: { full_name: 'Root', role: 'admin' },
    });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.user.role).toBe('user');
  });

  test('an account that already has a profile is left alone', async () => {
    const service = buildService(new UserDefaultsService(ctx.db));
    const id = randomUUID();
    await ctx.db.insert(profiles).values({
      id,
      email: `${id}@existing.cl`,
      full_name: 'Already Here',
      role: 'admin',
    });

    stubSignIn(service, {
      id,
      email: `${id}@existing.cl`,
      // Signup metadata must not rewrite a platform-controlled role.
      user_metadata: { full_name: 'Overwritten', role: 'user' },
    });

    const result = await service.login({
      email: `${id}@existing.cl`,
      password: 'password123',
    });

    expect(result.user).toEqual({
      id,
      email: `${id}@existing.cl`,
      full_name: 'Already Here',
      avatar_url: null,
      role: 'admin',
    });
    // No preferences/consents invented for an account the trigger already
    // provisioned: the repair only runs when the profile is missing.
    expect(await rowCounts(ctx.db, id)).toEqual({
      profile: 1,
      preferences: 0,
      consumerPreferences: 0,
      consents: 0,
    });
  });

  test('a failed repair still returns the session', async () => {
    // The repair must not turn a database hiccup into a 500: the caller holds a
    // valid session and the next sign-in tries again.
    const failing = {
      seed: async () => {
        throw new Error('database is down');
      },
    } as unknown as UserDefaultsService;
    const service = buildService(failing);
    const id = randomUUID();
    stubSignIn(service, { id, email: `${id}@repair.cl` });

    const result = await service.login({
      email: `${id}@repair.cl`,
      password: 'password123',
    });

    expect(result.access_token).toBe('access-token');
    expect(result.user).toEqual({
      id,
      email: `${id}@repair.cl`,
      full_name: null,
      avatar_url: null,
      role: 'user',
    });
  });
});

/**
 * The database half of `DELETE /auth/account`, against real rows.
 *
 * The assertion that matters is the negative one: after an account with order
 * history is deleted, the order row and the business balance it produced are
 * still there, byte for byte. Everything else here is bookkeeping.
 */
describe('AuthAccountRepository.delete (DB real)', () => {
  const accounts = () => new AuthAccountRepository(ctx.db);
  const defaults = () => new UserDefaultsService(ctx.db);

  /** A consumer with a completed order and a balance that order accrued. */
  async function seedConsumerWithOrder() {
    const userId = await seedProfile(ctx.db, undefined);
    await defaults().seed({ id: userId, email: `${userId}@t.cl` });

    // The business belongs to SOMEONE ELSE on purpose. The account under test
    // is a consumer, and a consumer does not own a business: the fixture used
    // to make it the owner, and that was a fiction that the membership model
    // stopped allowing —an owner has an owner membership, and the DB's owner
    // guard refuses to archive it, so the anonymise path could not even run.
    // With the business owned by a merchant, the ONLY thing that retains this
    // profile is the order, which is exactly what this file is about.
    const merchantId = await seedProfile(ctx.db, undefined);
    const business = await seedBusiness(ctx.db, merchantId, {
      verification_status: 'approved',
    });
    const location = await seedLocation(ctx.db, business.id);
    const offer = await seedOffer(ctx.db, business.id, location.id);
    const order = await seedOrder(ctx.db, userId, offer.id, business.id, {
      status: 'completed',
    });

    // The money the sale produced. `net_amount` is the frozen snapshot the
    // payout maths reads, and this is what the accrual landed in.
    const net = '3.60';
    await ctx.db
      .update(businessFinance)
      .set({ balance: net })
      .where(eq(businessFinance.business_id, business.id));

    return { userId, businessId: business.id, orderId: order.id, net };
  }

  async function profileRow(userId: string) {
    const [row] = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId));
    return row ?? null;
  }

  async function businessRow(businessId: string) {
    const [row] = await ctx.db
      .select({
        rating: businesses.rating,
        review_count: businesses.review_count,
        is_active: businesses.is_active,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId));
    return row ?? null;
  }

  async function orderRow(orderId: string) {
    const [row] = await ctx.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId));
    return row ?? null;
  }

  async function balanceOf(businessId: string) {
    const [row] = await ctx.db
      .select({ balance: businessFinance.balance })
      .from(businessFinance)
      .where(eq(businessFinance.business_id, businessId));
    return row?.balance ?? null;
  }

  test('the fork is real: a profile with orders still has them afterwards', async () => {
    const { userId, businessId, orderId, net } = await seedConsumerWithOrder();

    // The premise, asserted rather than assumed: this is the row the whole
    // branch exists for. In Supabase `orders.user_id` is ON DELETE CASCADE from
    // `profiles`; the test mirror declares the same foreign key without the
    // clause, so what this spec proves is that we never take the erase path when
    // orders exist — which is the part of the behaviour a mirror can observe.
    expect(await accounts().countRetained(userId)).toEqual({
      orders: 1,
      businesses: 0,
      memberships: 0,
      owner_memberships: 0,
      reviews: 0,
    });

    await accounts().anonymise(userId);

    // THE ASSERTION THAT MATTERS: the sale and the money it produced survive.
    expect(await orderRow(orderId)).not.toBeNull();
    expect(await orderRow(orderId)).toMatchObject({ user_id: userId });
    expect(await balanceOf(businessId)).toBe(net);
  });

  test('a business owner with no orders of their own is still retained', async () => {
    // The "no orders" test alone is not the gate, and this is the case that
    // proves it: `business_ownership.owner_id` cascades from `profiles`, and
    // `orders.business_id` cascades from `businesses`, so erasing this profile
    // would take a stranger's purchase with it.
    const ownerId = await seedProfile(ctx.db);
    const customerId = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, ownerId, {
      verification_status: 'approved',
    });
    const location = await seedLocation(ctx.db, business.id);
    const offer = await seedOffer(ctx.db, business.id, location.id);
    const customerOrder = await seedOrder(
      ctx.db,
      customerId,
      offer.id,
      business.id,
      { status: 'completed' },
    );

    // The owner's OWNERSHIP is what retains them, and it is a membership: the
    // owner of a business has a row in `business_members` with
    // `role = 'owner'`, and `owner_memberships` is the number that says «this
    // account administers a business and cannot be erased».
    const retained = await accounts().countRetained(ownerId);
    expect(retained).toEqual({
      orders: 0,
      businesses: 1,
      memberships: 1,
      owner_memberships: 1,
      reviews: 0,
    });

    // And the soft erase refuses to touch it: `anonymise` archives the
    // caller's memberships, and the database's owner guard (`R0002`) says that
    // an owner is not the account's to archive. The service never gets here —
    // it answers 409 before erasing anything — but the guard is what holds when
    // the repository is called directly, and this is the assertion that proves
    // the business and the stranger's purchase are still there.
    await expect(accounts().anonymise(ownerId)).rejects.toThrow();

    // The customer's order, and the business itself, are still there.
    expect(await orderRow(customerOrder.id)).not.toBeNull();
    const [stillOwned] = await ctx.db
      .select({ user_id: businessMembers.user_id })
      .from(businessMembers)
      .where(eq(businessMembers.business_id, business.id));
    expect(stillOwned?.user_id).toBe(ownerId);
  });

  /**
   * The `businesses` counter comes from the MEMBERSHIP.
   *
   * The counter is half of the erase gate: it says whether the account still
   * administers a business. The row that says so is `business_members`, la
   * única que queda: la fila de propiedad se retiró con su tabla.
   *
   * El dueño cuenta 1 y un tercero cuenta 0, que es lo que la puerta necesita:
   * el que administra un negocio no puede borrarse, y el que no administra
   * ninguno puede.
   */
  test('el conteo de negocios sale de la membresía de dueño', async () => {
    const ownerId = await seedProfile(ctx.db);
    const otroId = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, ownerId);

    const delDueño = await accounts().countRetained(ownerId);
    expect(delDueño.businesses).toBe(1);

    const delOtro = await accounts().countRetained(otroId);
    expect(delOtro.businesses).toBe(0);
  });

  /**
   * An ARCHIVED owner membership is history, and it does not retain anything.
   *
   * The release (D2) archives the owner's membership instead of deleting it,
   * precisely so that the fact survives; but an archived row grants nothing, so
   * it is not a business the account still administers.
   *
   * The erase gate does NOT widen because of this: `memberships` counts every
   * row of the account —archived ones included— and it is the one that keeps
   * the profile alive. What changes is the NUMBER of businesses that the
   * account administers, which is what this test measures.
   */
  test('un dueño archivado no cuenta como dueño de un negocio', async () => {
    const ownerId = await seedProfile(ctx.db);
    // INACTIVO a propósito: el invariante «un negocio activo tiene dueño vivo»
    // lo impide archivar el dueño de un negocio que sigue encendido.
    const business = await seedBusiness(ctx.db, ownerId, { is_active: false });

    await ctx.db
      .update(businessMembers)
      .set({ deleted_at: new Date() })
      .where(eq(businessMembers.business_id, business.id));

    const retained = await accounts().countRetained(ownerId);
    expect(retained.businesses).toBe(0);
    expect(retained.owner_memberships).toBe(0);
    // Y la cuenta sigue retenida por la fila archivada: la puerta no se abrió.
    expect(retained.memberships).toBe(1);
  });

  test('anonymising scrubs the identifying columns and keeps the key ones', async () => {
    const { userId } = await seedConsumerWithOrder();
    await ctx.db
      .update(profiles)
      .set({
        full_name: 'Ana Torres',
        avatar_url: 'https://cdn.example/a.png',
        phone: '+593999999999',
        city: 'Quito',
        role: 'business',
      })
      .where(eq(profiles.id, userId));
    await ctx.db.insert(marketingPreferences).values({ user_id: userId });
    await ctx.db.insert(deviceTokens).values({
      user_id: userId,
      token: `tok-${userId}`,
      platform: 'android',
      is_active: true,
    });
    const createdAt = (await profileRow(userId))!.created_at;

    await accounts().anonymise(userId);

    const after = await profileRow(userId);
    // The row is the join key for every surviving order, event and review.
    expect(after?.id).toBe(userId);
    // Scrubbed: the primary identifier becomes an undeliverable RFC 2606
    // sentinel, and the rest of the self-supplied personal data is null.
    expect(after?.email).toBe(`anonymized-${userId}@role.invalid`);
    expect(after?.email).not.toContain('t.cl');
    expect(after?.full_name).toBeNull();
    expect(after?.avatar_url).toBeNull();
    expect(after?.phone).toBeNull();
    expect(after?.city).toBeNull();
    // NOT scrubbed, and this is the load-bearing part: role is platform state
    // this service must not be able to write from any of these endpoints, and
    // rewriting it would quietly move the platform's user/admin headcount.
    expect(after?.role).toBe('business');
    // Account age is needed for cohort reporting and identifies nobody.
    expect(after?.created_at).toEqual(createdAt);
  });

  test('anonymising deletes the reviews and the averages follow', async () => {
    const { userId, businessId, orderId } = await seedConsumerWithOrder();
    const [offer] = await ctx.db
      .select({ id: offers.id })
      .from(offers)
      .where(eq(offers.business_id, businessId));

    // Two reviews, so the recompute is observable as a change rather than as a
    // row landing on zero: one from the account being anonymised, one that stays.
    await ctx.db.insert(reviews).values({
      user_id: userId,
      business_id: businessId,
      order_id: orderId,
      rating: 1,
      product_rating: 1,
      business_rating: 1,
      comment: 'Reseña que la persona escribió y el negocio puede leer',
    });
    const otherUser = await seedProfile(ctx.db, undefined);
    await ctx.db.insert(reviews).values({
      user_id: otherUser,
      business_id: businessId,
      order_id: orderId,
      rating: 5,
      product_rating: 5,
      business_rating: 5,
      comment: 'La otra persona, esta se queda',
    });

    const before = await businessRow(businessId);
    expect(before?.review_count).toBe(2);
    expect(Number(before?.rating)).toBe(3);

    await accounts().anonymise(userId);

    // The person's words do not survive: a comment renders publicly, attributed,
    // beside the business name, so leaving it is publication rather than erasure.
    const mine = await ctx.db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.user_id, userId));
    expect(mine).toHaveLength(0);

    // Somebody else's review is untouched.
    const theirs = await ctx.db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.user_id, otherUser));
    expect(theirs).toHaveLength(1);

    // The average was recomputed by the trigger, not by this service writing the
    // numbers: 1 and 5 averaged to 3 before, and 5 is what is left after.
    const after = await businessRow(businessId);
    expect(after?.review_count).toBe(1);
    expect(Number(after?.rating)).toBe(5);

    // And the offer's own average, which reaches the offer through orders.
    const [offerAfter] = await ctx.db
      .select({ rating: offers.rating, review_count: offers.review_count })
      .from(offers)
      .where(eq(offers.id, offer.id));
    expect(offerAfter?.review_count).toBe(1);
    expect(Number(offerAfter?.rating)).toBe(5);
  });

  test('an anonymised row cannot keep mailing or pushing', async () => {
    const { userId } = await seedConsumerWithOrder();
    await ctx.db.insert(marketingPreferences).values({ user_id: userId });
    await ctx.db.insert(deviceTokens).values({
      user_id: userId,
      token: `tok-${userId}`,
      platform: 'ios',
      is_active: true,
    });

    await accounts().anonymise(userId);

    const [marketing] = await ctx.db
      .select()
      .from(marketingPreferences)
      .where(eq(marketingPreferences.user_id, userId));
    const tokens = await ctx.db
      .select()
      .from(deviceTokens)
      .where(eq(deviceTokens.user_id, userId));

    // A scrubbed-but-subscribed row is still resolved as a recipient by
    // `findSubscribedRecipients`, and an active token is still read by the
    // notifications dispatcher. Both are channels to a person who asked to be
    // unreachable.
    expect(marketing?.is_subscribed).toBe(false);
    expect(marketing?.unsubscribed_at).not.toBeNull();
    expect(tokens.every((t) => t.is_active === false)).toBe(true);
  });

  test('an account nothing points at is hard-deleted, with its own rows', async () => {
    const userId = await seedProfile(ctx.db);
    // Seeded through the real seeder: the invariant this module depends on is
    // that every account HAS these rows, which is why the erase has to remove
    // them explicitly rather than trust a cascade.
    await defaults().seed({ id: userId, email: `${userId}@t.cl` });
    await ctx.db.insert(deviceTokens).values({
      user_id: userId,
      token: `tok-${userId}`,
      platform: 'web',
      is_active: true,
    });

    // The gate is satisfied...
    expect(await accounts().countRetained(userId)).toEqual({
      orders: 0,
      businesses: 0,
      memberships: 0,
      owner_memberships: 0,
      reviews: 0,
    });
    // ...and the erase still works, which is the part that cannot be left to
    // `ON DELETE CASCADE`: `consumer_notification_preferences.user_id` has NO
    // ACTION in Supabase, so deleting the profile alone raises 23503 for every
    // real account.
    expect(await accounts().eraseAccount(userId)).toBe(true);

    expect(await profileRow(userId)).toBeNull();
    for (const [table, column] of [
      [deviceTokens, deviceTokens.user_id],
      [userPreferences, userPreferences.user_id],
      [userConsents, userConsents.user_id],
      [
        consumerNotificationPreferences,
        consumerNotificationPreferences.user_id,
      ],
    ] as const) {
      const rows = await ctx.db
        .select()
        .from(table as never)
        .where(eq(column as never, userId));
      expect(rows).toHaveLength(0);
    }
  });

  test('the erase detaches an order_events actor instead of failing', async () => {
    // `order_events.changed_by` is SET NULL in Supabase and the rows belong to
    // other people's orders: `validate_pickup_code` writes the caller's id
    // there, so an employee with no orders and no business can still be named on
    // a ledger that is not theirs to erase.
    const actorId = await seedProfile(ctx.db);
    const customerId = await seedProfile(ctx.db);
    const business = await seedBusiness(ctx.db, customerId, {
      verification_status: 'approved',
    });
    const location = await seedLocation(ctx.db, business.id);
    const offer = await seedOffer(ctx.db, business.id, location.id);
    const order = await seedOrder(ctx.db, customerId, offer.id, business.id);
    await ctx.db
      .update(orderEvents)
      .set({ changed_by: actorId })
      .where(eq(orderEvents.order_id, order.id));

    expect(await accounts().countRetained(actorId)).toEqual({
      orders: 0,
      businesses: 0,
      memberships: 0,
      owner_memberships: 0,
      reviews: 0,
    });
    expect(await accounts().eraseAccount(actorId)).toBe(true);

    const [event] = await ctx.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.order_id, order.id));
    expect(event?.changed_by).toBeNull();
    // And the customer's order is still there: the actor was not its owner.
    expect(await orderRow(order.id)).not.toBeNull();
  });

  test('the service answers void on both branches, with no column in reach', async () => {
    // `role` is not a parameter of any of these methods, so there is nothing to
    // pass and nothing to be reached with. Asserted here because the DB spec is
    // the one place the table is real: the column is `public.app_role` on a
    // table this service OWNS, which is exempt from RLS and from the column
    // grants, so the allowlist has to live in the code above it.
    const { userId } = await seedConsumerWithOrder();
    const service = buildService(defaults());
    const user = { id: userId, email: `${userId}@t.cl`, role: 'user' as const };

    (service as unknown as { supabaseAdmin: unknown }).supabaseAdmin = {
      auth: {
        admin: {
          deleteUser: async () => ({ data: {}, error: null }),
          updateUserById: async () => ({ data: {}, error: null }),
          generateLink: async () => ({ data: {}, error: null }),
          signOut: async () => ({ error: null }),
        },
      },
    };

    await expect(service.deleteAccount(user)).resolves.toBeUndefined();
    const after = await profileRow(userId);
    expect(after?.email).toBe(`anonymized-${userId}@role.invalid`);
    // The admin client is never handed a role, and the profile's role is
    // whatever it was.
    expect(after?.role).toBe('user');
  });

  test('consumer rows the anonymise branch leaves alone are all still readable', async () => {
    // The consent ledger is the proof of what was agreed to, and a
    // consumer-protection claim needs it after the person is gone. It holds no
    // personal data of its own.
    const { userId } = await seedConsumerWithOrder();

    await accounts().anonymise(userId);

    const consents = await ctx.db
      .select()
      .from(userConsents)
      .where(eq(userConsents.user_id, userId));
    expect(consents.map((c) => c.consent_type).sort()).toEqual([
      'analytics',
      'marketing',
      'notifications',
    ]);
    const [notificationPreferences] = await ctx.db
      .select()
      .from(consumerNotificationPreferences)
      .where(eq(consumerNotificationPreferences.user_id, userId));
    expect(notificationPreferences).toBeDefined();
  });
});

/**
 * ─── LA CADENA DE BORRADO, CON UNA MEMBRESÍA DE VERDAD ─────────────────────────
 *
 * El resto de este archivo no tiene una sola fila de `business_members`, y esa
 * es exactamente la razón por la que esta regresión era invisible: `auth.users →
 * profiles → business_members` es toda `ON DELETE CASCADE` (`profiles_id_fkey`,
 * `business_members_user_id_fkey`, verificado contra la base viva), así que borrar
 * el perfil de un dueño dispara el `before delete` que la Task 1 puso sobre la
 * fila del dueño y el borrado de la cuenta revienta con un `R0002` que llega al
 * cliente como un 500 sin explicación.
 *
 * Los tres tests de abajo son las tres mitades de la respuesta, y en ese orden a
 * propósito: el primero comprueba que el `R0002` EXISTE —el control positivo, sin
 * el cual los otros dos pasarían igual en una base sin trigger—, el segundo que el
 * servicio no deja que la cascada llegue a disparar la guarda, y el tercero que
 * una membresía que no es de un dueño se desacopla en vez de borrarse.
 */
describe('the erase with a membership (DB real)', () => {
  const accounts = () => new AuthAccountRepository(ctx.db);

  /** Stubs the GoTrue side of `deleteAccount`; the database half is real. */
  function service() {
    const built = buildService(new UserDefaultsService(ctx.db));
    (built as unknown as { supabaseAdmin: unknown }).supabaseAdmin = {
      auth: {
        admin: {
          deleteUser: async () => ({ data: {}, error: null }),
          updateUserById: async () => ({ data: {}, error: null }),
          generateLink: async () => ({ data: {}, error: null }),
          signOut: async () => ({ error: null }),
        },
      },
    };
    return built;
  }

  async function profileRow(userId: string) {
    const [row] = await ctx.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, userId));
    return row ?? null;
  }

  async function memberRow(id: string) {
    const [row] = await ctx.db
      .select()
      .from(businessMembers)
      .where(eq(businessMembers.id, id));
    return row ?? null;
  }

  /** A profile that owns a business, with the membership that says so. */
  async function seedOwner(options: { is_active?: boolean } = {}) {
    const userId = await seedProfile(ctx.db, undefined);
    // `owner_membership: false` porque esta spec siembra su propia fila —necesita
    // el id para degradarla después— y el seeder la crearía con otro alias.
    //
    // Y `is_active` porque el negocio APAGADO es el caso de la liberación: un
    // dueño de un negocio inactivo no tiene que entregar nada para poder borrar
    // su cuenta (D2), y un dueño de un negocio activo sí.
    const business = await seedBusiness(ctx.db, userId, {
      verification_status: 'approved',
      owner_membership: false,
      is_active: options.is_active ?? true,
    });
    const member = await seedBusinessMember(ctx.db, business.id, userId, {
      role: 'owner',
      label: 'Dueña',
      alias: `duena-${randomUUID().slice(0, 8)}@negocio.role.ec`,
      session_ttl_hours: 0,
    });
    return { userId, businessId: business.id, memberId: member.id };
  }

  test('CONTROL: el harness tiene la guarda del dueño, y el borrado no se lleva una membresía', async () => {
    // El negocio está APAGADO: la liberación sólo existe para un negocio
    // inactivo, y un borrado de un dueño de un negocio ACTIVO se niego antes
    // (es el 409 de la puerta).
    const { userId, memberId } = await seedOwner({ is_active: false });

    // La premisa, afirmada y no supuesta: la guarda EXISTE en el espejo. Un
    // borrado directo de la fila viva del dueño levanta R0002, y esa es la
    // guarda que la cascada desde `profiles` venía finden.
    const borrado = await ctx.db
      .delete(businessMembers)
      .where(eq(businessMembers.id, memberId))
      .then(() => null)
      .catch((err: unknown) => err);
    expect(borrado).not.toBeNull();
    expect(sqlErrorCode(borrado)).toBe('R0002');

    // Y el borrado por el repositorio NO se lleva la membresía con él: la
    // membresía se CIERRA y el perfil se queda, porque borrar el perfil se la
    // llevaría por la cascada —y con ella el alias, que el índice único no
    // libera a propósito (ítem 13 de la herencia).
    const erased = await accounts().eraseAccount(userId);
    expect(erased).toBe(false);

    // El perfil sigue ahí, y la membresía también: cerrada, no borrada.
    expect(await profileRow(userId)).not.toBeNull();
    const member = await memberRow(memberId);
    expect(member).not.toBeNull();
    expect(member?.deleted_at).not.toBeNull();
  });

  test('an owner cannot be erased while the business is live, and the answer says so', async () => {
    const { userId, businessId, memberId } = await seedOwner();
    const auth = service();

    // The premise again, from the gate's own numbers: this is the case the gate
    // has to recognise, and it is a SUBTLE one — `memberships` alone would send
    // this account to `anonymise`, which closes the membership and leaves the
    // business with nobody who can administer it (§5.4).
    expect(await accounts().countRetained(userId)).toEqual({
      orders: 0,
      businesses: 1,
      memberships: 1,
      owner_memberships: 1,
      reviews: 0,
    });

    await expect(
      auth.deleteAccount({
        id: userId,
        email: `${userId}@test.cl`,
        role: 'business' as const,
      }),
    ).rejects.toThrow(ConflictException);

    // The message has to be the truth and not a promise: this account CANNOT be
    // erased while it owns a business, and —since
    // `20261020052915_owner_cannot_be_demoted`— no route in the API can change
    // that. A message that named the old exit (degrade to `manager`) would send
    // the reader to a door that answers `R0002`.
    const error = await auth
      .deleteAccount({
        id: userId,
        email: `${userId}@test.cl`,
        role: 'business' as const,
      })
      .catch((err: unknown) => err);
    const message = (
      error as { getResponse: () => { message: string } }
    ).getResponse().message;
    expect(message).toContain('still owns an active business');
    expect(message).toContain('cannot be deleted');
    // Y la salida que el mensaje nombra es la que EXISTE: la transferencia.
    expect(message).toContain('/ownership/transfer');
    expect(message).not.toContain('manager');
    expect(message).not.toContain('PATCH');

    // NOTHING was destroyed: the refusal is a state this method cannot change
    // and neither can the caller, so it has to be answerable before the first
    // delete. A 409 after the auth user was soft-deleted would be a 500 the
    // caller cannot retry.
    const profile = await profileRow(userId);
    expect(profile?.email).not.toContain('anonymized');
    expect(await memberRow(memberId)).toMatchObject({
      role: 'owner',
      deleted_at: null,
    });
    const [business] = await ctx.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.id, businessId));
    expect(business).toBeDefined();

    // AND THE EXIT THAT THE MESSAGE USED TO NAME IS NOW CLOSED, IN THE DATABASE.
    // Degrading the owner to `manager` was the one operation that used to make
    // this account erasable, and it is precisely the one the new ruling closed:
    // without a transfer, it leaves the business ownerless, invisible in the
    // panel and with no route that can put `role: 'owner'` back. So the database
    // refuses it, and the refusal is what the test asserts —not the absence of a
    // call.
    const demotion = await ctx.db
      .update(businessMembers)
      .set({ role: 'manager' })
      .where(eq(businessMembers.id, memberId))
      .then(() => null)
      .catch((err: unknown) => err);
    expect(sqlErrorCode(demotion)).toBe('R0002');
    expect(await memberRow(memberId)).toMatchObject({ role: 'owner' });

    // So the erase STAYS refused, and that is the new truth: while the business
    // has an owner, this account is not erasable, and no route changes that.
    await expect(
      auth.deleteAccount({
        id: userId,
        email: `${userId}@test.cl`,
        role: 'business' as const,
      }),
    ).rejects.toThrow(ConflictException);
    expect((await profileRow(userId))?.email).not.toContain('anonymized');
  });

  /**
   * ─── LA LIBERACIÓN: UN DUEÑO DE UN NEGOCIO INACTIVO SÍ PUEDE BORRAR SU CUENTA ──
   *
   * La regla de D2, medida contra la base y no contra el servicio: un negocio
   * apagado libera a su dueño, y el borrado de la cuenta deja el negocio en un
   * estado que se puede describir —la membresía archivada, el alcance
   * archivado y la fila de propiedad borrada—.
   */
  describe('el dueño de un negocio inactivo', () => {
    test('puede borrar su cuenta, y la puerta ya no lo bloquea', async () => {
      const { userId } = await seedOwner({ is_active: false });
      const auth = service();

      // La puerta: `owner_memberships` cuenta los dueños de negocios ACTIVOS.
      // Un dueño de un negocio apagado no bloquea su cuenta, porque un negocio
      // apagado no es un negocio que alguien pueda administrar.
      expect(await accounts().countRetained(userId)).toEqual({
        orders: 0,
        businesses: 1,
        memberships: 1,
        owner_memberships: 0,
        reviews: 0,
      });

      await expect(
        auth.deleteAccount({
          id: userId,
          email: `${userId}@test.cl`,
          role: 'business' as const,
        }),
      ).resolves.toBeUndefined();

      // Y el perfil quedó anonimizado, que es la rama que conserva la fila
      // para que los pedidos y el negocio la puedan seguir nombrando.
      expect((await profileRow(userId))?.email).toBe(
        `anonymized-${userId}@role.invalid`,
      );
    });

    test('al borrar la cuenta, el negocio inactivo queda sin dueño vivo', async () => {
      const { userId, businessId, memberId } = await seedOwner({
        is_active: false,
      });

      // El dueño de un negocio es su membresía, y la de un negocio INACTIVO se
      // archiva cuando la persona se va: el negocio queda sin dueño vivo, que es
      // el estado que la base sabe reponer por la puerta de la plataforma.
      const antes = await ctx.db
        .select({ user_id: businessMembers.user_id })
        .from(businessMembers)
        .where(eq(businessMembers.business_id, businessId));
      expect(antes).toHaveLength(1);

      await accounts().anonymise(userId);

      // Y la membresía quedó ARCHIVADA, no borrada: la fila sigue ahí para
      // saber quién operó en el negocio, y no es un dueño vivo —el panel del
      // dueño queda vacío y el negocio no lo nombra a nadie.
      expect(await memberRow(memberId)).toMatchObject({
        role: 'owner',
        deleted_at: expect.anything(),
      });

      const vivos = await ctx.db
        .select({ user_id: businessMembers.user_id })
        .from(businessMembers)
        .where(
          and(
            eq(businessMembers.business_id, businessId),
            eq(businessMembers.role, 'owner'),
            isNull(businessMembers.deleted_at),
          ),
        );
      expect(vivos).toHaveLength(0);
    });

    test('al borrar la cuenta, las filas de alcance quedan archivadas', async () => {
      const { userId, businessId, memberId } = await seedOwner({
        is_active: false,
      });
      const location = await seedLocation(ctx.db, businessId);
      await ctx.db.insert(businessMemberLocations).values({
        member_id: memberId,
        location_id: location.id,
      });

      await accounts().anonymise(userId);

      // El §8 pide marcar `deleted_at` en las dos tablas, y las dos discrepaban
      // sobre qué significaba (ítem 14 de la herencia): una membresía archivada
      // con su alcance vivo sigue diciendo «esta persona llegaba a esta
      // sucursal» de alguien que ya no está.
      const alcance = await ctx.db
        .select({ deleted_at: businessMemberLocations.deleted_at })
        .from(businessMemberLocations)
        .where(eq(businessMemberLocations.member_id, memberId));
      expect(alcance).toHaveLength(1);
      expect(alcance[0]?.deleted_at).not.toBeNull();
    });
  });

  test('an employee membership is detached by the erase, not taken by the cascade', async () => {
    // The same case `order_events.changed_by` has, with one actor more: the
    // cascade would delete the row, and the §8 says a membership's delete is
    // logical and not exposed. So the erase writes `deleted_at` and the row stays.
    const ownerId = await seedProfile(ctx.db, undefined);
    const staffId = await seedProfile(ctx.db, undefined);
    const business = await seedBusiness(ctx.db, ownerId, {
      verification_status: 'approved',
    });
    const alias = `caja-${randomUUID().slice(0, 8)}@panaderialafamilia.ec`;
    const member = await seedBusinessMember(ctx.db, business.id, staffId, {
      role: 'staff',
      label: 'Caja de la mañana',
      alias,
    });

    // A business alias on a custom domain: the §9.4 case, and a real recipient.
    // The erase must not touch it.
    expect(await accounts().countRetained(staffId)).toEqual({
      orders: 0,
      businesses: 0,
      memberships: 1,
      owner_memberships: 0,
      reviews: 0,
    });

    await service().deleteAccount({
      id: staffId,
      email: `${staffId}@test.cl`,
      role: 'business' as const,
    });

    // THE PROFILE SURVIVES, which is what makes the cascade impossible: there is
    // nothing to delete for `business_members.user_id` to hang from.
    const profile = await profileRow(staffId);
    expect(profile?.email).toBe(`anonymized-${staffId}@role.invalid`);

    // THE ROW SURVIVES, with its identity as a record and without its access.
    const after = await memberRow(member.id);
    expect(after).toMatchObject({
      id: member.id,
      business_id: business.id,
      user_id: staffId,
      role: 'staff',
      label: 'Caja de la mañana',
      alias,
    });
    expect(after?.deleted_at).not.toBeNull();

    // "Who was here" is answerable: the row is countable, and the business is
    // untouched — this person's erasure is not a stranger's problem.
    const [stillThere] = await ctx.db
      .select({ c: count() })
      .from(businessMembers)
      .where(eq(businessMembers.id, member.id));
    expect(Number(stillThere?.c)).toBe(1);

    // AND THE ALIAS IS BURNT. The unique index is over
    // `(business_id, lower(alias))` with no `deleted_at` predicate precisely so an
    // archived row keeps holding its identifier; if the erase had taken the row
    // with the cascade, this insert would succeed.
    //
    // The insert is a THIRD person, one who is not a member of this business, and
    // that is the whole point: with the owner's id the failure would come from
    // `business_members_business_id_user_id_key` —the owner has a row here— and
    // the assertion would pass for a reason that has nothing to do with the
    // alias. So the failure has to name the constraint it claims.
    const thirdId = await seedProfile(ctx.db, undefined);
    const recycled = await ctx.db
      .insert(businessMembers)
      .values({
        business_id: business.id,
        user_id: thirdId,
        role: 'staff',
        label: 'Colisión',
        alias,
      })
      .then(() => null)
      .catch((err: unknown) => err);
    expect(sqlErrorCode(recycled)).toBe('23505');
    expect(sqlErrorConstraint(recycled)).toBe('business_members_alias_key');

    // The control: the SAME person, another alias, goes in. So what refused the
    // insert above was the alias and nothing else — not the person, not the
    // business, and not the fact that the business already has a membership for
    // that alias.
    const another = await ctx.db
      .insert(businessMembers)
      .values({
        business_id: business.id,
        user_id: thirdId,
        role: 'staff',
        label: 'Otro',
        alias: `caja2-${randomUUID().slice(0, 8)}@panaderialafamilia.ec`,
      })
      .then(() => null)
      .catch((err: unknown) => err);
    expect(another).toBeNull();
  });

  test('CONTROL: the alias is free again once the archived row is gone', async () => {
    // The negative control of the assertion above, and the reason that one is
    // worth anything: the insert is refused WHILE the archived row holds the
    // alias, and it goes through the moment that row is gone — which is exactly
    // what the cascade the assertion claims to exclude would have done. If the
    // insert failed for any other reason, this test would still pass and the one
    // above would be proving nothing.
    const ownerId = await seedProfile(ctx.db, undefined);
    const staffId = await seedProfile(ctx.db, undefined);
    const business = await seedBusiness(ctx.db, ownerId, {
      verification_status: 'approved',
    });
    const alias = `caja-${randomUUID().slice(0, 8)}@panaderialafamilia.ec`;
    const member = await seedBusinessMember(ctx.db, business.id, staffId, {
      role: 'staff',
      label: 'Caja de la mañana',
      alias,
    });

    await service().deleteAccount({
      id: staffId,
      email: `${staffId}@test.cl`,
      role: 'business' as const,
    });

    // A THIRD person, one who is not a member of this business: with a member's
    // id the failure would come from `business_members_business_id_user_id_key`
    // and the test would pass for a reason that has nothing to do with the alias.
    const thirdId = await seedProfile(ctx.db, undefined);
    const blocked = await ctx.db
      .insert(businessMembers)
      .values({
        business_id: business.id,
        user_id: thirdId,
        role: 'staff',
        label: 'Colisión',
        alias,
      })
      .then(() => null)
      .catch((err: unknown) => err);
    expect(sqlErrorCode(blocked)).toBe('23505');
    expect(sqlErrorConstraint(blocked)).toBe('business_members_alias_key');

    // …and the moment the archived row is GONE, the alias is free again.
    await ctx.db
      .delete(businessMembers)
      .where(eq(businessMembers.id, member.id));

    const free = await ctx.db
      .insert(businessMembers)
      .values({
        business_id: business.id,
        user_id: thirdId,
        role: 'staff',
        label: 'Colisión',
        alias,
      })
      .then(() => null)
      .catch((err: unknown) => err);
    expect(free).toBeNull();
  });
});
