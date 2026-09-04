import { describe, expect, test } from 'bun:test';
import { BusinessMapper } from './businesses.mapper';
import type {
  BusinessLocationRow,
  BusinessRow,
} from './businesses.repository';

const makeRow = (overrides: Partial<BusinessRow> = {}): BusinessRow =>
  ({
    id: 'biz-1',
    owner_id: 'user-1',
    name: 'Panadería Central',
    type: 'bakery',
    slug: 'panaderia-central',
    image: null,
    cover_image: null,
    description: 'Pan fresco',
    phone: '123',
    email: 'hola@pan.cl',
    website: null,
    commission_rate: '12.5',
    balance: '10000',
    rating: '4.5',
    review_count: 10,
    is_active: true,
    verification_status: 'approved',
    verified_at: new Date('2025-01-05T00:00:00Z'),
    verified_by: 'admin-1',
    rejection_reason: null,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-02T00:00:00Z'),
    ...overrides,
  }) as BusinessRow;

describe('BusinessMapper.toDto', () => {
  test('mapea numéricos y fechas', () => {
    const dto = BusinessMapper.toDto(makeRow());
    expect(dto.commission_rate).toBe(12.5);
    expect(dto.balance).toBe(10000);
    expect(dto.rating).toBe(4.5);
    expect(dto.verified_at).toBe('2025-01-05T00:00:00.000Z');
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
  });

  test('nulos se preservan', () => {
    const dto = BusinessMapper.toDto(
      makeRow({
        commission_rate: null,
        balance: null,
        rating: null,
        review_count: null,
        verified_at: null,
        verified_by: null,
      }),
    );
    expect(dto.commission_rate).toBeNull();
    expect(dto.balance).toBeNull();
    expect(dto.rating).toBeNull();
    expect(dto.review_count).toBeNull();
    expect(dto.verified_at).toBeNull();
  });
});

describe('BusinessMapper.toLocationDto', () => {
  test('mapea coordenadas', () => {
    const dto = BusinessMapper.toLocationDto({
      id: 'loc-1',
      business_id: 'biz-1',
      name: 'Matriz',
      address: 'Calle 123',
      phone: null,
      latitude: '-33.45',
      longitude: '-70.66',
      is_active: true,
      zone: 'centro',
      is_headquarter: true,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    } as BusinessLocationRow);
    expect(dto.latitude).toBe(-33.45);
    expect(dto.longitude).toBe(-70.66);
    expect(dto.is_headquarter).toBe(true);
  });
});
