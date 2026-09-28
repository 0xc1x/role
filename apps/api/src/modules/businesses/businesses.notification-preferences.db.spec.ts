import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createTestDb, type TestDbContext } from '../../../test/db';
import { seedBusiness, seedProfile } from '../../../test/seed';
import { businessNotificationPreferences } from '../../database/schema';
import type { AuthUser } from '../../auth/auth.types';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import { BusinessesRepository } from './businesses.repository';
import { BusinessesService } from './businesses.service';

let ctx: TestDbContext;
let service: BusinessesService;

let ownerId: string;
let strangerId: string;
let businessId: string;
let strangerBusinessId: string;

const authUser = (
  id: string,
  role: 'user' | 'business' | 'admin' = 'business',
) => ({ id, email: `${id}@t.cl`, role }) as AuthUser;

async function row(business: string) {
  const [found] = await ctx.db
    .select()
    .from(businessNotificationPreferences)
    .where(eq(businessNotificationPreferences.business_id, business));
  return found ?? null;
}

/**
 * The row the businesses trigger would have created. The mirror has no Supabase
 * triggers, so `BusinessesRepository.create` writes it in production; here the
 * seed writes it directly, because the state under test is "a business that
 * already has its row", not "a business being created".
 */
async function seedPreferencesFor(business: string) {
  const [created] = await ctx.db
    .insert(businessNotificationPreferences)
    .values({ business_id: business })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

beforeAll(async () => {
  ctx = await createTestDb();
  const config = {
    get: (key: string) =>
      ({
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      })[key],
  } as never;
  service = new BusinessesService(
    new BusinessesRepository(ctx.db),
    config,
    new AppConfigRepository(ctx.db),
    new UserDefaultsService(ctx.db),
  );
  ownerId = await seedProfile(ctx.db);
  strangerId = await seedProfile(ctx.db);
  businessId = (await seedBusiness(ctx.db, ownerId)).id;
  strangerBusinessId = (await seedBusiness(ctx.db, strangerId)).id;
  await seedPreferencesFor(businessId);
  await seedPreferencesFor(strangerBusinessId);
});

afterAll(async () => {
  await ctx?.stop();
});

describe('business_notification_preferences (DB real)', () => {
  test("reads the business's own row, with the table defaults intact", async () => {
    const answer = await service.getNotificationPreferences(
      authUser(ownerId),
      businessId,
    );

    expect(answer?.business_id).toBe(businessId);
    // The column defaults, not values this API chose: push and email on, sms and
    // whatsapp off, low stock off, the rest on, and no quiet window.
    expect(answer?.push_enabled).toBe(true);
    expect(answer?.email_enabled).toBe(true);
    expect(answer?.sms_enabled).toBe(false);
    expect(answer?.whatsapp_enabled).toBe(false);
    expect(answer?.new_orders_enabled).toBe(true);
    expect(answer?.pickup_ready_enabled).toBe(true);
    expect(answer?.reviews_enabled).toBe(true);
    expect(answer?.low_stock_enabled).toBe(false);
    expect(answer?.daily_summary_enabled).toBe(true);
    expect(answer?.quiet_hours_from).toBeNull();
    expect(answer?.quiet_hours_to).toBeNull();
  });

  test('the PATCH round-trips every flag and updated_at ACTUALLY MOVES', async () => {
    // "Actually moves" is the whole assertion, and it is here because NO TRIGGER
    // maintains this column in production: the only trigger in the table's
    // migration is the AFTER INSERT on `businesses` that seeds the row. A mirror
    // that read-only ever passed this test for the wrong reason.
    const before = (await row(businessId))?.updated_at.getTime() ?? 0;
    expect(before).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const answer = await service.updateNotificationPreferences(
      authUser(ownerId),
      businessId,
      {
        push_enabled: false,
        sms_enabled: true,
        new_orders_enabled: false,
        low_stock_enabled: true,
        quiet_hours_from: '22:00:00',
        quiet_hours_to: '07:00:00',
      },
    );

    expect(answer.push_enabled).toBe(false);
    expect(answer.sms_enabled).toBe(true);
    expect(answer.new_orders_enabled).toBe(false);
    expect(answer.low_stock_enabled).toBe(true);
    // `time` crosses the wire as Postgres formats it, which is what TimeSchema
    // accepts — the same representation the consumer row uses.
    expect(answer.quiet_hours_from).toBe('22:00:00');
    expect(answer.quiet_hours_to).toBe('07:00:00');
    // Untouched flags keep their stored values.
    expect(answer.email_enabled).toBe(true);
    expect(answer.reviews_enabled).toBe(true);
    expect(answer.daily_summary_enabled).toBe(true);

    const after = (await row(businessId))?.updated_at.getTime() ?? 0;
    expect(after).toBeGreaterThan(before);
    expect(Date.parse(answer.updated_at)).toBe(after);
  });

  test('an explicit null CLEARS the quiet window', async () => {
    const answer = await service.updateNotificationPreferences(
      authUser(ownerId),
      businessId,
      { quiet_hours_from: null, quiet_hours_to: null },
    );

    expect(answer.quiet_hours_from).toBeNull();
    expect(answer.quiet_hours_to).toBeNull();
  });

  test('one end of a quiet window alone is refused, and the stored one survives', async () => {
    await service.updateNotificationPreferences(authUser(ownerId), businessId, {
      quiet_hours_from: '23:00:00',
      quiet_hours_to: '06:00:00',
    });

    // A half-configured window is stored in a shape that means nothing: the
    // consumer counterpart treats it as NO window, so the merchant would believe
    // they had silenced overnight alerts and they would still fire.
    const rejected = service.updateNotificationPreferences(
      authUser(ownerId),
      businessId,
      { quiet_hours_from: null },
    );
    await expect(rejected).rejects.toBeInstanceOf(UnprocessableEntityException);

    const after = await service.getNotificationPreferences(
      authUser(ownerId),
      businessId,
    );
    expect(after?.quiet_hours_from).toBe('23:00:00');
    expect(after?.quiet_hours_to).toBe('06:00:00');
  });

  test('a business with no preferences row reads as null, and a PATCH creates it', async () => {
    // The upsert exists for exactly this state: the trigger and the
    // `onConflictDoNothing` in `BusinessesRepository.create` both seed the row, so
    // it is normally there — but a business that predates the table, or one
    // inserted with the trigger disabled, has none, and a PATCH that 404'd there
    // would be a setting the merchant could never turn on.
    const bare = (await seedBusiness(ctx.db, ownerId)).id;
    expect(await row(bare)).toBeNull();

    expect(
      await service.getNotificationPreferences(authUser(ownerId), bare),
    ).toBeNull();

    const answer = await service.updateNotificationPreferences(
      authUser(ownerId),
      bare,
      { push_enabled: false },
    );
    expect(answer.business_id).toBe(bare);
    expect(answer.push_enabled).toBe(false);
    // The INSERT carried the column defaults for everything else.
    expect(answer.email_enabled).toBe(true);
  });

  test('an UNOWNED business id is refused for the read', async () => {
    // This API connects as the table's owner, so `business_notification_preferences`'
    // own RLS policies ("business owners view own") describe a boundary that does
    // not exist for these statements. `business_ownership` is the whole gate.
    await expect(
      service.getNotificationPreferences(authUser(strangerId), businessId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Same id, own account, own business: the 403 above was about ownership and
    // not about the id being malformed.
    expect(
      await service.getNotificationPreferences(authUser(ownerId), businessId),
    ).not.toBeNull();
  });

  test('an UNOWNED business id is refused for the write, and nothing was written', async () => {
    const before = await row(businessId);

    await expect(
      service.updateNotificationPreferences(authUser(strangerId), businessId, {
        push_enabled: false,
        low_stock_enabled: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const after = await row(businessId);
    expect(after?.push_enabled).toBe(before?.push_enabled);
    expect(after?.low_stock_enabled).toBe(before?.low_stock_enabled);
    expect(after?.updated_at.getTime()).toBe(before?.updated_at.getTime());
  });

  test('admin manages any business, exactly as every other business route here', async () => {
    const admin = await seedProfile(ctx.db);
    const answer = await service.updateNotificationPreferences(
      authUser(admin, 'admin'),
      businessId,
      { reviews_enabled: false },
    );

    expect(answer.reviews_enabled).toBe(false);
  });

  test("two businesses' rows are independent", async () => {
    await service.updateNotificationPreferences(
      authUser(strangerId),
      strangerBusinessId,
      { whatsapp_enabled: true },
    );

    const mine = await service.getNotificationPreferences(
      authUser(ownerId),
      businessId,
    );
    const theirs = await service.getNotificationPreferences(
      authUser(strangerId),
      strangerBusinessId,
    );

    expect(mine?.whatsapp_enabled).toBe(false);
    expect(theirs?.whatsapp_enabled).toBe(true);
  });
});
