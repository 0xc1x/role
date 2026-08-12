import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CategorySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  ViewCategorySchema,
  PatchCategorySchema,
  ListCategoriesQuerySchema,
  CategoryListResponseSchema,
} from '../schemas/category.schema';

/** Wire DTO for a category resource (matches {@link CategorySchema}). */
export type CategoryDto = z.infer<typeof CategorySchema>;

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
export type ViewCategoryDto = z.infer<typeof ViewCategorySchema>;
export type PatchCategoryDto = z.infer<typeof PatchCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;

/** Paginated list response for categories. */
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

/** Equivalent explicit form — prefer this for service return types. */
export type CategoryPaginatedData = PaginatedData<CategoryDto>;
