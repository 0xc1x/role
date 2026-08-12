import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import { CategoriesService } from './categories.service';
import { CategoriesRepository, type CategoryRow, type DbExecutor } from './categories.repository';

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

const makeRow = (overrides: Partial<CategoryRow> = {}): CategoryRow => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  name: 'Test Category',
  description: 'A test category',
  emoji: '📁',
  slug: 'test-category',
  image_url: 'https://example.com/image.png',
  active: true,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-02T00:00:00Z'),
  deleted_at: null,
  ...overrides,
});

const makeDto = () => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  name: 'Test Category',
  description: 'A test category',
  emoji: '📁',
  slug: 'test-category',
  image_url: 'https://example.com/image.png',
  active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-02T00:00:00.000Z',
  deleted_at: null,
});

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: jest.Mocked<CategoriesRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: CategoriesRepository,
          useValue: {
            transaction: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            findByName: jest.fn(),
            findBySlug: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CategoriesService);
    repository = module.get(CategoriesRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) =>
      fn({} as unknown as DbExecutor),
    );
  });

  describe('list', () => {
    it('should return paginated categories', async () => {
      const rows = [makeRow()];
      repository.list.mockResolvedValue({ rows, total: 1 });
      (paginatedDataFromQuery as jest.Mock).mockReturnValue({
        data: [makeDto()],
        meta: { page: 1, limit: 10, total: 1 },
      });

      const result = await service.list({ page: 1, limit: 10, active: undefined });

      expect(repository.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        search: undefined,
        active: undefined,
      });
      expect(result).toEqual({
        data: [makeDto()],
        meta: { page: 1, limit: 10, total: 1 },
      });
    });
  });

  describe('getById', () => {
    it('should return a category when found', async () => {
      repository.findById.mockResolvedValue(makeRow());

      const result = await service.getById(makeRow().id);

      expect(repository.findById).toHaveBeenCalledWith(makeRow().id);
      expect(result).toEqual(makeDto());
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and return a category', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.findBySlug.mockResolvedValue(null);
      repository.insert.mockResolvedValue(makeRow());

      const result = await service.create({
        name: 'Test Category',
        slug: 'test-category',
        active: true,
      });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'Test Category', slug: 'test-category' }),
      );
      expect(result).toEqual(makeDto());
    });

    it('should auto-generate slug from name when slug is not provided', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.findBySlug.mockResolvedValue(null);
      repository.insert.mockResolvedValue(makeRow({ slug: 'test-category' }));

      const result = await service.create({ name: 'Test Category', active: true });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ slug: 'test-category' }),
      );
      expect(result).toEqual(makeDto());
    });

    it('should throw BadRequestException when slug cannot be derived', async () => {
      await expect(
        service.create({ name: '!!!', active: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when name already exists', async () => {
      repository.findByName.mockResolvedValue(makeRow());

      await expect(
        service.create({ name: 'Test Category', active: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when slug already exists', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.findBySlug.mockResolvedValue(makeRow());

      await expect(
        service.create({ name: 'Test Category', active: true }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update and return the category', async () => {
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

    it('should throw NotFoundException when category not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should check name uniqueness on update', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.findByName.mockResolvedValue(makeRow({ id: 'other-id', name: 'Taken' }));

      await expect(
        service.update(existing.id, { name: 'Taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should skip name uniqueness check when name is unchanged', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);

      await service.update(existing.id, { name: existing.name });

      expect(repository.findByName).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete and return the category', async () => {
      const deleted = makeRow({
        deleted_at: new Date('2025-01-03T00:00:00Z'),
        active: false,
      });
      repository.softDelete.mockResolvedValue(deleted);

      const result = await service.remove(makeRow().id);

      expect(repository.softDelete).toHaveBeenCalledWith(
        expect.anything(),
        makeRow().id,
      );
      expect(result.deleted_at).toBe('2025-01-03T00:00:00.000Z');
    });

    it('should throw NotFoundException when category not found', async () => {
      repository.softDelete.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
