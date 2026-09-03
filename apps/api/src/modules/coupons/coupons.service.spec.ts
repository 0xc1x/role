import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import { CouponsService } from './coupons.service';
import {
  CouponsRepository,
  type CouponRow,
  type DbExecutor,
} from './coupons.repository';

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

const makeRow = (overrides: Partial<CouponRow> = {}): CouponRow => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  business_id: null,
  code: 'PROMO10',
  name: 'Test Coupon',
  type: 'percentage',
  value: '10',
  min_order_amount: '0',
  max_uses: null,
  used_count: 0,
  is_active: true,
  expires_at: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-02T00:00:00Z'),
  ...overrides,
});

const makeDto = () => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  business_id: null,
  code: 'PROMO10',
  name: 'Test Coupon',
  type: 'percentage' as const,
  value: 10,
  min_order_amount: 0,
  max_uses: null,
  used_count: 0,
  is_active: true,
  expires_at: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-02T00:00:00.000Z',
});

describe('CouponsService', () => {
  let service: CouponsService;
  let repository: jest.Mocked<CouponsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CouponsService,
        {
          provide: CouponsRepository,
          useValue: {
            transaction: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            findGlobalByCode: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CouponsService);
    repository = module.get(CouponsRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) =>
      fn({} as unknown as DbExecutor),
    );
  });

  describe('list', () => {
    it('should return paginated coupons with business name', async () => {
      const rows = [
        { ...makeRow(), business_name: null },
        {
          ...makeRow({ business_id: '11111111-1111-1111-1111-111111111111' }),
          business_name: 'Test Business',
        },
      ];
      repository.list.mockResolvedValue({ rows, total: 2 });
      (paginatedDataFromQuery as jest.Mock).mockReturnValue({
        data: rows,
        meta: { page: 1, limit: 10, total: 2 },
      });

      const result = await service.list({
        page: 1,
        limit: 10,
        search: undefined,
        is_active: undefined,
        global: undefined,
      });

      expect(repository.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: undefined,
        is_active: undefined,
        global: undefined,
      });
      expect(result).toEqual({
        data: rows,
        meta: { page: 1, limit: 10, total: 2 },
      });
    });
  });

  describe('getById', () => {
    it('should return a coupon when found', async () => {
      repository.findById.mockResolvedValue(makeRow());

      const result = await service.getById(makeRow().id);

      expect(repository.findById).toHaveBeenCalledWith(makeRow().id);
      expect(result).toEqual(makeDto());
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a global coupon (business_id null)', async () => {
      repository.findGlobalByCode.mockResolvedValue(null);
      repository.insert.mockResolvedValue(makeRow());

      const result = await service.create({
        code: 'PROMO10',
        name: 'Test Coupon',
        type: 'percentage',
        value: 10,
      });

      expect(repository.findGlobalByCode).toHaveBeenCalledWith(
        'PROMO10',
        { excludeId: undefined },
        expect.anything(),
      );
      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ business_id: null, code: 'PROMO10' }),
      );
      expect(result).toEqual(makeDto());
    });

    it('should create a business coupon without global code assert', async () => {
      const businessId = '22222222-2222-2222-2222-222222222222';
      repository.insert.mockResolvedValue(makeRow({ business_id: businessId }));

      await service.create({
        business_id: businessId,
        code: 'PROMO10',
        name: 'Test Coupon',
        type: 'fixed',
        value: 50,
      });

      expect(repository.findGlobalByCode).not.toHaveBeenCalled();
      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ business_id: businessId }),
      );
    });

    it('should throw ConflictException when global code already exists', async () => {
      repository.findGlobalByCode.mockResolvedValue(makeRow());

      await expect(
        service.create({
          code: 'PROMO10',
          name: 'Test Coupon',
          type: 'percentage',
          value: 10,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update and return the coupon', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue({ ...existing, name: 'Updated' });

      const result = await service.update(existing.id, { name: 'Updated' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        existing.id,
        expect.objectContaining({ name: 'Updated' }),
      );
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException when coupon not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should assert global code uniqueness when code changes', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.findGlobalByCode.mockResolvedValue(
        makeRow({ id: 'other-id', code: 'TAKEN' }),
      );

      await expect(
        service.update(existing.id, { code: 'TAKEN' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should skip code assert when code is unchanged', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);

      await service.update(existing.id, { code: existing.code });

      expect(repository.findGlobalByCode).not.toHaveBeenCalled();
    });

    it('should not assert code uniqueness for business coupons', async () => {
      const existing = makeRow({
        business_id: '22222222-2222-2222-2222-222222222222',
      });
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);

      await service.update(existing.id, { code: 'ANY' });

      expect(repository.findGlobalByCode).not.toHaveBeenCalled();
    });

    it('should throw BadRequest when merged percentage exceeds 100', async () => {
      const existing = makeRow({ type: 'percentage', value: '50' });
      repository.findById.mockResolvedValue(existing);

      await expect(service.update(existing.id, { value: 150 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow fixed value above 100', async () => {
      const existing = makeRow({ type: 'fixed', value: '50' });
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue({ ...existing, value: '150' });

      const result = await service.update(existing.id, { value: 150 });

      expect(result.value).toBe(150);
    });
  });

  describe('remove', () => {
    it('should delete and return the coupon', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.remove.mockResolvedValue(existing);

      const result = await service.remove(existing.id);

      expect(repository.remove).toHaveBeenCalledWith(
        expect.anything(),
        existing.id,
      );
      expect(result).toEqual(makeDto());
    });

    it('should throw NotFoundException when coupon not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when coupon has redemptions', async () => {
      repository.findById.mockResolvedValue(makeRow({ used_count: 3 }));

      await expect(service.remove(makeRow().id)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
