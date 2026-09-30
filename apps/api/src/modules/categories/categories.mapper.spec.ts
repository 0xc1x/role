import { describe, expect, test } from 'bun:test';
import {
  CategoryMapper,
  toCategoryDto,
  toCategoryInsert,
  toCategoryUpdate,
} from './categories.mapper';
import type { CategoryRow } from './categories.repository';

const makeRow = (overrides: Partial<CategoryRow> = {}): CategoryRow =>
  ({
    id: 'cat-1',
    name: 'Panadería',
    description: 'Pan fresco',
    emoji: '🥖',
    slug: 'panaderia',
    image_url: null,
    active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-01-02T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  }) as CategoryRow;

describe('toCategoryDto', () => {
  test('mapea fila a DTO', () => {
    const dto = toCategoryDto(makeRow());
    expect(dto.slug).toBe('panaderia');
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
    expect(dto.deleted_at).toBeNull();
  });

  test('active_count: número cuando la fila lo trae, ausente cuando no', () => {
    // A LIST row carries it, and it arrives as the `bigint` string postgres.js
    // produces. Emitting that verbatim would put `"active_count":"7"` on the
    // wire, where the contract says number.
    const withCount = toCategoryDto(
      makeRow({ active_count: '7' }) as CategoryRow,
    );
    expect(withCount.active_count).toBe(7);
    expect(typeof withCount.active_count).toBe('number');

    // Already a number (if the driver ever stops stringifying int8) still works.
    expect(
      toCategoryDto(makeRow({ active_count: 3 }) as CategoryRow).active_count,
    ).toBe(3);

    // A category with no active offers is `0`, not missing: `coalesce` in SQL
    // guarantees the value is present, and a chip rendering "0 deals" is correct.
    expect(
      toCategoryDto(makeRow({ active_count: '0' }) as CategoryRow).active_count,
    ).toBe(0);

    // A SINGLE-RESOURCE row does not run the aggregate, so the field is OMITTED
    // rather than reported as 0 — "we did not count" must not look like "there
    // is nothing". `undefined` is what makes `JSON.stringify` leave the key out.
    const detail = toCategoryDto(makeRow());
    expect('active_count' in detail).toBe(false);
    expect(JSON.parse(JSON.stringify(detail))).not.toHaveProperty(
      'active_count',
    );
  });
});

describe('toCategoryInsert', () => {
  test('usa el slug provisto y defaultea active', () => {
    expect(toCategoryInsert({ name: 'Café' }, 'cafe')).toEqual({
      name: 'Café',
      description: null,
      emoji: null,
      slug: 'cafe',
      image_url: null,
      active: true,
    });
  });
});

describe('toCategoryUpdate', () => {
  test('solo incluye definidos', () => {
    expect(toCategoryUpdate({ name: 'X' })).toEqual({ name: 'X' });
    expect(toCategoryUpdate({})).toEqual({});
  });
});

describe('CategoryMapper', () => {
  test('expone los conversores', () => {
    expect(CategoryMapper.toDto).toBe(toCategoryDto);
    expect(CategoryMapper.toInsert).toBe(toCategoryInsert);
    expect(CategoryMapper.toUpdate).toBe(toCategoryUpdate);
  });
});
