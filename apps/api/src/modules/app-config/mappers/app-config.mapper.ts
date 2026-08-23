import {
  CreateAppConfigDto,
  UpdateAppConfigDto,
  type AppConfigDto,
  type PublicAppConfigDto,
} from '@0xc1x/role-commons';
import type {
  AppConfigInsert,
  AppConfigRow,
  AppConfigUpdate,
} from '../app-config.repository';

/**
 * AppConfigMapper
 *
 * Conversión entre filas de DB (Drizzle) y DTOs de la API.
 */
export class AppConfigMapper {
  static toDto(row: AppConfigRow): AppConfigDto {
    return {
      key: row.key,
      value: row.value as AppConfigDto['value'],
      value_type: row.value_type as AppConfigDto['value_type'],
      category: row.category as AppConfigDto['category'],
      label: row.label,
      description: row.description,
      is_public: row.is_public,
      active: row.active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toPublicDto(row: AppConfigRow): PublicAppConfigDto {
    return {
      key: row.key,
      value: row.value as PublicAppConfigDto['value'],
      value_type: row.value_type as PublicAppConfigDto['value_type'],
    };
  }

  static toPublicList(rows: AppConfigRow[]): PublicAppConfigDto[] {
    return rows.map((row) => this.toPublicDto(row));
  }

  static toInsert(dto: CreateAppConfigDto): AppConfigInsert {
    return {
      key: dto.key,
      value: dto.value,
      value_type: dto.value_type,
      category: dto.category,
      label: dto.label,
      description: dto.description,
      is_public: dto.is_public,
      active: dto.active,
    };
  }

  static toUpdate(dto: UpdateAppConfigDto): AppConfigUpdate {
    const update: AppConfigUpdate = {};
    if (dto.value !== undefined) update.value = dto.value;
    if (dto.value_type !== undefined) update.value_type = dto.value_type;
    if (dto.category !== undefined) update.category = dto.category;
    if (dto.label !== undefined) update.label = dto.label;
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.is_public !== undefined) update.is_public = dto.is_public;
    if (dto.active !== undefined) update.active = dto.active;
    return update;
  }
}
