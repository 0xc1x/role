import { describe, expect, it } from 'vitest';
import {
  CreateOrderRequestSchema,
  ListOrdersQuerySchema,
  UpdateOrderStatusSchema,
} from '../schemas/order-query.schema';
import {
  ReserveOfferErrorSchema,
  ReserveOfferResultSchema,
} from '../schemas/reserve-offer.schema';

const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('CreateOrderRequestSchema', () => {
  it('accepts offer_id only', () => {
    expect(CreateOrderRequestSchema.safeParse({ offer_id: uuid }).success).toBe(true);
  });

  it('rejects invalid uuid', () => {
    expect(CreateOrderRequestSchema.safeParse({ offer_id: 'bad' }).success).toBe(false);
  });
});

describe('ListOrdersQuerySchema', () => {
  it('defaults page and limit', () => {
    const parsed = ListOrdersQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
  });

  it('rejects limit above 100', () => {
    expect(ListOrdersQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});

describe('UpdateOrderStatusSchema', () => {
  it('accepts valid status', () => {
    expect(UpdateOrderStatusSchema.safeParse({ status: 'confirmed' }).success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(UpdateOrderStatusSchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});

describe('ReserveOfferResponseSchema', () => {
  it('accepts success result', () => {
    expect(
      ReserveOfferResultSchema.safeParse({
        success: true,
        order_id: uuid,
        order_number: 'FD-2026-0101-001',
        pickup_code: 'ABC123',
        price: 5,
        original_price: 10,
        discount: 5,
        platform_fee: 0.5,
        net_amount: 4.5,
        status: 'pending',
      }).success,
    ).toBe(true);
  });

  it('accepts error result', () => {
    expect(
      ReserveOfferErrorSchema.safeParse({
        success: false,
        error: 'OFFER_OUT_OF_STOCK',
        message: 'Sin stock',
      }).success,
    ).toBe(true);
  });
});
