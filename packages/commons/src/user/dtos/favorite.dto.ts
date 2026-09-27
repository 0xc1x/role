import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	AddFavoriteRequestSchema,
	CreateFavoriteSchema,
	FavoriteSchema,
	FavoriteWithOfferSchema,
	ListFavoritesQuerySchema,
} from "../schemas/favorite.schema";

export type FavoriteDto = z.infer<typeof FavoriteSchema>;
export type CreateFavoriteDto = z.infer<typeof CreateFavoriteSchema>;
export type AddFavoriteRequestDto = z.infer<typeof AddFavoriteRequestSchema>;
export type ListFavoritesQuery = z.infer<typeof ListFavoritesQuerySchema>;
export type FavoriteWithOfferDto = z.infer<typeof FavoriteWithOfferSchema>;

/** Paginated list response for a user's favorites. */
export type FavoritePaginatedData = PaginatedData<FavoriteWithOfferDto>;
