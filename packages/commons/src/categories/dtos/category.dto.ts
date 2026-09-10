import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CategoryListResponseSchema,
  CategorySchema,
  CreateCategorySchema,
  UpdateCategorySchema,
  ListCategoriesQuerySchema,
  PatchCategorySchema,
  ViewCategorySchema,
} from '../schemas/category.schema';

/** Wire DTO for a category resource (matches {@link CategorySchema}). */
export type CategoryDto = z.infer<typeof CategorySchema>;

export type CreateCategoryDto = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof UpdateCategorySchema>;
export type ViewCategoryDto = z.infer<typeof ViewCategorySchema>;
export type PatchCategoryDto = z.infer<typeof PatchCategorySchema>;
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;
export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;

/** Paginated list response for categories. */
export type CategoryPaginatedData = PaginatedData<CategoryDto>;
