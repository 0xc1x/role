import type {
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '@0xc1x/role-commons';
import { toNumber } from '../../common/utils/numeric';
import { pickDefined } from '../../common/utils/pick';
import type {
  CategoryInsert,
  CategoryRow,
  CategoryUpdate,
} from './categories.repository';

/**
 * Anything this mapper accepts: a plain row, or a list row that also carries
 * the `active_count` aggregate.
 *
 * The spread into the return is what makes `active_count` OPTIONAL on the wire:
 * the list supplies it and the single-resource reads (`getById`, `create`,
 * `update`, `remove`) do not run the aggregate at all, so they omit the field
 * instead of reporting a `0` they never measured.
 */
type CategoryDtoSource = CategoryRow & { active_count?: string | number };

export function toCategoryDto(row: CategoryDtoSource): CategoryDto {
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
    // `coalesce(..., 0)` in SQL, so this is never absent on a list row — see
    // `CategoryListRow` for why the value arrives as a string.
    ...(row.active_count === undefined
      ? {}
      : { active_count: toNumber(row.active_count) }),
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
  ]);
}

// backwards compat for tests
export const CategoryMapper = {
  toDto: toCategoryDto,
  toInsert: toCategoryInsert,
  toUpdate: toCategoryUpdate,
};
