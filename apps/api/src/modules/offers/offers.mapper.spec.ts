import { describe, expect, test } from 'bun:test';
import { OfferMapper } from './offers.mapper';
import type { OfferListRow, OfferRow } from './offers.repository';

const makeListRow = (overrides: Partial<OfferListRow> = {}): OfferListRow => ({
  id: 'offer-1',
  business_id: 'biz-1',
  business_location_id: 'loc-1',
  title: 'Pack sorpresa',
  description: 'Surtido del día',
  image: null,
  original_price: '10000',
  discounted_price: '3990',
  discount_percentage: '60',
  stock: 5,
  initial_stock: 10,
  pickup_start: new Date('2025-01-10T18:00:00Z'),
  pickup_end: new Date('2025-01-10T20:00:00Z'),
  is_active: true,
  includes: null,
  allergens: null,
  rating: '4.8',
  review_count: 12,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-02T00:00:00Z'),
  category_ids: ['cat-1'],
  category_names: ['Panadería'],
  category_slugs: ['panaderia'],
  business_name: 'Panadería Central',
  business_slug: 'panaderia-central',
  business_image: null,
  business_rating: '4.5',
  location_name: 'Matriz',
  location_address: 'Calle 123',
  location_latitude: '-33.45',
  location_longitude: '-70.66',
  location_zone: 'centro',
  ...overrides,
});

describe('OfferMapper.toResponse', () => {
  test('mapea joins anidados', () => {
    const res = OfferMapper.toResponse(makeListRow());
    expect(res.original_price).toBe(10000);
    expect(res.discounted_price).toBe(3990);
    expect(res.categories).toEqual([
      { id: 'cat-1', name: 'Panadería', slug: 'panaderia' },
    ]);
    expect(res.business.name).toBe('Panadería Central');
    expect(res.business.rating).toBe(4.5);
    expect(res.location.latitude).toBe(-33.45);
    expect(res.pickup_start).toBe('2025-01-10T18:00:00.000Z');
  });

  test('categoría sin nombre usa string vacío', () => {
    const res = OfferMapper.toResponse(
      makeListRow({ category_names: [], category_slugs: [] }),
    );
    expect(res.categories).toEqual([{ id: 'cat-1', name: '', slug: '' }]);
  });
});

describe('OfferMapper.toDto', () => {
  test('usa los categoryIds provistos', () => {
    const dto = OfferMapper.toDto(
      { ...makeListRow(), category_ids: [] } as unknown as OfferRow,
      ['cat-2'],
    );
    expect(dto.category_ids).toEqual(['cat-2']);
    expect(dto.title).toBe('Pack sorpresa');
  });
});
