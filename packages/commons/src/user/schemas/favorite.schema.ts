import { z } from "zod";
import { PaginationQuerySchema } from "../../_common/schemas/api.schema";
import { OfferWithBusinessSchema } from "../../catalog/schemas/offer.schema";
import { TimestamptzSchema, UuidSchema } from "../../_common/schemas/common";

export const FavoriteSchema = z.object({
	id: UuidSchema,
	user_id: UuidSchema,
	offer_id: UuidSchema,
	created_at: TimestamptzSchema,
});

export const CreateFavoriteSchema = z.object({
	user_id: UuidSchema,
	offer_id: UuidSchema,
});

/**
 * Body for adding a favorite.
 *
 * `user_id` is absent ON PURPOSE, while {@link CreateFavoriteSchema} keeps it:
 * that schema mirrors the table row (and is what a service-level insert is
 * built from), whereas this one is a public request body. The owner of a
 * favorite is always the authenticated caller, so accepting it from the wire
 * would only create a way to favorite on someone else's behalf.
 */
export const AddFavoriteRequestSchema = z.object({
	offer_id: UuidSchema,
});

export const ListFavoritesQuerySchema = PaginationQuerySchema;

/**
 * A favorite with the offer projection a card needs to render.
 *
 * The embedded offer reuses the shared {@link OfferWithBusinessSchema} instead
 * of restating offer fields here: an offer inside a favorites card is the same
 * offer the catalog returns, and a second definition would be a third source
 * of truth to keep in sync.
 *
 * `offer` is nullable because the favorite row can outlive its offer — the
 * consumer must be able to tell "no longer available" apart from "offer with
 * zero stock" instead of rendering invented availability.
 */
export const FavoriteWithOfferSchema = z.object({
	id: UuidSchema,
	offer_id: UuidSchema,
	created_at: TimestamptzSchema,
	offer: OfferWithBusinessSchema.nullable(),
});
