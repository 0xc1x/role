import { z } from "zod";
import { PaginatedDataSchema } from "../../_common/schemas/api.schema";
import {
	NonNegativeIntSchema,
	PositiveNumberSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

export const OfferSchema = z.object({
	id: UuidSchema,
	business_id: UuidSchema,
	business_location_id: UuidSchema,
	title: z.string().min(1),
	description: z.string().nullable(),
	image: z.string().nullable(),
	category_ids: z.array(UuidSchema),
	original_price: PositiveNumberSchema,
	discounted_price: PositiveNumberSchema,
	discount_percentage: z.number().nullable(),
	stock: NonNegativeIntSchema,
	initial_stock: NonNegativeIntSchema,
	pickup_start: TimestamptzSchema,
	pickup_end: TimestamptzSchema,
	is_active: z.boolean(),
	includes: z.string().nullable(),
	allergens: z.string().nullable(),
	rating: z.number(),
	review_count: z.number().int(),
	created_at: TimestamptzSchema,
	updated_at: TimestamptzSchema,
});

export const ViewOfferSchema = OfferSchema.pick({
	id: true,
	business_id: true,
	business_location_id: true,
	title: true,
	description: true,
	image: true,
	category_ids: true,
	original_price: true,
	discounted_price: true,
	discount_percentage: true,
	stock: true,
	initial_stock: true,
	pickup_start: true,
	pickup_end: true,
	is_active: true,
	includes: true,
	allergens: true,
	rating: true,
	review_count: true,
});

/**
 * La ventana de pickup, en ENTRADA, y por eso con un schema distinto al laxo.
 *
 * `TimestamptzSchema` es `z.string().min(1)` a propósito —PostgREST devuelve
 * `+00:00` y nadie quiere un 500 en una lectura— así que `pickup_start: "hola"`
 * pasaba el schema y llegaba al `.refine` de la ventana. Ahí `new Date("hola")` es
 * `Invalid Date`, la comparación es `NaN > NaN` —`false`—, y el 400 le decía
 * "pickup_end must be after pickup_start": el mensaje culpaba al campo equivocado y
 * mandaba al operador a corregir algo que estaba bien.
 *
 * `local: true` además de `offset: true` porque este valor NO viene de PostgREST
 * sino de `DateTimePicker`, cuyo `DATE_TIME_FORMAT` es `yyyy-MM-dd'T'HH:mm` —sin
 * offset y sin segundos. El schema estricto del repo (`business-stats.schema.ts:111`,
 * `z.iso.datetime({ offset: true })`) rechaza ese valor: copiar el patrón de stats
 * tal cual rompe el formulario de publicaciones. Con `local` se aceptan las dos
 * formas reales, la que manda el panel y la que devuelve la base.
 */
const PickupInstantSchema = z.iso.datetime({ offset: true, local: true });

const CreateOfferFieldsSchema = z.object({
	business_id: UuidSchema,
	business_location_id: UuidSchema,
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	image: z.string().nullable().optional(),
	category_ids: z.array(UuidSchema).min(1),
	original_price: PositiveNumberSchema,
	discounted_price: PositiveNumberSchema,
	stock: NonNegativeIntSchema.optional(),
	initial_stock: NonNegativeIntSchema.optional(),
	pickup_start: PickupInstantSchema,
	pickup_end: PickupInstantSchema,
	is_active: z.boolean().optional(),
	includes: z.string().nullable().optional(),
	allergens: z.string().nullable().optional(),
});

export const CreateOfferSchema = CreateOfferFieldsSchema.refine(
	(body) => body.discounted_price <= body.original_price,
	{
		message: "discounted_price must be less than or equal to original_price",
		path: ["discounted_price"],
	},
).refine(
	(body) =>
		new Date(body.pickup_end).getTime() > new Date(body.pickup_start).getTime(),
	{
		message: "pickup_end must be after pickup_start",
		path: ["pickup_end"],
	},
);

export const UpdateOfferSchema = CreateOfferFieldsSchema.partial()
	.omit({
		business_id: true,
	})
	.refine((body) => Object.keys(body).length > 0, {
		message: "At least one field is required",
	})
	.superRefine((body, ctx) => {
		if (
			body.discounted_price !== undefined &&
			body.original_price !== undefined &&
			body.discounted_price > body.original_price
		) {
			ctx.addIssue({
				code: "custom",
				message:
					"discounted_price must be less than or equal to original_price",
				path: ["discounted_price"],
			});
		}
		if (
			body.pickup_start !== undefined &&
			body.pickup_end !== undefined &&
			new Date(body.pickup_end).getTime() <=
				new Date(body.pickup_start).getTime()
		) {
			ctx.addIssue({
				code: "custom",
				message: "pickup_end must be after pickup_start",
				path: ["pickup_end"],
			});
		}
	});

export const PatchOfferSchema = UpdateOfferSchema;

export const OfferListResponseSchema = PaginatedDataSchema(OfferSchema);

// ─── `GET /offers/zones` — espejo de `public.popular_zones` ────────────────

/**
 * One row of `public.popular_zones`: a `business_locations.zone` and how many
 * reservable offers sit in it.
 *
 * `zone` is `.min(1)` and not `.nullable()` because the RPC already filters
 * `zone is not null and zone <> ''` in SQL. A blank or missing zone is a
 * location that has not been placed on the map yet, and it is not a zone with
 * zero deals — emitting it as one would put an empty chip in the UI.
 */
export const PopularZoneSchema = z.object({
	zone: z.string().min(1),
	/** `count(*)` — the RPC's `deals bigint`, as a number like every count here. */
	deals: z.number().int().nonnegative(),
});

/**
 * `GET /offers/zones` response: the RPC's result set, UNPAGINATED — most deals
 * first, then zone name ascending. Not a `PaginatedDataSchema`, because the RPC
 * returns a top-N and never a total.
 */
export const PopularZonesResponseSchema = z.array(PopularZoneSchema);

// ─── Embeds de la proyección "oferta con negocio" ───────────────────────────

export const OfferBusinessEmbedSchema = z.object({
	id: UuidSchema,
	name: z.string().min(1),
	slug: z.string().min(1),
	image: z.string().nullable(),
	rating: z.number().nullable(),
});

export const OfferLocationEmbedSchema = z.object({
	id: UuidSchema,
	name: z.string().min(1),
	address: z.string().min(1),
	latitude: z.number(),
	longitude: z.number(),
	zone: z.string().nullable(),
});

export const OfferCategoryEmbedSchema = z.object({
	id: UuidSchema,
	name: z.string().min(1),
	slug: z.string().min(1),
});

/** Oferta + negocio + ubicación + categorías (listados de ofertas). */
export const OfferWithBusinessSchema = OfferSchema.extend({
	categories: z.array(OfferCategoryEmbedSchema),
	business: OfferBusinessEmbedSchema,
	location: OfferLocationEmbedSchema,
	/**
	 * Distance in km from the queried point, `null` when the request carried no
	 * `lat`/`lng` — the same projection `active_offers_near` returns.
	 *
	 * Optional (and not merely nullable) because this shape is also served by
	 * the projections that have no point to measure from: `GET /offers/:id`, the
	 * random hero and the saved-offers list. Those send `null`; a consumer
	 * building the shape by hand is not forced to invent a distance.
	 */
	distance_km: z.number().nullable().optional(),
});
