import { CreateSlideDto, SlideDto, UpdateSlideDto } from '@0xc1x/role-commons';

import { SlideInsert, SlideRow, SlideUpdate } from '../slides.repository';

export function toSlideDto(row: SlideRow): SlideDto {
  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    badge_text: row.badge_text,
    cta_label: row.cta_label ?? '',
    redirect_url: row.redirect_url,
    coupon_code: row.coupon_code,
    image_url: row.image_url,
    text_color: row.text_color,
    button_color: row.button_color,
    type: row.type as SlideDto['type'],
    priority: Number(row.priority),
    active: row.active,
    start_at: row.start_at?.toISOString() ?? null,
    end_at: row.end_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at?.toISOString() ?? null,
    deleted_at: row.deleted_at?.toISOString() ?? null,
  };
}

export function toSlideInsert(dto: CreateSlideDto): SlideInsert {
  return {
    title: dto.title,
    caption: dto.caption,
    badge_text: dto.badge_text ?? null,
    cta_label: dto.cta_label ?? null,
    redirect_url: dto.redirect_url || null,
    coupon_code: dto.coupon_code ?? null,
    image_url: dto.image_url || null,
    text_color: dto.text_color ?? null,
    button_color: dto.button_color ?? null,
    type: dto.type,
    priority: dto.priority,
    active: dto.active,
    start_at: dto.start_at ? new Date(dto.start_at) : null,
    end_at: dto.end_at ? new Date(dto.end_at) : null,
  };
}

export function toSlideUpdate(dto: UpdateSlideDto): SlideUpdate {
  const update: SlideUpdate = {};
  const directKeys = [
    'title',
    'caption',
    'badge_text',
    'cta_label',
    'coupon_code',
    'text_color',
    'button_color',
    'type',
    'priority',
    'active',
  ] as const;
  for (const k of directKeys) {
    if (dto[k] !== undefined) (update as Record<string, unknown>)[k] = dto[k];
  }
  if (dto.redirect_url !== undefined) update.redirect_url = dto.redirect_url || null;
  if (dto.image_url !== undefined) update.image_url = dto.image_url || null;
  if (dto.start_at !== undefined) update.start_at = dto.start_at ? new Date(dto.start_at) : null;
  if (dto.end_at !== undefined) update.end_at = dto.end_at ? new Date(dto.end_at) : null;
  return update;
}

export const SlideMapper = {
  toDto: toSlideDto,
  toInsert: toSlideInsert,
  toUpdate: toSlideUpdate,
};
