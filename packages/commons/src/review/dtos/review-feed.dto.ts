import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	ListReviewsFeedQuerySchema,
	MyReviewItemSchema,
	MyReviewListResponseSchema,
	OfferReviewItemSchema,
	PublicReviewItemSchema,
	PublicReviewListResponseSchema,
} from "../schemas/review-feed.schema";

export type PublicReviewItemDto = z.infer<typeof PublicReviewItemSchema>;
export type OfferReviewItemDto = z.infer<typeof OfferReviewItemSchema>;
export type MyReviewItemDto = z.infer<typeof MyReviewItemSchema>;

/** Page + limit, shared by the three review feeds. */
export type ListReviewsFeedQuery = z.infer<typeof ListReviewsFeedQuerySchema>;

export type PublicReviewPaginatedData = PaginatedData<PublicReviewItemDto>;
export type OfferReviewPaginatedData = PaginatedData<OfferReviewItemDto>;
export type MyReviewPaginatedData = PaginatedData<MyReviewItemDto>;

export type PublicReviewListResponse = z.infer<
	typeof PublicReviewListResponseSchema
>;
export type MyReviewListResponse = z.infer<typeof MyReviewListResponseSchema>;
