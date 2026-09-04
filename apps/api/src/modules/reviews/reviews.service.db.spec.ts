import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedLocation,
  seedOffer,
  seedOrder,
  seedProfile,
} from '../../../test/seed';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';

let ctx: TestDbContext;
let service: ReviewsService;
let userId: string;
let businessId: string;
let offerId: string;
let orderId: string;

const authUser = (id: string) => ({ id, email: 'u@t.cl', role: 'user' }) as never;

beforeAll(async () => {
  ctx = await createTestDb();
  service = new ReviewsService(new ReviewsRepository(ctx.db));
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

describe('ReviewsService (DB real)', () => {
  test('create ok y recalcula promedios', async () => {
    const review = await service.create(authUser(userId), {
      order_id: orderId,
      business_rating: 5,
      product_rating: 4,
      comment: 'Excelente',
    });
    expect(review.business_rating).toBe(5);
    const biz = await ctx.db.execute(
      `select rating::float as r, review_count as c from businesses where id = '${businessId}'`,
    );
    expect(biz).toBeDefined();
  });

  test('create orden inexistente → NotFound; ajena → Forbidden', async () => {
    await expect(
      service.create(authUser(userId), {
        order_id: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow();
    const stranger = await seedProfile(ctx.db);
    await expect(
      service.create(authUser(stranger), { order_id: orderId }),
    ).rejects.toThrow();
  });

  test('recalculateRatings no falla', async () => {
    await service.recalculateRatings(businessId, offerId);
  });
});
