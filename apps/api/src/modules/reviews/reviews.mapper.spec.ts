import { ReviewMapper } from './reviews.mapper';

const makeRow = (overrides: Record<string, any> = {}) => ({
  id: 'review-1',
  user_id: 'user-1',
  business_id: 'business-1',
  order_id: 'order-1',
  rating: null,
  comment: null,
  product_rating: 5,
  business_rating: '4',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-02T00:00:00Z'),
  ...overrides,
});

describe('ReviewMapper', () => {
  it('mapea fechas a ISO y ratings a número', () => {
    const dto = ReviewMapper.toDto(makeRow());
    expect(dto).toEqual({
      id: 'review-1',
      user_id: 'user-1',
      business_id: 'business-1',
      order_id: 'order-1',
      rating: null,
      comment: null,
      product_rating: 5,
      business_rating: 4,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    });
  });

  it('mantiene nulls y acepta ratings numéricos de DB', () => {
    const dto = ReviewMapper.toDto(
      makeRow({ rating: '5', comment: 'rico', order_id: null }),
    );
    expect(dto.rating).toBe(5);
    expect(dto.comment).toBe('rico');
    expect(dto.order_id).toBeNull();
  });
});
