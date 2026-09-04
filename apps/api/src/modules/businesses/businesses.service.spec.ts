import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
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

  describe('update (verificación de negocios)', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(makeBusinessRow());
      repository.update.mockResolvedValue(makeBusinessRow());
    });

    it('admin aprueba: activa el negocio y limpia el motivo de rechazo', async () => {
      await service.update(admin, businessId, { verification_status: 'approved' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        expect.objectContaining({
          verification_status: 'approved',
          is_active: true,
          rejection_reason: null,
          verified_by: 'admin-1',
          verified_at: expect.any(Date),
        }),
      );
    });

    it('admin rechaza: desactiva y guarda el motivo de rechazo', async () => {
      await service.update(admin, businessId, {
        verification_status: 'rejected',
        rejection_reason: 'Documentos ilegibles',
      });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        expect.objectContaining({
          verification_status: 'rejected',
          is_active: false,
          rejection_reason: 'Documentos ilegibles',
          verified_by: 'admin-1',
          verified_at: expect.any(Date),
        }),
      );
    });

    it('admin rechaza sin motivo: rejection_reason queda null', async () => {
      await service.update(admin, businessId, { verification_status: 'rejected' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        expect.objectContaining({ rejection_reason: null, is_active: false }),
      );
    });

    it('admin vuelve a pending: el negocio queda desactivado', async () => {
      await service.update(admin, businessId, { verification_status: 'pending' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        expect.objectContaining({ verification_status: 'pending', is_active: false }),
      );
    });

    it('owner de negocio no puede verificar: solo admin', async () => {
      repository.isOwner.mockResolvedValue(true);

      await expect(
        service.update(owner, businessId, { verification_status: 'approved' }),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('owner puede editar campos no-verificación sin tocar verified_at', async () => {
      repository.isOwner.mockResolvedValue(true);

      await service.update(owner, businessId, { description: 'Nuevo texto' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        { description: 'Nuevo texto' },
      );
    });

    it('no permite cambiar comisión con pagos pendientes', async () => {
      repository.hasPendingPayout.mockResolvedValue(true);

      await expect(
        service.update(admin, businessId, { commission_rate: 0.15 }),
      ).rejects.toThrow(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('cambia la comisión serializada cuando no hay pagos pendientes', async () => {
      repository.hasPendingPayout.mockResolvedValue(false);

      await service.update(admin, businessId, { commission_rate: 0.15 });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        businessId,
        expect.objectContaining({ commission_rate: '0.15' }),
      );
    });

    it('rechaza slug duplicado en update', async () => {
      repository.findBySlug.mockResolvedValue(makeBusinessRow({ id: 'otro-id' }));

      await expect(
        service.update(admin, businessId, { slug: 'cafe-central-nueva' }),
      ).rejects.toThrow('Slug already exists');
    });
  });
});
