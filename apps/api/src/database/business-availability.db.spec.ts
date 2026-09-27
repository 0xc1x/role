import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, type SQL } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../test/db';
import { seedBusiness, seedProfile } from '../../test/seed';
import {
  approvedBusiness,
  moderationStatus,
  publiclyVisibleBusiness,
} from './business-availability';
import { businessModeration, businesses } from './schema';

/**
 * The public-visibility gate, against a real database.
 *
 * Tested on its own instead of only through one of its callers: an offers
 * regression is caught by the offers spec, and nothing would catch a gate that
 * stopped being applied to the business catalog.
 */
let ctx: TestDbContext;
let activeApproved = '';
let activePending = '';
let activeRejected = '';
let inactiveApproved = '';
/** Approved a moment ago, then stripped of its `business_moderation` row. */
let noModerationRow = '';

beforeAll(async () => {
  ctx = await createTestDb();
  const owner = await seedProfile(ctx.db);

  activeApproved = (await seedBusiness(ctx.db, owner)).id;
  activePending = (
    await seedBusiness(ctx.db, owner, { verification_status: 'pending' })
  ).id;
  activeRejected = (
    await seedBusiness(ctx.db, owner, { verification_status: 'rejected' })
  ).id;
  inactiveApproved = (
    await seedBusiness(ctx.db, owner, { is_active: false })
  ).id;

  noModerationRow = (await seedBusiness(ctx.db, owner)).id;
  await ctx.db
    .delete(businessModeration)
    .where(eq(businessModeration.business_id, noModerationRow));
});

afterAll(async () => {
  await ctx.stop();
});

async function visibleIds(predicate: SQL): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: businesses.id })
    .from(businesses)
    .where(predicate);
  return rows.map((r) => r.id);
}

describe('publiclyVisibleBusiness', () => {
  test('lets through only active, approved businesses', async () => {
    const visible = await visibleIds(publiclyVisibleBusiness());
    expect(visible).toContain(activeApproved);
    expect(visible).not.toContain(activePending);
    expect(visible).not.toContain(activeRejected);
    // Approved but deactivated: the platform's kill switch, which
    // `BusinessesService.remove` is.
    expect(visible).not.toContain(inactiveApproved);
    // No moderation row at all. `verification_status` left `businesses` in
    // 20260927025753, so a missing row no longer defaults to 'pending' the way a
    // NOT NULL column did — the gate has to fail closed on its own or an
    // unmoderated business is public.
    expect(visible).not.toContain(noModerationRow);
  });

  test('reads verification_status from the moderation companion', () => {
    // The column is gone from `businesses`. A predicate reaching for it there
    // would be a 42703 on the first public read, and the easy "fix" of reading
    // `businesses.is_active` alone would be a leak.
    const statement = ctx.db
      .select({ id: businesses.id })
      .from(businesses)
      .where(publiclyVisibleBusiness())
      .toSQL();

    expect(statement.sql).toContain('"business_moderation"');
    expect(statement.sql).toMatch(/m\.verification_status = \$\d/);
    // The status travels as a bound parameter, so assert the value too: a
    // predicate with a parameter that is not 'approved' is the whole gate.
    expect(statement.params).toContain('approved');
    expect(statement.sql).not.toMatch(/"businesses"\."verification_status"/);
  });

  test('approvedBusiness() and moderationStatus("approved") are one definition', () => {
    expect(approvedBusiness().queryChunks).toEqual(
      moderationStatus('approved').queryChunks,
    );
  });
});
