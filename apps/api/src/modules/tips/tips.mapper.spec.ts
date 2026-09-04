import { describe, expect, test } from 'bun:test';
import {
  TipMapper,
  toTipDto,
  toTipInsert,
  toTipUpdate,
} from './tips.mapper';
import type { TipRow } from './tips.repository';

const makeRow = (overrides: Partial<TipRow> = {}): TipRow =>
  ({
    id: 'tip-1',
    content: 'Compra cerca de tu casa',
    active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-02-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  }) as TipRow;

describe('toTipDto', () => {
  test('mapea fila a DTO con fechas ISO', () => {
    expect(toTipDto(makeRow())).toEqual({
      id: 'tip-1',
      content: 'Compra cerca de tu casa',
      active: true,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-02-01T00:00:00.000Z',
      deleted_at: null,
    });
  });

  test('deleted_at nulo y updated_at nulo', () => {
    const dto = toTipDto(
      makeRow({
        updated_at: null,
        deleted_at: new Date('2025-03-01T00:00:00Z'),
      }),
    );
    expect(dto.updated_at).toBeNull();
    expect(dto.deleted_at).toBe('2025-03-01T00:00:00.000Z');
  });
});

describe('toTipInsert', () => {
  test('defaultea active a true', () => {
    expect(toTipInsert({ content: 'Hola' })).toEqual({
      content: 'Hola',
      active: true,
    });
  });
});

describe('toTipUpdate', () => {
  test('solo incluye definidos', () => {
    expect(toTipUpdate({ content: 'x' })).toEqual({ content: 'x' });
  });
});

describe('TipMapper', () => {
  test('expone los tres conversores', () => {
    expect(TipMapper.toDto).toBe(toTipDto);
    expect(TipMapper.toInsert).toBe(toTipInsert);
    expect(TipMapper.toUpdate).toBe(toTipUpdate);
  });
});
