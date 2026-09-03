jest.mock('@0xc1x/role-commons', () => ({
  CreateCouponSchema: {},
  UpdateCouponSchema: {},
  ListCouponsQuerySchema: {},
  paginatedDataFromQuery: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import type { CouponDto, CouponPaginatedData } from '@0xc1x/role-commons';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

describe('CouponsController', () => {
  let controller: CouponsController;
  let service: jest.Mocked<CouponsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CouponsController],
      providers: [
        {
          provide: CouponsService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(CouponsController);
    service = module.get(CouponsService);
  });

  const mockDto: CouponDto = {
    id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    business_id: null,
    code: 'PROMO10',
    name: 'Test',
    type: 'percentage',
    value: 10,
    min_order_amount: null,
    max_uses: null,
    used_count: 0,
    is_active: true,
    expires_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
  };

  describe('list', () => {
    it('should return paginated data', async () => {
      const paginated: CouponPaginatedData = {
        data: [{ ...mockDto, business_name: null }],
        meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
      };
      service.list.mockResolvedValue(paginated);

      const result = await controller.list({
        page: 1,
        limit: 10,
        search: undefined,
        is_active: undefined,
        global: undefined,
      });

      expect(result).toEqual(paginated);
      expect(service.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: undefined,
        is_active: undefined,
        global: undefined,
      });
    });
  });

  describe('getById', () => {
    it('should return a coupon', async () => {
      service.getById.mockResolvedValue(mockDto);

      const result = await controller.getById(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.getById).toHaveBeenCalledWith(mockDto.id);
    });
  });

  describe('create', () => {
    it('should create and return a coupon', async () => {
      const body = {
        code: 'PROMO10',
        name: 'Test',
        type: 'percentage' as const,
        value: 10,
      };
      service.create.mockResolvedValue(mockDto);

      const result = await controller.create(body);

      expect(result).toEqual(mockDto);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('update', () => {
    it('should update and return a coupon', async () => {
      const body = { name: 'Updated' };
      const updated = { ...mockDto, name: 'Updated' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockDto.id, body);

      expect(result).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockDto.id, body);
    });
  });

  describe('remove', () => {
    it('should delete and return the coupon', async () => {
      service.remove.mockResolvedValue(mockDto);

      const result = await controller.remove(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.remove).toHaveBeenCalledWith(mockDto.id);
    });
  });
});
