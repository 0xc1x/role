import type { CreateTipDto, TipDto, UpdateTipDto } from '@0xc1x/role-commons';
import { pickDefined } from '../../common/utils/pick';
import type { TipInsert, TipRow, TipUpdate } from './tips.repository';

export function toTipDto(row: TipRow): TipDto {
  return {
    id: row.id,
    content: row.content,
    active: row.active,
    created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
    updated_at: row.updated_at?.toISOString() ?? null,
    deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
  };
}

export function toTipInsert(dto: CreateTipDto): TipInsert {
  return {
    content: dto.content,
    active: dto.active ?? true,
  };
}

export function toTipUpdate(dto: UpdateTipDto): TipUpdate {
  return pickDefined(dto, ['content', 'active']) as TipUpdate;
}

export const TipMapper = {
  toDto: toTipDto,
  toInsert: toTipInsert,
  toUpdate: toTipUpdate,
};
