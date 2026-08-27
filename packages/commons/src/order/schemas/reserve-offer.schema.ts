import { z } from 'zod';

/**
 * Contrato de respuesta del espejo de la RPC `reserve_offer` de Supabase.
 * Debe mantenerse idéntico al jsonb que devuelve el SQL (ADR-0008).
 */
const RESERVE_OFFER_ERRORS = [
  'OFFER_NOT_FOUND',
  'OFFER_OUT_OF_STOCK',
  'OFFER_EXPIRED',
  'DUPLICATE_RESERVATION',
  'COUPON_EXHAUSTED',
  'COUPON_MIN_NOT_MET',
] as const;

export const ReserveOfferResultSchema = z.object({
  success: z.literal(true),
  order_id: z.string().uuid(),
  order_number: z.string(),
  pickup_code: z.string(),
  price: z.number(),
  original_price: z.number(),
  discount: z.number(),
  platform_fee: z.number(),
  net_amount: z.number(),
  status: z.literal('pending'),
});

export const ReserveOfferErrorSchema = z.object({
  success: z.literal(false),
  error: z.enum(RESERVE_OFFER_ERRORS),
  message: z.string(),
});

export const ReserveOfferResponseSchema = z.union([
  ReserveOfferResultSchema,
  ReserveOfferErrorSchema,
]);
