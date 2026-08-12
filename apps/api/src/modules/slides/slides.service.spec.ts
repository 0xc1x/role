import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import { SlidesService } from './slides.service';
import { SlidesRepository, type SlideRow, type DbExecutor } from './slides.repository';
import { SlideMapper } from './mappers/slides.mapper';

jest.mock('@0xc1x/role-commons', () => ({
  paginatedDataFromQuery: jest.fn(),
}));

jest.mock('./mappers/slides.mapper');

const makeRow = (overrides: Partial<SlideRow> = {}): SlideRow => ({
  id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  title: 'Info Slide',
  caption: 'Welcome to the app',
  badge_text: null,
  cta_label: null,
  redirect_url: null,
  image_url: 'https://example.com/slide.png',
  text_color: null,
  button_color: null,
  type: 'info',
  priority: 1,
  start_at: null,
  end_at: null,
  active: true,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: null,
  deleted_at: null,
  ...overrides,
});

const makeDto = () => ({
  id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  title: 'Info Slide',
  caption: 'Welcome to the app',
  badge_text: null,
  cta_label: '',
  redirect_url: '',
  image_url: 'https://example.com/slide.png',
  text_color: null,
  button_color: null,
  type: 'info' as const,
  priority: 1,
  active: true,
  start_at: null,
  end_at: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: null,
  deleted_at: null,
});

describe('SlidesService', () => {
  let service: SlidesService;
  let repository: jest.Mocked<SlidesRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SlidesService,
        {
          provide: SlidesRepository,
          useValue: {
            transaction: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            findByTitle: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SlidesService);
    repository = module.get(SlidesRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) =>
      fn({} as unknown as DbExecutor),
    );
  });

  describe('create', () => {
    it('should create and return a slide', async () => {
      const body = {
        title: 'Info Slide',
        caption: 'Welcome to the app',
        type: 'info' as const,
        priority: 1,
        image_url: 'https://example.com/slide.png',
        cta_label: 'Learn More',
        redirect_url: 'https://example.com',
        active: true,
      };
      const insertPayload = { ...body };
      (SlideMapper.toInsert as jest.Mock).mockReturnValue(insertPayload);
      (SlideMapper.toDto as jest.Mock).mockReturnValue(makeDto());
      repository.insert.mockResolvedValue(makeRow());

      const result = await service.create(body);

      expect(SlideMapper.toInsert).toHaveBeenCalledWith(body);
      expect(repository.insert).toHaveBeenCalledWith(expect.anything(), insertPayload);
      expect(result).toEqual(makeDto());
    });
  });

  describe('getById', () => {
    it('should return a slide when found', async () => {
      repository.findById.mockResolvedValue(makeRow());
      (SlideMapper.toDto as jest.Mock).mockReturnValue(makeDto());

      const result = await service.getById(makeRow().id);

      expect(repository.findById).toHaveBeenCalledWith(makeRow().id);
      expect(result).toEqual(makeDto());
    });

    it('should throw NotFoundException when not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('should return paginated slides', async () => {
      const rows = [makeRow()];
      repository.list.mockResolvedValue({ rows, total: 1 });
      (SlideMapper.toDto as jest.Mock).mockReturnValue(makeDto());
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

    it('should return empty paginated data on repository error', async () => {
      repository.list.mockRejectedValue(new Error('DB error'));
      (paginatedDataFromQuery as jest.Mock).mockReturnValue({
        data: [],
        meta: { page: 1, limit: 10, total: 0 },
      });

      const result = await service.list({ page: 1, limit: 10, active: undefined });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, limit: 10, total: 0 },
      });
    });
  });

  describe('update', () => {
    it('should update and return the slide', async () => {
      const existing = makeRow();
      repository.findById.mockResolvedValue(existing);
      const updatePayload = { title: 'Updated Title' };
      (SlideMapper.toUpdate as jest.Mock).mockReturnValue(updatePayload);
      (SlideMapper.toDto as jest.Mock).mockReturnValue({
        ...makeDto(),
        title: 'Updated Title',
      });
      repository.update.mockResolvedValue({ ...existing, title: 'Updated Title' });

      const result = await service.update(existing.id, { title: 'Updated Title' });

      expect(SlideMapper.toUpdate).toHaveBeenCalledWith({ title: 'Updated Title' });
      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        existing.id,
        updatePayload,
      );
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException when slide not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete a slide', async () => {
      repository.softDelete.mockResolvedValue(makeRow({ deleted_at: new Date() }));

      await service.remove(makeRow().id);

      expect(repository.softDelete).toHaveBeenCalledWith(expect.anything(), makeRow().id);
    });

    it('should throw NotFoundException when slide not found', async () => {
      repository.softDelete.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleActive', () => {
    it('should toggle active state', async () => {
      repository.update.mockResolvedValue(makeRow({ active: false }));
      (SlideMapper.toDto as jest.Mock).mockReturnValue({ ...makeDto(), active: false });

      const result = await service.toggleActive(makeRow().id, false);

      expect(repository.update).toHaveBeenCalledWith(expect.anything(), makeRow().id, {
        active: false,
      });
      expect(result.active).toBe(false);
    });

    it('should throw NotFoundException when slide not found', async () => {
      repository.update.mockResolvedValue(null);

      await expect(service.toggleActive('nonexistent', false)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
