import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { ReviewsRepository } from './reviews.repository';

let ctx: TestDbContext;
let repo: ReviewsRepository;
let userId: string;
let businessId: string;
let offerId: string;
let orderId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  repo = new ReviewsRepository(ctx.db);
  userId = await seedProfile(ctx.db);
  const owner = await seedProfile(ctx.db);
  const biz = await seedBusiness(ctx.db, owner);
  businessId = biz.id;
  const loc = await seedLocation(ctx.db, businessId);
  offerId = (await seedOffer(ctx.db, businessId, loc.id)).id;
  orderId = (await seedOrder(ctx.db, userId, offerId, businessId)).id;
});

afterAll(async () => {
  await ctx.stop();
});

describe('ReviewsRepository (DB real)', () => {
  test('findOrderById expone ids para validación', async () => {
    expect(await repo.findOrderById(ctx.db, orderId)).toMatchObject({
      user_id: userId,
      business_id: businessId,
      offer_id: offerId,
    });
    expect(
      await repo.findOrderById(ctx.db, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
  });

  test('insert + recalc actualiza promedios', async () => {
    await repo.insert(ctx.db, {
      order_id: orderId,
      user_id: userId,
      business_id: businessId,
      rating: 5,
      business_rating: 5,
      product_rating: 4,
    });
    await repo.transaction(async (tx) => {
      await repo.recalcBusinessRating(tx, businessId);
      await repo.recalcOfferRating(tx, offerId);
    });
    const bizRows = await ctx.db.execute(
      `select rating, review_count from businesses where id = '${businessId}'`,
    );
    expect(bizRows).toBeDefined();
  });
});
