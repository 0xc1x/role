import type {
  OfferDto,
  OfferWithBusiness,
  PopularZoneDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  OfferListRow,
  OfferRow,
  PopularZoneRow,
} from './offers.repository';

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
      // Already a `double precision` projection, so it crosses as a number. It
      // is `null` — not omitted — whenever the read had no point to measure
      // from, which is what `active_offers_near` returns in the same case.
      distance_km: row.distance_km,
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

  /**
   * `listPopularZones` rows → the `GET /offers/zones` response.
   *
   * Unpaginated, because `popular_zones` is a top-N and returns no total. The
   * real work here is the `deals` coercion: the SQL keeps the RPC's
   * `count(*)::bigint` and postgres.js returns `int8` as a string, so without
   * this the endpoint would answer `{"deals":"7"}` where the contract says
   * `number` — a JSON string a chip cannot render without its own parser.
   */
  static toZonesResponse(rows: PopularZoneRow[]): PopularZoneDto[] {
    return rows.map((row) => ({ zone: row.zone, deals: toNumber(row.deals) }));
  }
}
