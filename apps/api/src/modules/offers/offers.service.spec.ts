import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OffersService } from './offers.service';
import { OffersRepository, type OfferRow, type DbExecutor, type OfferListRow } from './offers.repository';

const makeOfferRow = (overrides: Partial<OfferRow> = {}): OfferRow => ({
  id: 'o1',
  business_id: 'b1',
  business_location_id: 'bl1',
  title: 'Test Offer',
  description: 'A test offer',
  image: null,
  original_price: '19.99',
  discounted_price: '9.99',
  discount_percentage: '50.00',
  stock: 10,
  initial_stock: 10,
  pickup_start: new Date('2025-01-01T10:00:00Z'),
  pickup_end: new Date('2025-01-01T12:00:00Z'),
  is_active: true,
  includes: null,
  allergens: null,
  rating: '4.5',
  review_count: 10,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

const makeListRow = (overrides: Partial<OfferListRow> = {}): OfferListRow => ({
  id: 'o1',
  business_id: 'b1',
  business_location_id: 'bl1',
  title: 'Test Offer',
  description: 'A test offer',
  image: null,
  original_price: '19.99',
  discounted_price: '9.99',
  discount_percentage: '50.00',
  stock: 10,
  initial_stock: 10,
  pickup_start: new Date('2025-01-01T10:00:00Z'),
  pickup_end: new Date('2025-01-01T12:00:00Z'),
  is_active: true,
  includes: null,
  allergens: null,
  rating: '4.5',
  review_count: 10,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  category_ids: ['c1'],
  category_names: ['Category 1'],
  category_slugs: ['category-1'],
  business_name: 'Test Business',
  business_slug: 'test-business',
  business_image: null,
  business_rating: '4.0',
  location_name: 'Main Location',
  location_address: '123 Main St',
  location_latitude: '40.7128',
  location_longitude: '-74.0060',
  location_zone: null,
  ...overrides,
});

describe('OffersService', () => {
  let service: OffersService;
  let repository: jest.Mocked<OffersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OffersService,
        {
          provide: OffersRepository,
          useValue: {
            transaction: jest.fn(),
            findMany: jest.fn(),
            findById: jest.fn(),
            findDtoById: jest.fn(),
            insert: jest.fn(),
            update: jest.fn(),
            setCategories: jest.fn(),
            findCategoryIds: jest.fn(),
            isBusinessOwner: jest.fn(),
            locationBelongsToBusiness: jest.fn(),
            findActiveCategoryIds: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(OffersService);
    repository = module.get(OffersRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) =>
      fn({} as unknown as DbExecutor),
    );
  });

  describe('list', () => {
    it('should return paginated offers', async () => {
      const items = [makeListRow()];
      repository.findMany.mockResolvedValue({ items, total: 1 });

      const result = await service.list({
        page: 1,
        limit: 10,
        radius_km: 10,
        available_only: false,
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        radius_km: 10,
        available_only: false,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        total_pages: 1,
      });
    });

    it('should map response correctly', async () => {
      const row = makeListRow();
      repository.findMany.mockResolvedValue({ items: [row], total: 1 });

      const result = await service.list({
        page: 1,
        limit: 10,
        radius_km: 10,
        available_only: false,
      });
      const offer = result.data[0];

      expect(offer.id).toBe('o1');
      expect(offer.title).toBe('Test Offer');
      expect(offer.original_price).toBe(19.99);
      expect(offer.discounted_price).toBe(9.99);
      expect(offer.business.name).toBe('Test Business');
      expect(offer.location.address).toBe('123 Main St');
      expect(offer.categories).toHaveLength(1);
      expect(offer.categories[0].name).toBe('Category 1');
    });
  });

  describe('getById', () => {
    it('should return an offer when found', async () => {
      const row = makeListRow();
      repository.findById.mockResolvedValue(row);

      const result = await service.getById('o1');

      expect(repository.findById).toHaveBeenCalledWith('o1');
      expect(result.id).toBe('o1');
      expect(result.title).toBe('Test Offer');
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and return an offer', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      const body = {
        business_id: 'b1',
        business_location_id: 'bl1',
        title: 'New Offer',
        original_price: 29.99,
        discounted_price: 14.99,
        pickup_start: '2025-02-01T10:00:00Z',
        pickup_end: '2025-02-01T12:00:00Z',
        category_ids: ['c1'],
      };
      repository.isBusinessOwner.mockResolvedValue(true);
      repository.locationBelongsToBusiness.mockResolvedValue(true);
      repository.findActiveCategoryIds.mockResolvedValue(['c1']);
      repository.transaction.mockImplementation(async (fn) =>
        fn({} as unknown as DbExecutor),
      );
      repository.insert.mockResolvedValue(makeOfferRow({ title: 'New Offer' }));
      repository.findCategoryIds.mockResolvedValue(['c1']);

      const result = await service.create(mockUser, body);

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'New Offer',
          business_id: 'b1',
        }),
      );
      expect(repository.setCategories).toHaveBeenCalledWith(
        expect.anything(),
        'o1',
        ['c1'],
      );
      expect(result.id).toBe('o1');
      expect(result.category_ids).toEqual(['c1']);
    });
  });

  describe('update', () => {
    it('should update and return the offer', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      const existing = makeOfferRow();
      repository.findDtoById.mockResolvedValue(existing);
      repository.isBusinessOwner.mockResolvedValue(true);
      repository.locationBelongsToBusiness.mockResolvedValue(true);
      repository.findActiveCategoryIds.mockResolvedValue([]);
      repository.transaction.mockImplementation(async (fn) =>
        fn({} as unknown as DbExecutor),
      );
      repository.update.mockResolvedValue({ ...existing, title: 'Updated Offer' });
      repository.findCategoryIds.mockResolvedValue([]);

      const result = await service.update(mockUser, 'o1', { title: 'Updated Offer' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        'o1',
        expect.objectContaining({ title: 'Updated Offer' }),
      );
      expect(result.title).toBe('Updated Offer');
    });

    it('should throw NotFoundException when offer not found', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      repository.findDtoById.mockResolvedValue(null);

      await expect(
        service.update(mockUser, 'nonexistent', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update categories when provided', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      const existing = makeOfferRow();
      repository.findDtoById.mockResolvedValue(existing);
      repository.isBusinessOwner.mockResolvedValue(true);
      repository.locationBelongsToBusiness.mockResolvedValue(true);
      repository.findActiveCategoryIds.mockResolvedValue(['c1', 'c2']);
      repository.transaction.mockImplementation(async (fn) =>
        fn({} as unknown as DbExecutor),
      );
      repository.update.mockResolvedValue(existing);
      repository.findCategoryIds.mockResolvedValue(['c1', 'c2']);

      await service.update(mockUser, 'o1', { category_ids: ['c1', 'c2'] });

      expect(repository.setCategories).toHaveBeenCalledWith(
        expect.anything(),
        'o1',
        ['c1', 'c2'],
      );
    });
  });

  describe('remove', () => {
    it('should deactivate the offer', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      const existing = makeOfferRow();
      repository.findDtoById.mockResolvedValue(existing);
      repository.isBusinessOwner.mockResolvedValue(true);
      repository.transaction.mockImplementation(async (fn) =>
        fn({} as unknown as DbExecutor),
      );
      repository.update.mockResolvedValue(makeOfferRow({ is_active: false }));

      await service.remove(mockUser, 'o1');

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        'o1',
        { is_active: false },
      );
    });

    it('should throw NotFoundException when offer not found', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com', role: 'business' as const };
      repository.findDtoById.mockResolvedValue(null);
      repository.transaction.mockImplementation(async (fn) =>
        fn({} as unknown as DbExecutor),
      );
      repository.update.mockResolvedValue(null);

      await expect(service.remove(mockUser, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
