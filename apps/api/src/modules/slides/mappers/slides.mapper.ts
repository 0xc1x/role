import { CreateSlideDto, SlideDto, UpdateSlideDto } from '@0xc1x/role-commons';

import { SlideInsert, SlideRow, SlideUpdate } from '../slides.repository';

/**
 * SlideMapper
 *
 * Responsable de la conversión entre:
 * - Entidades de base de datos (Drizzle)
 * - DTOs de la API
 *
 * Maneja conversiones de tipos, fechas, valores nulos y campos opcionales.
 */
export class SlideMapper {
  /**
   * Database Row → API DTO
   * Convierte tipos de persistencia (Date, numeric, nullable)
   * a tipos expuestos por la API (string ISO, number, etc.)
   */
  static toDto(row: SlideRow): SlideDto {
    return {
      id: row.id,
      title: row.title,
      caption: row.caption,
      badge_text: row.badge_text,

      cta_label: row.cta_label ?? '',
      redirect_url: row.redirect_url ?? '',
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

  /**
   * Create DTO → Database Insert
   * Normaliza los datos recibidos por HTTP al formato esperado por Drizzle.
   * Todos los campos opcionales se convierten explícitamente a null cuando no vienen.
   */
  static toInsert(dto: CreateSlideDto): SlideInsert {
    return {
      title: dto.title,
      caption: dto.caption,

      badge_text: dto.badge_text ?? null,
      cta_label: dto.cta_label ?? null,
      redirect_url: dto.redirect_url ?? null,
      image_url: dto.image_url ?? '',
      text_color: dto.text_color ?? null,
      button_color: dto.button_color ?? null,

      type: dto.type,
      priority: dto.priority,

      active: dto.active,

      start_at: dto.start_at ? new Date(dto.start_at) : null,
      end_at: dto.end_at ? new Date(dto.end_at) : null,
    };
  }

  /**
   * Update DTO → Database Update
   * Solo incluye los campos que fueron enviados en el PATCH (partial update).
   * Evita sobrescribir campos con undefined.
   */
  static toUpdate(dto: UpdateSlideDto): SlideUpdate {
    const update: SlideUpdate = {};

    if (dto.title !== undefined) update.title = dto.title;
    if (dto.caption !== undefined) update.caption = dto.caption;
    if (dto.badge_text !== undefined) update.badge_text = dto.badge_text;
    if (dto.cta_label !== undefined) update.cta_label = dto.cta_label;
    if (dto.redirect_url !== undefined) update.redirect_url = dto.redirect_url;
    if (dto.image_url !== undefined) update.image_url = dto.image_url ?? '';
    if (dto.text_color !== undefined) update.text_color = dto.text_color;
    if (dto.button_color !== undefined) update.button_color = dto.button_color;
    if (dto.type !== undefined) update.type = dto.type;
    if (dto.priority !== undefined) update.priority = dto.priority;
    if (dto.active !== undefined) update.active = dto.active;

    if (dto.start_at !== undefined) {
      update.start_at = dto.start_at ? new Date(dto.start_at) : null;
    }

    if (dto.end_at !== undefined) {
      update.end_at = dto.end_at ? new Date(dto.end_at) : null;
    }

    return update;
  }
}
