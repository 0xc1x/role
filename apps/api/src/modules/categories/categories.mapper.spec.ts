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
