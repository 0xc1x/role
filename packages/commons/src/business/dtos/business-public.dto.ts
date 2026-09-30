import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	ListPublicBusinessesQuerySchema,
	PublicBusinessListResponseSchema,
	PublicBusinessSchema,
	PublicBusinessStorefrontSchema,
} from "../schemas/business-public.schema";

export type PublicBusinessDto = z.infer<typeof PublicBusinessSchema>;
export type ListPublicBusinessesQuery = z.infer<
	typeof ListPublicBusinessesQuerySchema
>;
export type PublicBusinessStorefrontDto = z.infer<
	typeof PublicBusinessStorefrontSchema
>;

export type PublicBusinessPaginatedData = PaginatedData<PublicBusinessDto>;

export type PublicBusinessListResponse = z.infer<
	typeof PublicBusinessListResponseSchema
>;
