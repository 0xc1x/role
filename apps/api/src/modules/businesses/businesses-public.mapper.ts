import type {
  BusinessHoursDto,
  BusinessLocationDto,
  PublicBusinessDto,
  PublicBusinessStorefrontDto,
} from '@0xc1x/role-commons';
import { toNumber, toNumberOrNull } from '../../common/utils/numeric';
import type {
  BusinessLocationRow,
  PublicBusinessNearRow,
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
/**
 * What `toDto` accepts: a plain public row, or a `listPublic` row that also
 * carries the `active_businesses_near` aggregate.
 *
 * The union, rather than `Partial<PublicBusinessNearRow>`, is what lets the
 * aggregate be treated as present-or-absent instead of seven fields that are each
 * individually maybe-missing — a state the query cannot produce and a `?? ''`
 * would then have to paper over. The five fields on the contract are OPTIONAL
 * for the same reason: `GET /businesses/public` always supplies them, but
 * `GET /businesses/public/:id` reads a business through this same mapper with
 * no aggregate behind it, and inventing `active_deals_count: 0` there would
 * report a count nobody measured. `toCategoryDto` already refuses to tell that
 * lie for `active_count`; this is the same call.
 */
type PublicBusinessDtoSource = PublicBusinessRow &
  (PublicBusinessNearRow | { active_deals_count?: undefined });

export class PublicBusinessMapper {
  static toDto(row: PublicBusinessDtoSource): PublicBusinessDto {
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
      // `bigint` comes back as a string and the coordinates as `numeric(10,7)`
      // strings, same as `CategoryDto.active_count` and `toLocationDto`.
      // `distance_km` is a real `double precision`, so it is already a number
      // and is passed through as-is — including its `null`, which means "the
      // request carried no search point" and is not a missing measurement.
      ...(row.active_deals_count === undefined
        ? {}
        : {
            active_deals_count: toNumber(row.active_deals_count),
            distance_km: row.distance_km,
            business_location_id: row.business_location_id,
            address: row.address,
            latitude: toNumber(row.latitude),
            longitude: toNumber(row.longitude),
            zone: row.zone,
          }),
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
