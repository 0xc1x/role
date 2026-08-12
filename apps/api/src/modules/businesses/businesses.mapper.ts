import type {
  BusinessDto,
  BusinessLocationDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  BusinessLocationRow,
  BusinessRow,
} from './businesses.repository';

/**
 * Maps business / location rows → API DTOs (numerics + ISO dates).
 */
export class BusinessMapper {
  static toDto(row: BusinessRow): BusinessDto {
    return {
      id: row.id,
      owner_id: row.owner_id,
      name: row.name,
      type: row.type,
      slug: row.slug,
      image: row.image,
      cover_image: row.cover_image,
      description: row.description,
      phone: row.phone,
      email: row.email,
      website: row.website,
      commission_rate: toNumberOrNull(row.commission_rate),
      balance: toNumberOrNull(row.balance),
      rating: toNumberOrNull(row.rating),
      review_count: row.review_count ?? null,
      is_active: row.is_active,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toLocationDto(row: BusinessLocationRow): BusinessLocationDto {
    return {
      id: row.id,
      business_id: row.business_id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      is_active: row.is_active,
      zone: row.zone,
      is_headquarter: row.is_headquarter,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
