import { pgEnum } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', ['user', 'business', 'admin']);

export const businessTypeEnum = pgEnum('business_type', [
  'restaurant',
  'bakery',
  'cafe',
  'grocery',
  'other',
]);

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'confirmed',
  'ready_for_pickup',
  'picked_up',
  'completed',
  'cancelled',
  'expired',
]);

export const couponTypeEnum = pgEnum('coupon_type', ['percentage', 'fixed']);

export const dayOfWeekEnum = pgEnum('day_of_week', [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export const paymentGatewayEnum = pgEnum('payment_gateway', [
  'place_to_pay',
  'stripe',
]);

export const paymentIntentStatusEnum = pgEnum('payment_intent_status', [
  'pending',
  'processing',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
]);

export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',
  'processing',
  'paid',
  'failed',
]);
