import type { ReviewModerationItemDto } from '@0xc1x/role-commons';
import type { ReviewModerationRow } from './reviews.repository';

/**
 * Fila de moderación → DTO de la bandeja.
 *
 * `moderated_by` viaja como uuid Y como `moderated_by_name`. El uuid es lo que
 * hay en la base; el nombre es lo único que puede leer una persona, y sin él el
 * operador tiene que abrir la ficha del admin para saber si el ocultamiento lo
 * hizo Ana o el sistema. Cuando no hay nombre la respuesta es `null`, nunca un
 * texto de relleno: `null` significa dos cosas distintas y reales (nunca se
 * moderó, o la cuenta se borró) y un "Desconocido" las mezclaría.
 *
 * `moderation_reason` viaja como el token crudo, NO como la etiqueta en español:
 * el token es lo que se puede filtrar y comparar, y traducirlo en el borde
 * convertiría un identificador estable en copy de panel que habría que cambiar
 * junto con cada fila ya guardada. La etiqueta la arma el panel, que es donde se
 * lee.
 */
export class ReviewModerationMapper {
  static toDto(row: ReviewModerationRow): ReviewModerationItemDto {
    return {
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      order_id: row.order_id,
      rating: row.rating,
      comment: row.comment,
      product_rating: row.product_rating,
      business_rating: row.business_rating,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      is_hidden: row.is_hidden,
      moderated_at: row.moderated_at?.toISOString() ?? null,
      moderated_by: row.moderated_by,
      moderated_by_name: row.moderated_by_name,
      moderation_reason: row.moderation_reason,
      hidden_reason: row.hidden_reason,
      author_name: row.author_name,
      business_name: row.business_name,
    };
  }
}
