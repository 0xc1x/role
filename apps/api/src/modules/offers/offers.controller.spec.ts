jest.mock('@0xc1x/role-commons', () => ({
  CreateOfferSchema: {},
  UpdateOfferSchema: {},
  ListOffersQuerySchema: {},
  ListZonesQuerySchema: {},
}));

import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import type { AuthUser } from '../../auth/auth.types';

const mockUser: AuthUser = {
  id: 'user-1',
  email: 'test@test.com',
  role: 'business',
};

describe('OffersController', () => {
  let controller: OffersController;
  let service: jest.Mocked<OffersService>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        {
          provide: OffersService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
            getRandom: jest.fn(),
            listZones: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(OffersController);
    service = module.get(OffersService);
    reflector = module.get(Reflector);
  });

  describe('list', () => {
    it('should return paginated offers', async () => {
      const paginated = {
        data: [],
        meta: { page: 1, limit: 10, total: 0, total_pages: 0 },
      };
      service.list.mockResolvedValue(paginated);

      const result = await controller.list({
        page: 1,
        limit: 10,
        radius_km: 10,
        available_only: false,
      });

      expect(result).toEqual(paginated);
      expect(service.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        radius_km: 10,
        available_only: false,
      });
    });
  });

  describe('getById', () => {
    it('should return an offer', async () => {
      const offer = {
        id: 'o1',
        business_id: 'b1',
        business_location_id: 'bl1',
        title: 'Test',
        description: null,
        image: null,
        category_ids: [],
        categories: [],
        original_price: 19.99,
        discounted_price: 9.99,
        discount_percentage: null,
        stock: 10,
        initial_stock: 10,
        pickup_start: '2025-01-01T10:00:00.000Z',
        pickup_end: '2025-01-01T12:00:00.000Z',
        is_active: true,
        includes: null,
        allergens: null,
        rating: 4.5,
        review_count: 10,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        business: {
          id: 'b1',
          name: 'Test Biz',
          slug: 'test-biz',
          image: null,
          rating: null,
        },
        location: {
          id: 'bl1',
          name: 'Loc',
          address: 'Addr',
          latitude: 40.71,
          longitude: -74.0,
          zone: null,
        },
      };
      service.getById.mockResolvedValue(offer);

      const result = await controller.getById('o1');

      expect(result).toEqual(offer);
      expect(service.getById).toHaveBeenCalledWith('o1');
    });
  });

  describe('create', () => {
    it('should create and return an offer', async () => {
      const body = {
        business_id: 'b1',
        business_location_id: 'bl1',
        title: 'New Offer',
        original_price: 29.99,
        discounted_price: 14.99,
        pickup_start: '2025-02-01T10:00:00Z',
        pickup_end: '2025-02-01T12:00:00Z',
        category_ids: [],
      };
      const created = {
        id: 'o1',
        ...body,
        description: null,
        image: null,
        stock: 1,
        initial_stock: 1,
        is_active: true,
        includes: null,
        allergens: null,
        discount_percentage: null,
        rating: 0,
        review_count: 0,
        category_ids: [],
        categories: [],
        created_at: '2025-02-01T00:00:00.000Z',
        updated_at: '2025-02-01T00:00:00.000Z',
        business: { id: 'b1', name: '', slug: '', image: null, rating: null },
        location: {
          id: 'bl1',
          name: '',
          address: '',
          latitude: 0,
          longitude: 0,
          zone: null,
        },
      };
      service.create.mockResolvedValue(created);

      const result = await controller.create(mockUser, body);

      expect(result).toEqual(created);
      expect(service.create).toHaveBeenCalledWith(mockUser, body);
    });
  });

  describe('update', () => {
    it('should update and return an offer', async () => {
      const body = { title: 'Updated' };
      const updated = {
        id: 'o1',
        title: 'Updated',
        business_id: '',
        business_location_id: '',
        description: null,
        image: null,
        category_ids: [],
        categories: [],
        original_price: 0,
        discounted_price: 0,
        discount_percentage: null,
        stock: 0,
        initial_stock: 0,
        pickup_start: '',
        pickup_end: '',
        is_active: true,
        includes: null,
        allergens: null,
        rating: 0,
        review_count: 0,
        created_at: '',
        updated_at: '',
        business: { id: '', name: '', slug: '', image: null, rating: null },
        location: {
          id: '',
          name: '',
          address: '',
          latitude: 0,
          longitude: 0,
          zone: null,
        },
      };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockUser, 'o1', body);

      expect(result).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockUser, 'o1', body);
    });
  });

  describe('remove', () => {
    it('should deactivate an offer', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove(mockUser, 'o1');

      expect(service.remove).toHaveBeenCalledWith(mockUser, 'o1');
    });
  });

  describe('listZones', () => {
    it('delega en el servicio y devuelve un array SIN meta', async () => {
      const rows = [
        { zone: 'centro', deals: 12 },
        { zone: 'providencia', deals: 4 },
      ];
      service.listZones.mockResolvedValue(rows);

      const query = { lat: -33.45, lng: -70.66, radius_km: 5, limit: 5 };
      const result = await controller.listZones(query);

      expect(result).toEqual(rows);
      expect(service.listZones).toHaveBeenCalledWith(query);
      // `popular_zones` returns a top-N and never a total, so there is no
      // `meta` to invent here: a `PaginatedData` would announce a `total`
      // nobody counted.
      expect(Array.isArray(result)).toBe(true);
      expect(result).not.toHaveProperty('meta');
    });
  });

  describe('authorization and routing metadata', () => {
    it('listZones is public, like list and random', () => {
      expect(reflector.get(IS_PUBLIC_KEY, controller.listZones)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.list)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.getRandom)).toBe(true);
    });

    it('listZones is its own path, not swallowed by :id', () => {
      // Declaration ORDER is what actually keeps `zones` out of
      // `@Get(':id')` — a unit spec cannot see the router, so the ordering is
      // pinned over HTTP in test/app.e2e-spec.ts. What this asserts is the
      // cheaper half: the path string is `zones` and not a parameter, so the
      // only thing that can go wrong here is someone writing `@Get(':zones')`
      // or moving the handler into another controller.
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          OffersController.prototype.listZones,
        ),
      ).toBe('zones');
    });
  });
});

describe('OffersController.getRandom', () => {
  test('delega en el servicio', async () => {
    const module = await Test.createTestingModule({
      controllers: [OffersController],
      providers: [
        {
          provide: OffersService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
            getRandom: jest.fn(async () => ({ id: 'o1' })),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();
    const controller = module.get(OffersController);
    await expect(controller.getRandom()).resolves.toEqual({ id: 'o1' });
  });
});
