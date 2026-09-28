jest.mock('@0xc1x/role-commons', () => ({
  CreateCouponSchema: {},
  UpdateCouponSchema: {},
  ListCouponsQuerySchema: {},
  ValidateCouponRequestSchema: {},
  paginatedDataFromQuery: jest.fn(),
}));

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type {
  CouponDto,
  CouponPaginatedData,
  CouponValidation,
} from '@0xc1x/role-commons';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import type { AuthUser } from '../../auth/auth.types';
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
            validate: jest.fn(),
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

  describe('validate', () => {
    const body = {
      code: 'PROMO10',
      business_id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
      amount: 3990,
    };

    it('should return the accepted verdict with the money', async () => {
      const validation: CouponValidation = {
        applies: true,
        code: 'PROMO10',
        discount: 399,
        final_price: 3591,
      };
      service.validate.mockResolvedValue(validation);

      const result = await controller.validate(body);

      expect(result).toEqual(validation);
      expect(service.validate).toHaveBeenCalledWith(body);
    });

    // A code the user may not use is an ANSWER, not a 409: the client is
    // mid-checkout and branches on `applies`/`error`, exactly as it does for
    // the reservation. Throwing here would give the two paths different shapes.
    it('should return the rejection verdict instead of throwing', async () => {
      const validation: CouponValidation = {
        applies: false,
        code: 'PROMO10',
        error: 'COUPON_NOT_APPLICABLE',
        reason: 'expired',
      };
      service.validate.mockResolvedValue(validation);

      await expect(controller.validate(body)).resolves.toEqual(validation);
    });

    it('should not call any admin-only repository path', async () => {
      service.validate.mockResolvedValue({
        applies: false,
        code: 'X',
        error: 'COUPON_NOT_APPLICABLE',
        reason: 'not_found',
      });

      await controller.validate(body);

      // `list` is the enumeration the module withholds from consumers; a
      // validate that reached for it would be the leak, not the route.
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('POST /coupons/validate — route declaration', () => {
    const handler = CouponsController.prototype.validate;
    const reflector = new Reflector();

    it('is a POST on the literal path `validate`', () => {
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('validate');
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
    });

    it('declares neither @Roles nor @Public', () => {
      // The decision is authenticated-but-not-role-restricted. Reading the real
      // metadata is the only way to notice a stray `@Roles('admin')` added later
      // by muscle memory, or a `@Public()` added by someone trying to fix a 401
      // from the mobile app — either would be a regression.
      expect(
        reflector.getAllAndOverride(ROLES_KEY, [handler, CouponsController]),
      ).toBeUndefined();
      expect(
        reflector.getAllAndOverride(IS_PUBLIC_KEY, [
          handler,
          CouponsController,
        ]),
      ).toBeUndefined();
    });

    it('lets a plain consumer through the role guard', () => {
      const consumer: AuthUser = {
        id: 'u1',
        email: 'u@x.com',
        role: 'user',
      };
      const guard = new RolesGuard(reflector);
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: consumer }) }),
        getHandler: () => handler,
        getClass: () => CouponsController,
      } as never;

      expect(guard.canActivate(context)).toBe(true);
    });
  });

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
