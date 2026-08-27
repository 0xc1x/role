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

export function toAppConfigDto(row: AppConfigRow): AppConfigDto {
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

export function toPublicAppConfigDto(row: AppConfigRow): PublicAppConfigDto {
  return {
    key: row.key,
    value: row.value as PublicAppConfigDto['value'],
    value_type: row.value_type as PublicAppConfigDto['value_type'],
  };
}

export function toPublicAppConfigList(rows: AppConfigRow[]): PublicAppConfigDto[] {
  return rows.map((row) => toPublicAppConfigDto(row));
}

export function toAppConfigInsert(dto: CreateAppConfigDto): AppConfigInsert {
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

export function toAppConfigUpdate(dto: UpdateAppConfigDto): AppConfigUpdate {
  const keys = [
    'value',
    'value_type',
    'category',
    'label',
    'description',
    'is_public',
    'active',
  ] as const;
  const out: AppConfigUpdate = {};
  for (const k of keys) if (dto[k] !== undefined) (out as Record<string, unknown>)[k] = dto[k];
  return out;
}

export const AppConfigMapper = {
  toDto: toAppConfigDto,
  toPublicDto: toPublicAppConfigDto,
  toPublicList: toPublicAppConfigList,
  toInsert: toAppConfigInsert,
  toUpdate: toAppConfigUpdate,
};
