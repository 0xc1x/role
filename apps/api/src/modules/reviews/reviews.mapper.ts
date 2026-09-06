import type { ReviewDto } from '@0xc1x/role-commons';
import type { ReviewRow } from './reviews.repository';

/**
 * Maps review rows ↔ API DTOs (fechas ISO, ratings numéricos).
 */
export class ReviewMapper {
  static toDto(row: ReviewRow): ReviewDto {
    return {
      id: row.id,
      user_id: row.user_id,
      business_id: row.business_id,
      order_id: row.order_id,
      rating: row.rating === null ? null : Number(row.rating),
      comment: row.comment,
      product_rating:
        row.product_rating === null ? null : Number(row.product_rating),
      business_rating:
        row.business_rating === null ? null : Number(row.business_rating),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
