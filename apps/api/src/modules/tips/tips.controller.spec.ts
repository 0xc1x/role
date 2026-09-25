jest.mock('@0xc1x/role-commons', () => ({
  CreateTipSchema: {},
  UpdateTipSchema: {},
  ListTipsQuerySchema: {},
  paginatedDataFromQuery: jest.fn(),
}));

import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TipDto, TipPaginatedData } from '@0xc1x/role-commons';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { TipsController } from './tips.controller';
import { TipsService } from './tips.service';

describe('TipsController', () => {
  let controller: TipsController;
  let service: jest.Mocked<TipsService>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [TipsController],
      providers: [
        {
          provide: TipsService,
          useValue: {
            list: jest.fn(),
            listAdmin: jest.fn(),
            getRandom: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(TipsController);
    service = module.get(TipsService);
    reflector = module.get(Reflector);
  });

  const mockDto: TipDto = {
    id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    content: 'Test tip',
    active: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
    deleted_at: null,
  };

  describe('list', () => {
    it('should return paginated data', async () => {
      const paginated: TipPaginatedData = {
        data: [mockDto],
        meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
      };
      service.list.mockResolvedValue(paginated);

      const result = await controller.list({ page: 1, limit: 10, active: undefined });

      expect(result).toEqual(paginated);
      expect(service.list).toHaveBeenCalledWith({ page: 1, limit: 10, active: undefined });
    });
  });

  describe('authorization', () => {
    it('keeps public reads public and the admin list protected', () => {
      expect(reflector.get(IS_PUBLIC_KEY, controller.list)).toBe(true);
      expect(reflector.get(IS_PUBLIC_KEY, controller.getById)).toBe(true);
      expect(reflector.get(ROLES_KEY, controller.listAdmin)).toEqual(['admin']);
      expect(reflector.get(IS_PUBLIC_KEY, controller.listAdmin)).toBeUndefined();
    });
  });

  describe('listAdmin', () => {
    it('preserves the admin active filter', async () => {
      const query = { page: 1, limit: 10, active: false } as const;
      const paginated: TipPaginatedData = {
        data: [],
        meta: { page: 1, limit: 10, total: 0, total_pages: 0 },
      };
      service.listAdmin.mockResolvedValue(paginated);

      await expect(controller.listAdmin(query)).resolves.toEqual(paginated);
      expect(service.listAdmin).toHaveBeenCalledWith(query);
    });
  });

  describe('getRandom', () => {
    it('should return a random tip', async () => {
      service.getRandom.mockResolvedValue(mockDto);

      const result = await controller.getRandom();

      expect(result).toEqual(mockDto);
      expect(service.getRandom).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return a tip', async () => {
      service.getById.mockResolvedValue(mockDto);

      const result = await controller.getById(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.getById).toHaveBeenCalledWith(mockDto.id);
    });
  });

  describe('create', () => {
    it('should create and return a tip', async () => {
      const body = { content: 'Test tip', active: true };
      service.create.mockResolvedValue(mockDto);

      const result = await controller.create(body);

      expect(result).toEqual(mockDto);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('update', () => {
    it('should update and return a tip', async () => {
      const body = { content: 'Updated' };
      const updated = { ...mockDto, content: 'Updated' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockDto.id, body);

      expect(result).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockDto.id, body);
    });
  });

  describe('remove', () => {
    it('should soft-delete and return the tip', async () => {
      service.remove.mockResolvedValue(mockDto);

      const result = await controller.remove(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.remove).toHaveBeenCalledWith(mockDto.id);
    });
  });
});
