import type {
  BusinessHoursDto,
  BusinessLocationDto,
  PublicBusinessDto,
  PublicBusinessStorefrontDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  BusinessLocationRow,
  PublicBusinessRow,
} from './businesses.repository';
import type { BusinessHoursRow } from '../../database/schema';

/**
 * Mappers for the public business surface.
 *
 * Separate from `BusinessMapper` on purpose. The panel mapper emits
 * `BusinessDto` — owner id, balance, commission and the moderation quartet — and
 * the public one emits `PublicBusinessDto`, which has none of them. Sharing a
 * class would mean one `toDto` with a flag deciding how much of a row to leak,
 * and the answer to "which fields" would live in a call site instead of in a
 * type.
 *
 * No row reaches a response without passing through here: the repository's
 * `publicSelect` narrows the columns, this narrows them again into the contract.
 * The two lists are the same list on purpose, so neither can drift alone.
 */
export class PublicBusinessMapper {
  static toDto(row: PublicBusinessRow): PublicBusinessDto {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      slug: row.slug,
      image: row.image ?? null,
      cover_image: row.cover_image ?? null,
      rating: toNumberOrNull(row.rating),
      review_count: row.review_count ?? null,
      description: row.description ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      website: row.website ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  /**
   * Storefront: the business plus its active points and its weekly schedule.
   *
   * The collections are mapped into the FULL `BusinessLocationDto` /
   * `BusinessHoursDto` contracts rather than a public variant. They already hold
   * nothing but public data — a pickup point's `phone` is the shop's own
   * published number, and there is no moderation or money column on either table
   * — so a second, narrower pair of contracts would be a rename, not a
   * guarantee.
   */
  static toStorefrontDto(input: {
    business: PublicBusinessRow;
    locations: BusinessLocationRow[];
    hours: BusinessHoursRow[];
  }): PublicBusinessStorefrontDto {
    return {
      business: PublicBusinessMapper.toDto(input.business),
      locations: input.locations.map((row) =>
        PublicBusinessMapper.toLocationDto(row),
      ),
      hours: input.hours.map((row) => PublicBusinessMapper.toHours(row)),
    };
  }

  static toLocationDto(row: BusinessLocationRow): BusinessLocationDto {
    return {
      id: row.id,
      business_id: row.business_id,
      name: row.name,
      address: row.address,
      phone: row.phone ?? null,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      is_active: row.is_active,
      zone: row.zone ?? null,
      is_headquarter: row.is_headquarter,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  static toHours(row: BusinessHoursRow): BusinessHoursDto {
    return {
      id: row.id,
      business_id: row.business_id,
      day: row.day,
      // `time` comes back from Postgres as `HH:MM:SS`, which is what
      // `TimeSchema` accepts. It is NOT re-formatted: the contract allows both
      // widths and the consumer is a `<Text>`, not a date library.
      open_time: row.open_time,
      close_time: row.close_time,
      is_closed: row.is_closed,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
