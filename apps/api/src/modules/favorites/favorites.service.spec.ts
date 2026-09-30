import { NotFoundException } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { FavoritesRepository } from './favorites.repository';
import { OffersRepository } from '../offers/offers.repository';
import type { AuthUser } from '../../auth/auth.types';

const consumer: AuthUser = { id: 'user-1', email: 'u@test.com', role: 'user' };
const business: AuthUser = {
  id: 'biz-1',
  email: 'b@test.com',
  role: 'business',
};

const makeFavoriteRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'fav-1',
  user_id: 'user-1',
  offer_id: 'offer-1',
  created_at: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const makeOfferListRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'offer-1',
  business_id: 'biz-1',
  business_location_id: 'loc-1',
  title: 'Pack sorpresa',
  description: null,
  image: null,
  original_price: '10000',
  discounted_price: '3990',
  discount_percentage: '60.10',
  stock: 5,
  initial_stock: 5,
  pickup_start: new Date('2026-01-01T10:00:00Z'),
  pickup_end: new Date('2026-01-01T12:00:00Z'),
  is_active: true,
  includes: null,
  allergens: null,
  rating: '4.5',
  review_count: 3,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  category_ids: ['cat-1'],
  category_names: ['Panadería'],
  category_slugs: ['panaderia'],
  business_name: 'Panadería',
  business_slug: 'panaderia',
  business_image: null,
  business_rating: '4.7',
  location_name: 'Matriz',
  location_address: 'Calle 123',
  location_latitude: '-33.45',
  location_longitude: '-70.66',
  location_zone: 'Providencia',
  ...overrides,
});

describe('FavoritesService', () => {
  let service: FavoritesService;
  let favoritesRepository: jest.Mocked<FavoritesRepository>;
  let offersRepository: jest.Mocked<OffersRepository>;

  beforeEach(() => {
    favoritesRepository = {
      listForUser: jest.fn(),
      insertIfAbsent: jest.fn(),
      deleteByOfferId: jest.fn(),
    } as unknown as jest.Mocked<FavoritesRepository>;
    offersRepository = {
      findManyByIds: jest.fn(),
    } as unknown as jest.Mocked<OffersRepository>;

    service = new FavoritesService(favoritesRepository, offersRepository);
  });

  describe('list', () => {
    it('scopes the query to the authenticated user id', async () => {
      favoritesRepository.listForUser.mockResolvedValue({
        rows: [makeFavoriteRow()],
        total: 1,
      });
      offersRepository.findManyByIds.mockResolvedValue([
        makeOfferListRow() as never,
      ]);

      await service.list(consumer, { page: 1, limit: 20 });

      expect(favoritesRepository.listForUser).toHaveBeenCalledWith('user-1', {
        page: 1,
        limit: 20,
      });
    });

    it('embeds the offer card and reports pagination meta', async () => {
      favoritesRepository.listForUser.mockResolvedValue({
        rows: [makeFavoriteRow()],
        total: 41,
      });
      offersRepository.findManyByIds.mockResolvedValue([
        makeOfferListRow() as never,
      ]);

      const result = await service.list(consumer, { page: 2, limit: 20 });

      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 41,
        total_pages: 3,
      });
      expect(result.data[0]).toMatchObject({
        id: 'fav-1',
        offer_id: 'offer-1',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      expect(result.data[0].offer).toMatchObject({
        id: 'offer-1',
        title: 'Pack sorpresa',
        stock: 5,
        categories: [{ id: 'cat-1', name: 'Panadería', slug: 'panaderia' }],
        business: { name: 'Panadería' },
        location: { address: 'Calle 123', zone: 'Providencia' },
      });
    });

    it('asks the offers repository only for the offers on this page', async () => {
      favoritesRepository.listForUser.mockResolvedValue({
        rows: [makeFavoriteRow({ offer_id: 'offer-7' })],
        total: 1,
      });
      offersRepository.findManyByIds.mockResolvedValue([]);

      await service.list(consumer, { page: 1, limit: 20 });

      expect(offersRepository.findManyByIds).toHaveBeenCalledWith(['offer-7']);
    });

    it('nulls the offer when the offer row is gone instead of faking a card', async () => {
      favoritesRepository.listForUser.mockResolvedValue({
        rows: [makeFavoriteRow()],
        total: 1,
      });
      offersRepository.findManyByIds.mockResolvedValue([]);

      const result = await service.list(consumer, { page: 1, limit: 20 });

      expect(result.data[0].offer).toBeNull();
    });

    it('does not ask for offers at all on an empty page', async () => {
      favoritesRepository.listForUser.mockResolvedValue({ rows: [], total: 0 });
      offersRepository.findManyByIds.mockResolvedValue([]);

      const result = await service.list(consumer, { page: 1, limit: 20 });

      expect(offersRepository.findManyByIds).toHaveBeenCalledWith([]);
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('add', () => {
    it('inserts with the caller id, never a body-supplied one', async () => {
      offersRepository.findManyByIds.mockResolvedValue([
        makeOfferListRow() as never,
      ]);
      favoritesRepository.insertIfAbsent.mockResolvedValue(makeFavoriteRow());

      // `user_id` is not part of AddFavoriteRequestSchema; a caller sending it
      // anyway must not be able to redirect the write.
      const result = await service.add(consumer, {
        offer_id: 'offer-1',
        user_id: 'someone-else',
      } as never);

      expect(favoritesRepository.insertIfAbsent).toHaveBeenCalledWith(
        'user-1',
        'offer-1',
      );
      expect(result.user_id).toBe('user-1');
    });

    it('returns the existing row when the offer is already a favorite', async () => {
      offersRepository.findManyByIds.mockResolvedValue([
        makeOfferListRow() as never,
      ]);
      // The repository answers with the row that is already there, so the
      // service reports success instead of surfacing the unique violation.
      favoritesRepository.insertIfAbsent.mockResolvedValue(
        makeFavoriteRow({ id: 'fav-existing' }),
      );

      const result = await service.add(consumer, { offer_id: 'offer-1' });

      expect(result.id).toBe('fav-existing');
    });

    it('rejects a non-existent offer with NotFound before inserting', async () => {
      offersRepository.findManyByIds.mockResolvedValue([]);

      await expect(
        service.add(consumer, { offer_id: 'missing' }),
      ).rejects.toThrow(NotFoundException);
      expect(favoritesRepository.insertIfAbsent).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes scoped to the caller id', async () => {
      favoritesRepository.deleteByOfferId.mockResolvedValue(true);

      await service.remove(consumer, 'offer-1');

      expect(favoritesRepository.deleteByOfferId).toHaveBeenCalledWith(
        'user-1',
        'offer-1',
      );
    });

    it('does not throw when there was nothing to delete', async () => {
      favoritesRepository.deleteByOfferId.mockResolvedValue(false);

      await expect(
        service.remove(consumer, 'offer-1'),
      ).resolves.toBeUndefined();
    });

    it('removes the caller own favorite whatever their role is', async () => {
      favoritesRepository.deleteByOfferId.mockResolvedValue(true);

      await service.remove(business, 'offer-1');

      expect(favoritesRepository.deleteByOfferId).toHaveBeenCalledWith(
        'biz-1',
        'offer-1',
      );
    });
  });
});
