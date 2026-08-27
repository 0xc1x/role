import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { ReviewsRepository } from './reviews.repository';

const mockUser = { id: 'user-1', email: 'u@test.com', role: 'user' as const };

const makeOrder = (overrides: Record<string, any> = {}) => ({
  id: 'order-1',
  user_id: 'user-1',
  business_id: 'business-1',
  offer_id: 'offer-1',
  status: 'completed',
  ...overrides,
});

const makeReviewRow = (overrides: Record<string, any> = {}) => ({
  id: 'review-1',
  user_id: 'user-1',
  business_id: 'business-1',
  order_id: 'order-1',
  rating: null,
  comment: null,
  product_rating: 5,
  business_rating: 4,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('ReviewsService (espejo de triggers de rating)', () => {
  let service: ReviewsService;
  let repository: jest.Mocked<ReviewsRepository>;
  const tx = {} as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: ReviewsRepository,
          useValue: {
            transaction: jest.fn(),
            findOrderById: jest.fn(),
            insert: jest.fn(),
            recalcBusinessRating: jest.fn(),
            recalcOfferRating: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(ReviewsService);
    repository = module.get(ReviewsRepository);
    jest.resetAllMocks();
    (repository.transaction as jest.Mock).mockImplementation(
      async (fn: (tx: any) => Promise<any>) => fn(tx),
    );
  });

  it('feliz: crea review y recalcula ratings del negocio y la oferta', async () => {
    repository.findOrderById.mockResolvedValue(makeOrder());
    repository.insert.mockResolvedValue(makeReviewRow());

    const result = await service.create(mockUser, {
      order_id: 'order-1',
      product_rating: 5,
      business_rating: 4,
    });

    expect(result.id).toBe('review-1');
    expect(repository.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        user_id: 'user-1',
        business_id: 'business-1',
        order_id: 'order-1',
      }),
    );
    // Mismo efecto que los triggers SQL: ambos ratings recalculados
    expect(repository.recalcBusinessRating).toHaveBeenCalledWith(
      tx,
      'business-1',
    );
    expect(repository.recalcOfferRating).toHaveBeenCalledWith(tx, 'offer-1');
  });

  it('ORDER_NOT_FOUND cuando la orden no existe', async () => {
    repository.findOrderById.mockResolvedValue(null);

    await expect(
      service.create(mockUser, { order_id: 'x' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rechaza reviews de órdenes ajenas', async () => {
    repository.findOrderById.mockResolvedValue(
      makeOrder({ user_id: 'someone-else' }),
    );

    await expect(
      service.create(mockUser, { order_id: 'order-1' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
