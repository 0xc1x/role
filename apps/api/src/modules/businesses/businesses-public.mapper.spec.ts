import type { BusinessRow } from './businesses.repository';
import { PublicBusinessMapper } from './businesses-public.mapper';

const now = new Date('2026-01-01T00:00:00.000Z');

/** The exact column set `publicSelect` is allowed to return. */
function publicRow(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 'b1',
    name: 'Panadería Sur',
    type: 'bakery',
    slug: 'panaderia-sur',
    image: null,
    cover_image: null,
    rating: '4.50',
    review_count: 12,
    description: null,
    phone: '+56912345678',
    email: 'hola@panaderia.cl',
    website: null,
    currency: 'CLP',
    is_active: true,
    created_at: now,
    updated_at: now,
    ...overrides,
  } as BusinessRow;
}

describe('PublicBusinessMapper', () => {
  it('emits exactly the public contract and nothing else', () => {
    const dto = PublicBusinessMapper.toDto(publicRow());

    expect(Object.keys(dto).sort()).toEqual([
      'cover_image',
      'created_at',
      'description',
      'email',
      'id',
      'image',
      'name',
      'phone',
      'rating',
      'review_count',
      'slug',
      'type',
      'updated_at',
      'website',
    ]);
    expect(dto.rating).toBe(4.5);
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('never emits owner, money or moderation state', () => {
    // A panel row carries all of these; the public mapper is handed the same kind
    // of object and must still drop them.
    const dto = PublicBusinessMapper.toDto(
      publicRow({
        owner_id: 'owner-uuid',
        balance: '1000.00',
        commission_rate: '0.1000',
        verification_status: 'approved',
        verified_at: now,
        verified_by: 'admin-uuid',
        rejection_reason: null,
        is_active: false,
      } as Partial<BusinessRow>),
    );

    expect(Object.keys(dto)).not.toContain('owner_id');
    expect(Object.keys(dto)).not.toContain('balance');
    expect(Object.keys(dto)).not.toContain('commission_rate');
    expect(Object.keys(dto)).not.toContain('verification_status');
    expect(Object.keys(dto)).not.toContain('verified_at');
    expect(Object.keys(dto)).not.toContain('verified_by');
    expect(Object.keys(dto)).not.toContain('rejection_reason');
    // `is_active` is not part of the public contract at all: the gate guarantees
    // it, so a value in the payload would be a constant pretending to be data.
    expect(Object.keys(dto)).not.toContain('is_active');
  });

  it('nulls and zero ratings survive the mapping', () => {
    const dto = PublicBusinessMapper.toDto(
      publicRow({ image: undefined, rating: '0', review_count: null }),
    );
    expect(dto.image).toBeNull();
    expect(dto.rating).toBe(0);
    expect(dto.review_count).toBeNull();
  });

  it('toStorefrontDto composes the business with both collections', () => {
    const storefront = PublicBusinessMapper.toStorefrontDto({
      business: publicRow(),
      locations: [
        {
          id: 'l1',
          business_id: 'b1',
          name: 'Centro',
          address: 'Calle 123',
          phone: null,
          latitude: '-33.4500000',
          longitude: '-70.6600000',
          is_active: true,
          zone: 'Centro',
          is_headquarter: true,
          created_at: now,
          updated_at: now,
        },
      ],
      hours: [
        {
          id: 'h1',
          business_id: 'b1',
          day: 'monday',
          open_time: '09:00:00',
          close_time: '18:00:00',
          is_closed: false,
          created_at: now,
          updated_at: now,
        },
      ],
    });

    expect(storefront.business.id).toBe('b1');
    // `time` keeps the width Postgres returns; `TimeSchema` accepts it and the
    // consumer renders it as text.
    expect(storefront.locations[0]?.latitude).toBe(-33.45);
    expect(storefront.locations[0]?.longitude).toBe(-70.66);
    expect(storefront.hours[0]?.open_time).toBe('09:00:00');
    expect(storefront.hours[0]?.day).toBe('monday');
  });

  it('empty collections are arrays, never nulls', () => {
    const storefront = PublicBusinessMapper.toStorefrontDto({
      business: publicRow(),
      locations: [],
      hours: [],
    });
    expect(storefront.locations).toEqual([]);
    expect(storefront.hours).toEqual([]);
  });
});
