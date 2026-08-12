jest.mock('@0xc1x/role-commons', () => ({
  CreateCategorySchema: {},
  UpdateCategorySchema: {},
  ListCategoriesQuerySchema: {},
  paginatedDataFromQuery: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import type { CategoryDto, CategoryPaginatedData } from '@0xc1x/role-commons';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: jest.Mocked<CategoriesService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
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

    controller = module.get(CategoriesController);
    service = module.get(CategoriesService);
  });

  const mockDto: CategoryDto = {
    id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
    name: 'Test',
    description: null,
    emoji: null,
    slug: 'test',
    image_url: null,
    active: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-02T00:00:00.000Z',
    deleted_at: null,
  };

  describe('list', () => {
    it('should return paginated data', async () => {
      const paginated: CategoryPaginatedData = {
        data: [mockDto],
        meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
      };
      service.list.mockResolvedValue(paginated);

      const result = await controller.list({ page: 1, limit: 10, active: undefined });

      expect(result).toEqual(paginated);
      expect(service.list).toHaveBeenCalledWith({ page: 1, limit: 10, active: undefined });
    });
  });

  describe('getById', () => {
    it('should return a category', async () => {
      service.getById.mockResolvedValue(mockDto);

      const result = await controller.getById(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.getById).toHaveBeenCalledWith(mockDto.id);
    });
  });

  describe('create', () => {
    it('should create and return a category', async () => {
      const body = { name: 'Test', slug: 'test', active: true };
      service.create.mockResolvedValue(mockDto);

      const result = await controller.create(body);

      expect(result).toEqual(mockDto);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('update', () => {
    it('should update and return a category', async () => {
      const body = { name: 'Updated' };
      const updated = { ...mockDto, name: 'Updated' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockDto.id, body);

      expect(result).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockDto.id, body);
    });
  });

  describe('remove', () => {
    it('should soft-delete and return the category', async () => {
      service.remove.mockResolvedValue(mockDto);

      const result = await controller.remove(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.remove).toHaveBeenCalledWith(mockDto.id);
    });
  });
});
