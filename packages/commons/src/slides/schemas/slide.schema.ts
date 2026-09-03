import { z } from 'zod';
import { SlideType } from '../enums/slide.enum';
import {
    BooleanQuerySchema,
    PaginatedDataSchema,
    PaginationQuerySchema,
} from '../../_common/schemas/api.schema';
import {
    TimestamptzSchema,
    UuidSchema,
} from '../../_common/schemas/common';

const HexColorSchema = z.string().regex(/^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/, {
    message: 'El color debe tener un formato hexadecimal válido (ej. #FF0000)',
});

const slideDateRefinement = {
    refine: (data: { start_at?: string | null; end_at?: string | null }) => {
        if (data.start_at && data.end_at) {
            return new Date(data.end_at) >= new Date(data.start_at);
        }
        return true;
    },
    params: {
        message: "La fecha de fin debe ser posterior o igual a la fecha de inicio",
        path: ["end_at"],
    },
};

/** URL externa (https://...) o ruta interna de la app (ej. /explore). */
export const RedirectUrlSchema = z.union([
    z.url({
        message: "Debe proporcionar una URL de redirección válida",
    }),
    z.string().regex(/^\/\S*$/, {
        message: "La ruta interna debe empezar con / (ej. /explore)",
    }),
]);

/** Las slides de tipo cupón requieren un código; los demás tipos no. */
const slideCouponCodeRefinement = {
    refine: (data: { type?: SlideType; coupon_code?: string | null }) =>
        data.type !== SlideType.COUPON || Boolean(data.coupon_code),
    params: {
        message: "Las slides de tipo cupón requieren un código de cupón",
        path: ["coupon_code"],
    },
};

/** El destino es obligatorio salvo para cupones, que no admiten URL. */
const slideRedirectRefinement = {
    refine: (data: { type?: SlideType; redirect_url?: string | null }) => {
        if (data.type === SlideType.COUPON) {
            return data.redirect_url == null || data.redirect_url === "";
        }
        // Update parcial sin type: el destino se valida solo por formato.
        if (data.type === undefined) return true;
        return Boolean(data.redirect_url);
    },
    params: {
        message: "El destino es obligatorio salvo para cupones (que no admiten URL)",
        path: ["redirect_url"],
    },
};

/** 
 * 1. ESQUEMA BASE: Centraliza todas las reglas de negocio para Slide.
 */
const SlideBaseSchema = z.object({
    title: z.string()
        .min(1, "El título no puede estar vacío")
        .max(120, "El título no debe superar los 120 caracteres"),
    caption: z.string()
        .min(1, "El texto descriptivo no puede estar vacío")
        .max(255, "El texto descriptivo no debe superar los 255 caracteres"),
    badge_text: z.string()
        .max(30, "El badge no debe superar los 30 caracteres")
        .nullable(),
    cta_label: z.string()
        .min(1, "El texto del botón no puede estar vacío")
        .max(50, "El texto del botón no debe superar los 50 caracteres"),
    redirect_url: RedirectUrlSchema.nullable(),
    coupon_code: z.string()
        .min(1, "El código de cupón no puede estar vacío")
        .max(50, "El código de cupón no debe superar los 50 caracteres")
        .nullable(),
    image_url: z.url({
        message: "Debe proporcionar una URL de imagen válida",
    }).nullable(),
    text_color: HexColorSchema.nullable(),
    button_color: HexColorSchema.nullable(),
    type: z.enum(SlideType, {
        message: "Tipo de slide no válido",
    }),
    priority: z.number()
        .int("La prioridad debe ser un número entero")
        .min(0, "La prioridad no puede ser negativa")
        .max(10, "La prioridad no puede ser mayor a 10"),
    active: z.boolean(),
    start_at: TimestamptzSchema.nullable(),
    end_at: TimestamptzSchema.nullable(),
});

/** Full slide resource as returned by the API (ISO timestamps as strings). */
export const SlideSchema = SlideBaseSchema
    .safeExtend({
        id: UuidSchema,
        created_at: TimestamptzSchema,
        updated_at: TimestamptzSchema.nullable(),
        deleted_at: TimestamptzSchema.nullable(),
    })
    .refine(slideDateRefinement.refine, slideDateRefinement.params)
    .refine(slideCouponCodeRefinement.refine, slideCouponCodeRefinement.params)
    .refine(slideRedirectRefinement.refine, slideRedirectRefinement.params);

/** Public-facing subset (no audit / soft-delete fields). */
export const ViewSlideSchema = SlideBaseSchema
    .safeExtend({
        id: UuidSchema,
    })
    .refine(slideDateRefinement.refine, slideDateRefinement.params)
    .refine(slideCouponCodeRefinement.refine, slideCouponCodeRefinement.params)
    .refine(slideRedirectRefinement.refine, slideRedirectRefinement.params);

/** Create payload */
const CreateSlideBodySchema = SlideBaseSchema
    .extend({
        active: z.boolean().optional().default(true),
        priority: z.number().int().min(0).optional().default(0),
    })
    .partial({
        badge_text: true,
        text_color: true,
        button_color: true,
        start_at: true,
        end_at: true,
        coupon_code: true,
    });

/** Create schema without date refinement (safe for .omit()/.pick() in forms). */
export const CreateSlideFormSchema = CreateSlideBodySchema;

/** Create schema with full validation including date refinement. */
export const CreateSlideSchema = CreateSlideBodySchema
    .refine(slideDateRefinement.refine, slideDateRefinement.params)
    .refine(slideCouponCodeRefinement.refine, slideCouponCodeRefinement.params)
    .refine(slideRedirectRefinement.refine, slideRedirectRefinement.params);

/** Update payload */
const UpdateSlideBodySchema = SlideBaseSchema
    .partial()
    .refine((body) => Object.keys(body).length > 0, {
        message: 'Se requiere al menos un campo para actualizar',
    });

/** Update schema without date refinement (safe for .omit()/.pick() in forms). */
export const UpdateSlideFormSchema = UpdateSlideBodySchema;

/** Update schema with full validation including date refinement. */
export const UpdateSlideSchema = UpdateSlideBodySchema
    .refine(slideDateRefinement.refine, slideDateRefinement.params)
    .refine(slideCouponCodeRefinement.refine, slideCouponCodeRefinement.params)
    .refine(slideRedirectRefinement.refine, slideRedirectRefinement.params);

/** Alias — PATCH uses the same partial contract as update. */
export const PatchSlideSchema = UpdateSlideSchema;

/** Query params schema for GET list */
export const ListSlidesQuerySchema = PaginationQuerySchema.extend({
    search: z.string().min(1).max(100).optional(),
    type: z.enum(SlideType).optional(),
    active: BooleanQuerySchema,
});

/** Canonical list response: `{ data: Slide[], meta: PaginationMeta }`. */
export const SlideListResponseSchema = PaginatedDataSchema(SlideSchema);