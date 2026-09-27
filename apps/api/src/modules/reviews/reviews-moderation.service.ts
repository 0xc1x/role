import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type HideReviewDto,
  type ListReviewsForModerationQuery,
  type ReviewModerationItemDto,
  type ReviewModerationPaginatedData,
} from '@0xc1x/role-commons';
import type { Database } from '../../database/database.module';
import { ReviewModerationMapper } from './reviews-moderation.mapper';
import { ReviewsRepository } from './reviews.repository';

/**
 * Moderación de reseñas para el panel. Admin-only (lo aplica `@Roles('admin')`).
 *
 * Ocultar, NUNCA borrar: la fila se queda porque `UNIQUE(user_id, order_id)`
 * tiene que seguir impidiendo que el autor vuelva a publicar lo mismo, y porque
 * el motivo escrito por el operador es el registro de apelación. Un borrado
 * devolvería las dos cosas.
 */
@Injectable()
export class ReviewsModerationService {
  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  async list(
    query: ListReviewsForModerationQuery,
  ): Promise<ReviewModerationPaginatedData> {
    const { rows, total } =
      await this.reviewsRepository.listForModeration(query);
    return paginatedDataFromQuery(
      rows.map((row) => ReviewModerationMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /** Oculta la reseña y registra el motivo. `adminUserId` es el moderador. */
  hide(
    id: string,
    input: HideReviewDto,
    adminUserId: string,
  ): Promise<ReviewModerationItemDto> {
    // Idempotente: ocultar dos veces la misma fila no es un error, es el mismo
    // estado. Un 409 obligaría al panel a interpretar un caso que no falla.
    return this.applyModeration(
      id,
      {
        is_hidden: true,
        hidden_reason: input.hidden_reason,
      },
      adminUserId,
    );
  }

  /**
   * Restaura la visibilidad.
   *
   * `hidden_reason` NO se limpia: es el registro de por qué se ocultó, y borrar
   * el motivo al desocultar dejaría la decisión de restauración sin explicación
   * justo cuando el negocio viene a preguntar. El panel lo muestra como "último
   * motivo registrado", no como "motivo vigente".
   */
  unhide(id: string, adminUserId: string): Promise<ReviewModerationItemDto> {
    return this.applyModeration(id, { is_hidden: false }, adminUserId);
  }

  private async applyModeration(
    id: string,
    values: { is_hidden: boolean; hidden_reason?: string },
    adminUserId: string,
  ): Promise<ReviewModerationItemDto> {
    return this.reviewsRepository.transaction(async (tx: Database) => {
      const before = await this.reviewsRepository.findModerationRow(tx, id);
      if (!before) {
        // En español a propósito: este mensaje llega al toast del operador y la
        // capa de traducción del panel solo traduce lo que está en inglés.
        throw new NotFoundException(`Reseña ${id} no encontrada`);
      }

      const updated = await this.reviewsRepository.setHidden(tx, id, {
        ...values,
        moderated_at: new Date(),
        moderated_by: adminUserId,
      });
      if (!updated) {
        throw new NotFoundException(`Reseña ${id} no encontrada`);
      }

      // Espejo de los triggers: sin esto la fila desaparece de la página del
      // negocio pero sigue contando en `businesses.rating`, que es el número que
      // el operador cree haber corregido.
      await this.reviewsRepository.recalcBusinessRating(tx, before.business_id);
      const offerId = await this.reviewsRepository.findOfferIdByOrder(
        tx,
        before.order_id,
      );
      if (offerId) {
        await this.reviewsRepository.recalcOfferRating(tx, offerId);
      }

      return ReviewModerationMapper.toDto(updated);
    });
  }
}
