import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbContext } from '../../../test/db';
import {
  seedBusiness,
  seedCategory,
  seedLocation,
  seedOffer,
  seedProfile,
} from '../../../test/seed';
import { favorites as favoritesTable, offers as offersTable } from '../../database/schema';
import { FavoritesRepository } from './favorites.repository';
import { FavoritesService } from './favorites.service';
import { OffersRepository } from '../offers/offers.repository';

let ctx: TestDbContext;
let service: FavoritesService;
let repository: FavoritesRepository;
let offersRepository: OffersRepository;

let consumerId: string;
let strangerId: string;
let offerId: string;

const authUser = (id: string, role: 'user' | 'business' = 'user') =>
  ({ id, email: `${id}@t.cl`, role }) as never;

beforeAll(async () => {
  ctx = await createTestDb();
  repository = new FavoritesRepository(ctx.db);
  offersRepository = new OffersRepository(ctx.db);
  service = new FavoritesService(repository, offersRepository);

  consumerId = await seedProfile(ctx.db);
  strangerId = await seedProfile(ctx.db);
  const owner = await seedProfile(ctx.db);
  const business = await seedBusiness(ctx.db, owner);
  const location = await seedLocation(ctx.db, business.id);
  offerId = (await seedOffer(ctx.db, business.id, location.id)).id;
  const category = await seedCategory(ctx.db);
  await offersRepository.setCategories(ctx.db, offerId, [category.id]);
});

afterAll(async () => {
  await ctx.stop();
});

async function favoriteRows(userId: string) {
  return ctx.db
    .select()
    .from(favoritesTable)
    .where(eq(favoritesTable.user_id, userId));
}

describe('FavoritesService (DB real)', () => {
  test('adding an offer twice yields exactly one row', async () => {
    const first = await service.add(authUser(consumerId), {
      offer_id: offerId,
    });
    const second = await service.add(authUser(consumerId), {
      offer_id: offerId,
    });

    // Idempotent through the live unique index, not through a swallowed error:
    // the second call returns the SAME row the first one created.
    expect(second.id).toBe(first.id);
    expect(second.created_at).toBe(first.created_at);
    expect(await favoriteRows(consumerId)).toHaveLength(1);
  });

  test('a repeated add does not fail the request', async () => {
    // The failure this guards is 23505 escaping as a 500. If the conflict target
    // or the mirror gap in test/db.ts regressed, this is the test that says so.
    await expect(
      service.add(authUser(consumerId), { offer_id: offerId }),
    ).resolves.toBeDefined();
    await expect(
      service.add(authUser(consumerId), { offer_id: offerId }),
    ).resolves.toBeDefined();
  });

  test('the list embeds the offer card and its categories', async () => {
    const result = await service.list(authUser(consumerId), {
      page: 1,
      limit: 20,
    });

    expect(result.meta.total).toBe(1);
    expect(result.data[0].offer).toMatchObject({
      id: offerId,
      title: 'Pack sorpresa',
      stock: 5,
      business: { name: expect.any(String) },
      location: { address: 'Calle 123' },
    });
    expect(result.data[0].offer?.categories).toHaveLength(1);
  });

  test('a sold-out offer is still returned, flagged with its real stock', async () => {
    // The saved list is NOT an availability filter: hiding an unavailable offer
    // would make a favorite silently vanish from the user's own list.
    await ctx.db
      .update(offersTable)
      .set({ stock: 0 })
      .where(eq(offersTable.id, offerId));

    const result = await service.list(authUser(consumerId), {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].offer?.stock).toBe(0);
  });

  test('a user cannot read another user favorite list', async () => {
    const asStranger = await service.list(authUser(strangerId), {
      page: 1,
      limit: 20,
    });

    expect(asStranger.data).toEqual([]);
    expect(asStranger.meta.total).toBe(0);
    // And the row is still there for its real owner.
    expect(await favoriteRows(consumerId)).toHaveLength(1);
  });

  test('a user cannot delete another user favorite', async () => {
    await service.remove(authUser(strangerId), offerId);

    expect(await favoriteRows(consumerId)).toHaveLength(1);
  });

  test('the owner can delete it, and deleting twice is a no-op', async () => {
    await service.remove(authUser(consumerId), offerId);
    expect(await favoriteRows(consumerId)).toHaveLength(0);

    await expect(
      service.remove(authUser(consumerId), offerId),
    ).resolves.toBeUndefined();
  });

  test('favoriting an offer that does not exist is a NotFound', async () => {
    await expect(
      service.add(authUser(consumerId), {
        offer_id: '00000000-0000-0000-0000-000000000000',
      }),
    ).rejects.toThrow(/not found/);
  });

  test('a business user gets its own list, not the consumer one', async () => {
    const businessUserId = await seedProfile(ctx.db);
    await service.add(authUser(businessUserId, 'business'), {
      offer_id: offerId,
    });
    await service.add(authUser(businessUserId, 'business'), {
      offer_id: offerId,
    });

    expect(await favoriteRows(businessUserId)).toHaveLength(1);
  });
});
