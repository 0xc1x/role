import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { offers, reviews } from '../../database/schema';
import type { ListReviewsFeedQuery } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessesRepository } from '../businesses/businesses.repository';
import { OffersRepository } from '../offers/offers.repository';
import { ReviewsFeedRepository } from './reviews-feed.repository';
import { ReviewsFeedsService } from './reviews-feeds.service';

let ctx: TestDbContext;
let service: ReviewsFeedsService;
let authorId = '';
let otherAuthorId = '';
let publicBusinessId = '';
let publicOfferId = '';
let pausedOfferId = '';
/** An offer owned by a business that never passed moderation review. */
let unapprovedOfferId = '';
let hiddenReviewId = '';

const asUser = (id: string) =>
  ({ id, email: 'u@test.cl', role: 'user' }) as AuthUser;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new ReviewsFeedsService(
    new ReviewsFeedRepository(ctx.db),
    new BusinessesRepository(ctx.db),
    new OffersRepository(ctx.db),
  );

  authorId = await seedProfile(ctx.db, 'ana@test.cl');
  otherAuthorId = await seedProfile(ctx.db, 'beto@test.cl');
  const owner = await seedProfile(ctx.db, 'owner@test.cl');

  // `offers` has a composite FK on (business_location_id, business_id), so a
  // location only pairs with a business of its own.
  const approved = await seedBusiness(ctx.db, owner);
  publicBusinessId = approved.id;
  const approvedLocation = await seedLocation(ctx.db, publicBusinessId);
  publicOfferId = (
    await seedOffer(ctx.db, publicBusinessId, approvedLocation.id)
  ).id;
  pausedOfferId = (
    await seedOffer(ctx.db, publicBusinessId, approvedLocation.id, { stock: 0 })
  ).id;

  const pending = await seedBusiness(ctx.db, owner, {
    verification_status: 'pending',
  });
  const pendingLocation = await seedLocation(ctx.db, pending.id);
  unapprovedOfferId = (await seedOffer(ctx.db, pending.id, pendingLocation.id))
    .id;

  hiddenReviewId = await insertReview({
    offerId: publicOfferId,
    userId: authorId,
    hidden: true,
    at: '2026-01-01T10:00:00.000Z',
  });
  await insertReview({
    offerId: publicOfferId,
    userId: otherAuthorId,
    at: '2026-01-02T10:00:00.000Z',
  });
});

afterAll(async () => {
  await ctx.stop();
});

async function insertReview(options: {
  offerId: string;
  userId: string;
  at: string;
  hidden?: boolean;
}): Promise<string> {
  const [offer] = await ctx.db
    .select({ business_id: offers.business_id })
    .from(offers)
    .where(eq(offers.id, options.offerId));
  if (!offer) throw new Error('offer not found');

  const order = await seedOrder(
    ctx.db,
    options.userId,
    options.offerId,
    offer.business_id,
  );
  const [row] = await ctx.db
    .insert(reviews)
    .values({
      user_id: options.userId,
      business_id: offer.business_id,
      order_id: order.id,
      product_rating: 4,
      business_rating: 5,
      comment: 'Reseña de prueba',
      is_hidden: options.hidden ?? false,
      created_at: new Date(options.at),
      updated_at: new Date(options.at),
    })
    .returning();
  if (!row) throw new Error('insert review failed');
  return row.id;
}

