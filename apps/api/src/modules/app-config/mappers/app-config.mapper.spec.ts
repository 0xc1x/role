import { describe, expect, test } from 'bun:test';
import {
  AppConfigMapper,
  toAppConfigDto,
  toAppConfigInsert,
  toAppConfigUpdate,
  toPublicAppConfigDto,
  toPublicAppConfigList,
} from './app-config.mapper';
import type { AppConfigRow } from '../app-config.repository';

const makeRow = (overrides: Partial<AppConfigRow> = {}): AppConfigRow =>
  ({
    key: 'maintenance_mode',
    value: false,
    value_type: 'boolean',
    category: 'general',
    label: 'Modo mantenimiento',
    description: null,
    is_public: true,
    active: true,
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date('2025-02-01T00:00:00Z'),
    ...overrides,
  }) as AppConfigRow;

describe('toAppConfigDto', () => {
  test('mapea fila completa', () => {
    const dto = toAppConfigDto(makeRow());
    expect(dto.key).toBe('maintenance_mode');
    expect(dto.value).toBe(false);
    expect(dto.created_at).toBe('2025-01-01T00:00:00.000Z');
    expect(dto.updated_at).toBe('2025-02-01T00:00:00.000Z');
  });
});

describe('toPublicAppConfigDto', () => {
  test('solo expone key/value/value_type', () => {
    expect(toPublicAppConfigDto(makeRow())).toEqual({
      key: 'maintenance_mode',
      value: false,
      value_type: 'boolean',
    });
  });

  test('toPublicAppConfigList mapea arreglo', () => {
    expect(toPublicAppConfigList([makeRow(), makeRow({ key: 'x' })])).toEqual([
      { key: 'maintenance_mode', value: false, value_type: 'boolean' },
      { key: 'x', value: false, value_type: 'boolean' },
    ]);
  });
});

describe('toAppConfigInsert', () => {
  test('pasa todos los campos', () => {
    expect(
      toAppConfigInsert({
        key: 'k',
        value: 'v',
        value_type: 'string',
        category: 'general',
        label: 'L',
        description: null,
        is_public: false,
        active: true,
      }),
    ).toEqual({
      key: 'k',
      value: 'v',
      value_type: 'string',
      category: 'general',
      label: 'L',
      description: null,
      is_public: false,
      active: true,
    });
  });
});

describe('toAppConfigUpdate', () => {
  test('solo incluye definidos', () => {
    expect(toAppConfigUpdate({ label: 'Nuevo' })).toEqual({ label: 'Nuevo' });
    expect(toAppConfigUpdate({})).toEqual({});
  });
});

describe('AppConfigMapper', () => {
  test('expone los conversores', () => {
    expect(AppConfigMapper.toDto).toBe(toAppConfigDto);
    expect(AppConfigMapper.toPublicDto).toBe(toPublicAppConfigDto);
    expect(AppConfigMapper.toPublicList).toBe(toPublicAppConfigList);
    expect(AppConfigMapper.toInsert).toBe(toAppConfigInsert);
    expect(AppConfigMapper.toUpdate).toBe(toAppConfigUpdate);
  });
});
