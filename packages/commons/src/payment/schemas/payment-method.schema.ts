import { z } from 'zod';
import {
  PaymentGatewaySchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

/**
 * Método de pago tokenizado (PCI DSS): NUNCA almacenamos PAN ni CVV.
 * Solo el token del gateway + metadatos de visualización.
 */
export const PaymentMethodSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  gateway: PaymentGatewaySchema,
  /** Token opaco del gateway — el número de tarjeta nunca toca nuestra BD. */
  gateway_token: z.string().min(1),
  brand: z.string().min(1).max(32),
  last4: z.string().regex(/^\d{4}$/),
  exp_month: z.number().int().min(1).max(12),
  exp_year: z.number().int(),
  holder_name: z.string().min(1).max(120),
  is_default: z.boolean(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema.nullable(),
  deleted_at: TimestamptzSchema.nullable(),
});

export const ViewPaymentMethodSchema = PaymentMethodSchema.omit({
  gateway_token: true,
});

/** Alta: el SDK del gateway produce token+metadatos; nosotros solo persistimos. */
export const CreatePaymentMethodSchema = z.object({
  gateway: PaymentGatewaySchema.optional(),
  gateway_token: z.string().min(1),
  brand: z.string().min(1).max(32),
  last4: z.string().regex(/^\d{4}$/, {
    message: 'Los últimos 4 dígitos deben ser numéricos',
  }),
  exp_month: z.number().int().min(1).max(12),
  exp_year: z.number().int().min(new Date().getFullYear()),
  holder_name: z
    .string()
    .min(1, 'El nombre del titular no puede estar vacío')
    .max(120, 'El nombre del titular no debe superar los 120 caracteres'),
  is_default: z.boolean().optional(),
});

export const UpdatePaymentMethodSchema = z
  .object({
    is_default: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Se requiere al menos un campo para actualizar',
  });

export const PatchPaymentMethodSchema = UpdatePaymentMethodSchema;