describe('ReviewsFeedsService.listBusinessReviews', () => {
  test('returns the visible reviews of a public business', async () => {
    const feed = await service.listBusinessReviews(publicBusinessId, {
      page: 1,
      limit: 20,
    });

    expect(feed.meta.total).toBe(1);
    expect(feed.data).toHaveLength(1);
    expect(feed.data[0]?.author_id).toBe(otherAuthorId);
    expect(feed.data[0]?.author_name).toBeNull();
  });

  test('the hidden review of a visible business is not in the public feed', async () => {
    const feed = await service.listBusinessReviews(publicBusinessId, {
      page: 1,
      limit: 20,
    });
    expect(feed.data.map((r) => r.id)).not.toContain(hiddenReviewId);
  });

  test('a business in review is 404 on the same terms as an unknown one', async () => {
    const pendingOwner = await seedProfile(ctx.db);
    const pending = (
      await seedBusiness(ctx.db, pendingOwner, {
        verification_status: 'pending',
      })
    ).id;
    await insertReview({
      offerId: unapprovedOfferId,
      userId: otherAuthorId,
      at: '2026-01-03T10:00:00.000Z',
    });

    const error = await service
      .listBusinessReviews(pending, { page: 1, limit: 20 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
  });

  test('a deactivated business is 404 too', async () => {
    const owner = await seedProfile(ctx.db);
    const paused = (await seedBusiness(ctx.db, owner, { is_active: false })).id;

    await expect(
      service.listBusinessReviews(paused, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReviewsFeedsService.listOfferReviews', () => {
  test('resolves the reviews of the requested offer through its orders', async () => {
    const feed = await service.listOfferReviews(publicOfferId, {
      page: 1,
      limit: 20,
    });

    expect(feed.meta.total).toBe(1);
    expect(feed.data[0]?.offer_id).toBe(publicOfferId);
    expect(feed.data[0]?.offer_title).toBe('Pack sorpresa');
  });

  test('an offer whose business is not approved is 404', async () => {
    await expect(
      service.listOfferReviews(unapprovedOfferId, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('a sold-out offer is 404 as well — the same gate as the offer detail', async () => {
    // The reviews of an offer nobody can reserve are not a public fact yet, and
    // an empty page would still confirm the offer exists.
    await expect(
      service.listOfferReviews(pausedOfferId, { page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('an unknown offer is 404', async () => {
    await expect(
      service.listOfferReviews('00000000-0000-0000-0000-000000000000', {
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReviewsFeedsService.listMyReviews', () => {
  test('the author sees their own hidden review', async () => {
    const mine = await service.listMyReviews(asUser(authorId), {
      page: 1,
      limit: 20,
    });

    expect(mine.data.map((r) => r.id)).toContain(hiddenReviewId);
    expect(mine.data.find((r) => r.id === hiddenReviewId)?.is_hidden).toBe(
      true,
    );
    // The moderation record itself stays behind: the appeal between the business
    // and the platform is not the author's to read.
    expect(Object.keys(mine.data[0] ?? {})).not.toContain('moderation_reason');
  });

  test("a caller cannot read another user's reviews through this route", async () => {
    const mine = await service.listMyReviews(asUser(authorId), {
      page: 1,
      limit: 50,
    });
    const theirs = await service.listMyReviews(asUser(otherAuthorId), {
      page: 1,
      limit: 50,
    });

    // Both authors reviewed the same business and the same offer, so the only
    // thing separating the two answers is the token subject.
    expect(mine.data.length).toBeGreaterThan(0);
    expect(theirs.data.length).toBeGreaterThan(0);
    for (const row of mine.data) {
      expect(row.author_id).toBe(authorId);
    }
    for (const row of theirs.data) {
      expect(row.author_id).toBe(otherAuthorId);
    }
    const theirIds = new Set(theirs.data.map((r) => r.id));
    expect(mine.data.some((r) => theirIds.has(r.id))).toBe(false);
  });

  test('a caller with no reviews gets an empty page', async () => {
    const stranger = await seedProfile(ctx.db);
    const feed = await service.listMyReviews(asUser(stranger), {
      page: 1,
      limit: 20,
    });
    expect(feed).toEqual({
      data: [],
      meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
    });
  });

  test('the scope comes from the token, not from the query', async () => {
    // A caller that tries to smuggle a `user_id` gets it stripped by the
    // contract (see ListReviewsFeedQuerySchema) and the repository signature
    // takes the user id and the page, nothing else.
    const sneaky = {
      page: 1,
      limit: 20,
      user_id: otherAuthorId,
    } as ListReviewsFeedQuery;

    const feed = await service.listMyReviews(asUser(authorId), sneaky);
    for (const row of feed.data) {
      expect(row.author_id).toBe(authorId);
    }
  });
});
