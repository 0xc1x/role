import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	ListOffersQuerySchema,
	ListZonesQuerySchema,
} from "../schemas/offer-query.schema";
import type {
	CreateOfferSchema,
	OfferListResponseSchema,
	OfferSchema,
	OfferWithBusinessSchema,
	PatchOfferSchema,
	PopularZoneSchema,
	PopularZonesResponseSchema,
	UpdateOfferSchema,
	ViewOfferSchema,
} from "../schemas/offer.schema";

export type OfferDto = z.infer<typeof OfferSchema>;
export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;
export type UpdateOfferDto = z.infer<typeof UpdateOfferSchema>;
export type ViewOfferDto = z.infer<typeof ViewOfferSchema>;
export type PatchOfferDto = z.infer<typeof PatchOfferSchema>;
export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;
export type OfferPaginatedData = PaginatedData<OfferDto>;

export type ListOffersQuery = z.infer<typeof ListOffersQuerySchema>;

/**
 * `GET /offers/zones` — the `public.popular_zones` parameter set and result set.
 * Unpaginated on purpose; see {@link ListZonesQuerySchema}.
 */
export type ListZonesQuery = z.infer<typeof ListZonesQuerySchema>;
export type PopularZoneDto = z.infer<typeof PopularZoneSchema>;
export type PopularZonesResponse = z.infer<typeof PopularZonesResponseSchema>;

/**
 * Oferta con embeds de negocio, ubicación y categorías (proyección PostgREST/API).
 *
 * The list/detail shape also carries `distance_km` (nullable): `GET /offers`
 * projects it when the request carries `lat`/`lng`, and it is `null` otherwise.
 * It is declared in {@link OfferWithBusinessSchema} — this file only derives the
 * type, so the field has exactly one definition.
 */
export type OfferWithBusiness = z.infer<typeof OfferWithBusinessSchema>;
