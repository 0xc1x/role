import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AuthUser } from '../../auth/auth.types';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';
import type { BusinessRow } from './businesses.repository';

const businessId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const ownerId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

const makeBusinessRow = (overrides: Partial<BusinessRow> = {}): BusinessRow =>
  ({
    id: businessId,
    owner_id: ownerId,
    name: 'Café Central',
    type: 'restaurant',
    slug: 'cafe-central',
    image: null,
    cover_image: null,
    description: null,
    phone: null,
    email: null,
    website: null,
    commission_rate: '0.1',
    balance: '0',
    rating: null,
    review_count: null,
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  }) as BusinessRow;

describe('BusinessesService', () => {
  let service: BusinessesService;
  const repository = {
    listAll: jest.fn(),
    listForUser: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    isOwner: jest.fn(),
    hasPendingPayout: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const admin: AuthUser = { id: 'admin-1', role: 'admin', email: 'admin@role.ec' };
  const owner: AuthUser = { id: ownerId, role: 'business', email: 'owner@role.ec' };
  const stranger: AuthUser = { id: 'other-user', role: 'business', email: 'x@y.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(BusinessesService);
    jest.clearAllMocks();
  });

  describe('getById', () => {
    it('allows admin to view any business', async () => {
      repository.findById.mockResolvedValue(makeBusinessRow());

      const dto = await service.getById(admin, businessId);

      expect(dto.id).toBe(businessId);
      expect(repository.isOwner).not.toHaveBeenCalled();
    });

    it('forbids non-owner business user', async () => {
      repository.findById.mockResolvedValue(makeBusinessRow());
      repository.isOwner.mockResolvedValue(false);

      await expect(service.getById(stranger, businessId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws when business missing', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById(admin, businessId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('forces owner_id for business role', async () => {
      repository.findBySlug.mockResolvedValue(null);
      repository.insert.mockResolvedValue(makeBusinessRow());

      await service.create(owner, {
        name: 'Nuevo',
        slug: 'nuevo',
      });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ owner_id: ownerId }),
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting is_active false', async () => {
      repository.findById.mockResolvedValue(makeBusinessRow());
      repository.isOwner.mockResolvedValue(true);
      repository.update.mockResolvedValue(makeBusinessRow({ is_active: false }));

      await service.remove(owner, businessId);

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        { is_active: false },
      );
    });
  });
});
