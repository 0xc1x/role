import type {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '@0xc1x/role-commons';
import { pickDefined } from '../../common/utils/pick';
import type {
  CategoryInsert,
  CategoryRow,
  CategoryUpdate,
} from './categories.repository';

export function toCategoryDto(row: CategoryRow): CategoryDto {
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

export function toCategoryInsert(
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

export function toCategoryUpdate(dto: UpdateCategoryDto): CategoryUpdate {
  return pickDefined(dto, [
    'name',
    'description',
    'emoji',
    'slug',
    'image_url',
    'active',
  ]) as CategoryUpdate;
}

// backwards compat for tests
export const CategoryMapper = {
  toDto: toCategoryDto,
  toInsert: toCategoryInsert,
  toUpdate: toCategoryUpdate,
};
