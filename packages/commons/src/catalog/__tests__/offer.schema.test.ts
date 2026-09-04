import { describe, expect, it } from 'bun:test';
import { ListOffersQuerySchema } from '../schemas/offer-query.schema';
import { CreateOfferSchema } from '../schemas/offer.schema';

const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const ts = '2026-01-01T12:00:00.000Z';

describe('CreateOfferSchema', () => {
  const valid = {
    business_id: uuid,
    business_location_id: uuid,
    title: 'Bolsa sorpresa',
    original_price: 10,
    discounted_price: 5,
    stock: 3,
    initial_stock: 3,
    pickup_start: ts,
    pickup_end: '2026-01-01T18:00:00.000Z',
    category_ids: [uuid],
  };

  it('accepts valid offer', () => {
    expect(CreateOfferSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects discounted_price greater than original', () => {
    expect(
      CreateOfferSchema.safeParse({ ...valid, discounted_price: 15 }).success,
    ).toBe(false);
  });

  it('rejects negative stock', () => {
    expect(CreateOfferSchema.safeParse({ ...valid, stock: -1 }).success).toBe(false);
  });
});

describe('ListOffersQuerySchema', () => {
  it('caps limit at 100', () => {
    expect(ListOffersQuerySchema.safeParse({ limit: 200 }).success).toBe(false);
  });
});
