jest.mock('@0xc1x/role-commons', () => ({
  CreateSlideSchema: {},
  UpdateSlideSchema: {},
  ListSlidesQuerySchema: {},
  SlideSchema: {},
}));

import { Test } from '@nestjs/testing';
import type { SlideDto, SlidePaginatedData } from '@0xc1x/role-commons';
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';

describe('SlidesController', () => {
  let controller: SlidesController;
  let service: jest.Mocked<SlidesService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SlidesController],
      providers: [
        {
          provide: SlidesService,
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

    controller = module.get(SlidesController);
    service = module.get(SlidesService);
  });

  const mockDto: SlideDto = {
    id: 'a1b2c3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    title: 'Info Slide',
    caption: 'Welcome',
    badge_text: null,
    cta_label: 'Click',
    redirect_url: 'https://example.com',
    coupon_code: null,
    image_url: 'https://example.com/slide.png',
    text_color: null,
    button_color: null,
    type: 'info',
    priority: 1,
    active: true,
    start_at: null,
    end_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: null,
    deleted_at: null,
  };

  describe('list', () => {
    it('should return paginated data', async () => {
      const paginated: SlidePaginatedData = {
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
    it('should return a slide', async () => {
      service.getById.mockResolvedValue(mockDto);

      const result = await controller.getById(mockDto.id);

      expect(result).toEqual(mockDto);
      expect(service.getById).toHaveBeenCalledWith(mockDto.id);
    });
  });

  describe('create', () => {
    it('should create and return a slide', async () => {
      const body = {
        title: 'Info Slide',
        caption: 'Welcome',
        type: 'info' as const,
        priority: 1,
        image_url: 'https://example.com/slide.png',
        cta_label: 'Click',
        redirect_url: 'https://example.com',
        active: true,
      };
      service.create.mockResolvedValue(mockDto);

      const result = await controller.create(body);

      expect(result).toEqual(mockDto);
      expect(service.create).toHaveBeenCalledWith(body);
    });
  });

  describe('update', () => {
    it('should update and return a slide', async () => {
      const body = { title: 'Updated' };
      const updated = { ...mockDto, title: 'Updated' };
      service.update.mockResolvedValue(updated);

      const result = await controller.update(mockDto.id, body);

      expect(result).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockDto.id, body);
    });
  });

  describe('remove', () => {
    it('should soft-delete a slide', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove(mockDto.id);

      expect(service.remove).toHaveBeenCalledWith(mockDto.id);
    });
  });
});
