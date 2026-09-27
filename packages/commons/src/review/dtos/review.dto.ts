import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	CreateReviewRequestSchema,
	CreateReviewSchema,
	HideReviewSchema,
	ListReviewsForModerationQuerySchema,
	ReviewModerationItemSchema,
	ReviewModerationListResponseSchema,
	ReviewSchema,
	UpdateReviewSchema,
} from "../schemas/review.schema";

export type ReviewDto = z.infer<typeof ReviewSchema>;
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;
export type UpdateReviewDto = z.infer<typeof UpdateReviewSchema>;
export type CreateReviewRequestDto = z.infer<typeof CreateReviewRequestSchema>;

/** Fila de la bandeja de moderación (admin). */
export type ReviewModerationItemDto = z.infer<
	typeof ReviewModerationItemSchema
>;

export type ListReviewsForModerationQuery = z.infer<
	typeof ListReviewsForModerationQuerySchema
>;

/** Los tres estados del filtro de la bandeja: todas, ocultas, visibles. */
export type ReviewVisibility = ListReviewsForModerationQuery["visibility"];

/** Cuerpo de `PATCH /reviews/:id/hide`: el motivo es obligatorio. */
export type HideReviewDto = z.infer<typeof HideReviewSchema>;

export type ReviewModerationPaginatedData =
	PaginatedData<ReviewModerationItemDto>;

export type ReviewModerationListResponse = z.infer<
	typeof ReviewModerationListResponseSchema
>;
