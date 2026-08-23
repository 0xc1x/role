import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import { TipsService } from './tips.service';
import { TipsRepository, type DbExecutor, type TipRow } from './tips.repository';

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

const makeRow = (overrides: Partial<TipRow> = {}): TipRow => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  content: 'Test tip',
  active: true,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-02T00:00:00Z'),
  deleted_at: null,
  ...overrides,
});

const makeDto = (overrides: Partial<TipRow> = {}) => ({
  id: 'b3e6c8f0-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
  content: 'Test tip',
  active: true,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-02T00:00:00.000Z',
  deleted_at: null,
  ...overrides,
});

describe('TipsService', () => {
  let service: TipsService;
  let repository: jest.Mocked<TipsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TipsService,
        {
          provide: TipsRepository,
          useValue: {
            transaction: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            findRandom: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TipsService);
    repository = module.get(TipsRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) =>
      fn({} as unknown as DbExecutor),
    );
  });

  describe('list', () => {
    it('should return paginated tips', async () => {
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

  describe('getRandom', () => {
    it('should return a random active tip', async () => {
      repository.findRandom.mockResolvedValue(makeRow());

      const result = await service.getRandom();

      expect(repository.findRandom).toHaveBeenCalled();
      expect(result).toEqual(makeDto());
    });

    it('should throw NotFoundException when there are no active tips', async () => {
      repository.findRandom.mockResolvedValue(null);

      await expect(service.getRandom()).rejects.toThrow(NotFoundException);
    });
  });

  describe('getById', () => {
    it('should return a tip when found', async () => {
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
    it('should create and return a tip', async () => {
      repository.insert.mockResolvedValue(makeRow());

      const result = await service.create({ content: 'Test tip', active: true });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ content: 'Test tip', active: true }),
      );
      expect(result).toEqual(makeDto());
    });
  });

  describe('update', () => {
    it('should update and return the tip', async () => {
      const existing = makeRow();
      repository.update.mockResolvedValue({ ...existing, content: 'Updated' });

      const result = await service.update(existing.id, { content: 'Updated' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        existing.id,
        expect.objectContaining({ content: 'Updated' }),
      );
      expect(result.content).toBe('Updated');
    });

    it('should throw NotFoundException when tip not found', async () => {
      repository.update.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { content: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete and return the tip', async () => {
      const deleted = makeRow({
        deleted_at: new Date('2025-01-03T00:00:00Z'),
        active: false,
      });
      repository.softDelete.mockResolvedValue(deleted);

      const result = await service.remove(makeRow().id);

      expect(repository.softDelete).toHaveBeenCalledWith(expect.anything(), makeRow().id);
      expect(result.deleted_at).toBe('2025-01-03T00:00:00.000Z');
    });

    it('should throw NotFoundException when tip not found', async () => {
      repository.softDelete.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
