import type {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '@0xc1x/role-commons';
import type {
  CategoryInsert,
  CategoryRow,
  CategoryUpdate,
} from './categories.repository';

/**
 * Maps category DB rows ↔ API DTOs (dates, soft-delete).
 */
export class CategoryMapper {
  static toDto(row: CategoryRow): CategoryDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      emoji: row.emoji,
      slug: row.slug,
      image_url: row.image_url,
      active: row.active,
      created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: row.updated_at?.toISOString() ?? new Date().toISOString(),
      deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    };
  }

  static toInsert(
    dto: CreateCategoryDto,
    slug: string,
  ): CategoryInsert {
    return {
      name: dto.name,
      description: dto.description ?? null,
      emoji: dto.emoji ?? null,
      slug,
      image_url: dto.image_url ?? null,
      active: dto.active ?? true,
    };
  }

  static toUpdate(dto: UpdateCategoryDto): CategoryUpdate {
    const update: CategoryUpdate = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.emoji !== undefined) update.emoji = dto.emoji;
    if (dto.slug !== undefined) update.slug = dto.slug;
    if (dto.image_url !== undefined) update.image_url = dto.image_url;
    if (dto.active !== undefined) update.active = dto.active;
    return update;
  }
}
