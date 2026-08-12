import type { OfferDto, OfferWithBusiness } from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type { OfferListRow, OfferRow } from './offers.repository';

/**
 * Maps offer persistence rows → API DTOs.
 * Single place that crosses the DB / wire boundary (dates, numerics, joins).
 */
export class OfferMapper {
  /** List/detail row with business + location joins → public response. */
  static toResponse(row: OfferListRow): OfferWithBusiness {
    return {
      id: row.id,
      business_id: row.business_id,
      business_location_id: row.business_location_id,
      title: row.title,
      description: row.description,
      image: row.image,
      category_ids: row.category_ids,
      categories: row.category_ids.map((id, i) => ({
        id,
        name: row.category_names[i] ?? '',
        slug: row.category_slugs[i] ?? '',
      })),
      original_price: toNumber(row.original_price),
      discounted_price: toNumber(row.discounted_price),
      discount_percentage: toNumberOrNull(row.discount_percentage),
      stock: row.stock,
      initial_stock: row.initial_stock,
      pickup_start: row.pickup_start.toISOString(),
      pickup_end: row.pickup_end.toISOString(),
      is_active: row.is_active,
      includes: row.includes,
      allergens: row.allergens,
      rating: toNumber(row.rating),
      review_count: row.review_count,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      business: {
        id: row.business_id,
        name: row.business_name,
        slug: row.business_slug,
        image: row.business_image,
        rating: toNumberOrNull(row.business_rating),
      },
      location: {
        id: row.business_location_id,
        name: row.location_name,
        address: row.location_address,
        latitude: toNumber(row.location_latitude),
        longitude: toNumber(row.location_longitude),
        zone: row.location_zone,
      },
    };
  }

  /** Raw offer row + category ids → OfferDto (mutations). */
  static toDto(row: OfferRow, categoryIds: string[]): OfferDto {
    return {
      id: row.id,
      business_id: row.business_id,
      business_location_id: row.business_location_id,
      title: row.title,
      description: row.description,
      image: row.image,
      category_ids: categoryIds,
      original_price: toNumber(row.original_price),
      discounted_price: toNumber(row.discounted_price),
      discount_percentage: toNumberOrNull(row.discount_percentage),
      stock: row.stock,
      initial_stock: row.initial_stock,
      pickup_start: row.pickup_start.toISOString(),
      pickup_end: row.pickup_end.toISOString(),
      is_active: row.is_active,
      includes: row.includes,
      allergens: row.allergens,
      rating: toNumber(row.rating),
      review_count: row.review_count,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
