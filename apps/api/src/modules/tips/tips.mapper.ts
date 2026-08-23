import type { CreateTipDto, TipDto, UpdateTipDto } from '@0xc1x/role-commons';
import type { TipInsert, TipRow, TipUpdate } from './tips.repository';

/**
 * Maps tip DB rows ↔ API DTOs (dates, soft-delete).
 */
export class TipMapper {
  static toDto(row: TipRow): TipDto {
    return {
      id: row.id,
      content: row.content,
      active: row.active,
      created_at: row.created_at?.toISOString() ?? new Date().toISOString(),
      updated_at: row.updated_at?.toISOString() ?? null,
      deleted_at: row.deleted_at ? row.deleted_at.toISOString() : null,
    };
  }

  static toInsert(dto: CreateTipDto): TipInsert {
    return {
      content: dto.content,
      active: dto.active ?? true,
    };
  }

  static toUpdate(dto: UpdateTipDto): TipUpdate {
    const update: TipUpdate = {};
    if (dto.content !== undefined) update.content = dto.content;
    if (dto.active !== undefined) update.active = dto.active;
    return update;
  }
}
