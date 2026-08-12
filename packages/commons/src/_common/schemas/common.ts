import { z } from 'zod';
import { ADDRESS_TYPES } from '../enums/address-type';
import { APP_ROLES } from '../enums/app-role';
import { DAYS_OF_WEEK } from '../enums/day-of-week';
import { PLATFORMS } from '../enums/platform';
import { BUSINESS_TYPES } from '../../business/enums/business-type';
import { COUPON_TYPES } from '../../catalog/enums/coupon-type';
import { ORDER_STATUSES } from '../../order/enums/order-status';
import { PAYMENT_GATEWAYS } from '../../payment/enums/payment-gateway';
import { PAYMENT_INTENT_STATUSES } from '../../payment/enums/payment-intent-status';
import { PAYOUT_STATUSES } from '../../payment/enums/payout-status';

/** UUID string (matches Postgres `uuid`) */
export const UuidSchema = z.string().uuid();

/** ISO-8601 timestamptz as returned by Supabase/PostgREST */
export const TimestamptzSchema = z.string().min(1);

/** ISO date `YYYY-MM-DD` */
export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Time of day `HH:MM` or `HH:MM:SS` */
export const TimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const JsonObjectSchema = z.record(z.string(), z.unknown());

export const AppRoleSchema = z.enum(APP_ROLES);
export const BusinessTypeSchema = z.enum(BUSINESS_TYPES);
export const CouponTypeSchema = z.enum(COUPON_TYPES);
export const DayOfWeekSchema = z.enum(DAYS_OF_WEEK);
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export const PaymentGatewaySchema = z.enum(PAYMENT_GATEWAYS);
export const PaymentIntentStatusSchema = z.enum(PAYMENT_INTENT_STATUSES);
export const PayoutStatusSchema = z.enum(PAYOUT_STATUSES);
export const PlatformSchema = z.enum(PLATFORMS);
export const AddressTypeSchema = z.enum(ADDRESS_TYPES);

/** Positive number (Postgres check `> 0`) */
export const PositiveNumberSchema = z.number().positive();

/** Non-negative integer */
export const NonNegativeIntSchema = z.number().int().nonnegative();

/** Rating 1–5 */
export const RatingSchema = z.number().int().min(1).max(5);
