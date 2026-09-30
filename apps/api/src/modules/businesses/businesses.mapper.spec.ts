import { describe, expect, test } from 'bun:test';
import { BusinessMapper } from './businesses.mapper';
import type {
  BusinessAggregateRow,
  BusinessEmailSendRow,
  BusinessLocationRow,
} from './businesses.repository';

const makeRow = (
  overrides: Partial<BusinessAggregateRow> = {},
): BusinessAggregateRow =>
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
  }) as BusinessAggregateRow;

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
    // commission_rate/balance son NOT NULL en los companions; el cast documenta
    // que el mapper los sigue tolerando en null (el DTO los admite).
    const dto = BusinessMapper.toDto(
      makeRow({
        commission_rate: null,
        balance: null,
        rating: null,
        review_count: null,
        verified_at: null,
        verified_by: null,
      } as Partial<BusinessAggregateRow>),
    );
    expect(dto.commission_rate).toBeNull();
    expect(dto.balance).toBeNull();
    expect(dto.rating).toBeNull();
    expect(dto.review_count).toBeNull();
    expect(dto.verified_at).toBeNull();
  });
});

describe('BusinessMapper.toEmailSendDto', () => {
  const makeSendRow = (
    overrides: Partial<BusinessEmailSendRow> = {},
  ): BusinessEmailSendRow =>
    ({
      id: 'a1000000-0000-4000-8000-000000000001',
      email: 'owner@role.ec',
      status: 'pending',
      error_message: null,
      created_at: new Date('2026-02-01T10:00:00Z'),
      updated_at: new Date('2026-02-01T10:00:00Z'),
      template_name: 'business-approved',
      ...overrides,
    }) as BusinessEmailSendRow;

  test('pending: sin error y con fechas ISO', () => {
    const dto = BusinessMapper.toEmailSendDto(makeSendRow());

    expect(dto).toEqual({
      id: 'a1000000-0000-4000-8000-000000000001',
      email: 'owner@role.ec',
      template_name: 'business-approved',
      status: 'pending',
      error_message: null,
      created_at: '2026-02-01T10:00:00.000Z',
      updated_at: '2026-02-01T10:00:00.000Z',
    });
  });

  test('sent: estado entregado sin mensaje de error', () => {
    const dto = BusinessMapper.toEmailSendDto(
      makeSendRow({ status: 'sent', error_message: null }),
    );

    expect(dto.status).toBe('sent');
    expect(dto.error_message).toBeNull();
  });

  test('failed: expone el motivo de Resend', () => {
    const dto = BusinessMapper.toEmailSendDto(
      makeSendRow({
        status: 'failed',
        error_message: 'You can only send testing emails to your own email',
      }),
    );

    expect(dto.status).toBe('failed');
    expect(dto.error_message).toBe(
      'You can only send testing emails to your own email',
    );
  });

  test('failed sin error_message: null, no string vacío', () => {
    const dto = BusinessMapper.toEmailSendDto(
      makeSendRow({ status: 'failed', error_message: null }),
    );

    expect(dto.error_message).toBeNull();
  });

  test('no filtra columnas internas de email_sends', () => {
    const dto = BusinessMapper.toEmailSendDto(
      makeSendRow({
        variables_used: { businessName: 'Café' },
        resend_id: 'resend-1',
      } as Partial<BusinessEmailSendRow>),
    );

    expect(Object.keys(dto).sort()).toEqual([
      'created_at',
      'email',
      'error_message',
      'id',
      'status',
      'template_name',
      'updated_at',
    ]);
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
