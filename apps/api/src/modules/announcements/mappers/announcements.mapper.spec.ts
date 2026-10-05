import { describe, expect, test } from 'bun:test';
import {
  AnnouncementSeveritySchema,
  AudienceKindSchema,
} from '@0xc1x/role-commons';
import {
  ANNOUNCEMENT_AUDIENCE_KINDS,
  ANNOUNCEMENT_SEVERITIES,
} from '../../../database/schema/announcements';
import type { AnnouncementRow } from '../announcements.repository';
import {
  AnnouncementMapper,
  toAnnouncementDto,
  toAnnouncementInsert,
  toAnnouncementUpdate,
} from './announcements.mapper';

const makeRow = (
  overrides: Partial<AnnouncementRow> = {},
): AnnouncementRow => ({
  id: '3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e',
  title: 'Mantenimiento del sábado',
  body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
  severity: 'info',
  audience_kind: 'all',
  user_ids: [],
  business_ids: [],
  priority: 0,
  active: true,
  start_at: null,
  end_at: null,
  created_at: new Date('2026-10-03T12:00:00Z'),
  updated_at: new Date('2026-10-03T12:00:00Z'),
  ...overrides,
});

describe('toAnnouncementDto', () => {
  test('mapea la fila con los timestamps en ISO', () => {
    const dto = toAnnouncementDto(makeRow());

    expect(dto.id).toBe('3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e');
    expect(dto.priority).toBe(0);
    expect(dto.created_at).toBe('2026-10-03T12:00:00.000Z');
    expect(dto.updated_at).toBe('2026-10-03T12:00:00.000Z');
    expect(dto.start_at).toBeNull();
    expect(dto.end_at).toBeNull();
  });

  test('mapea la ventana cuando existe', () => {
    const dto = toAnnouncementDto(
      makeRow({
        start_at: new Date('2026-10-04T00:00:00Z'),
        end_at: new Date('2026-10-05T00:00:00Z'),
      }),
    );

    expect(dto.start_at).toBe('2026-10-04T00:00:00.000Z');
    expect(dto.end_at).toBe('2026-10-05T00:00:00.000Z');
  });

  test('el DTO no lleva user_ids ni business_ids aunque la fila las tenga', () => {
    // La fuga que el contrato de la Task 2 cerró: la policy deja leer la misma
    // fila a muchísimos dispositivos, así que mandarlas le regalaría a cada uno
    // la lista de todos los demás a los que el aviso apunta.
    const dto = toAnnouncementDto(
      makeRow({
        audience_kind: 'specific',
        user_ids: ['3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e'],
        business_ids: ['9a8b7c6d-5e4f-4a3b-b2c1-d0e9f8a7b6c5'],
      }),
    );

    expect(dto).not.toHaveProperty('user_ids');
    expect(dto).not.toHaveProperty('business_ids');
  });

  test('el DTO tiene exactamente las once columnas del read path', () => {
    // Un `toEqual` con el objeto entero, para que agregar una columna al mapper
    // sin decidirlo sea un rojo y no un dato nuevo que nadie mira.
    expect(toAnnouncementDto(makeRow())).toEqual({
      id: '3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e',
      title: 'Mantenimiento del sábado',
      body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
      severity: 'info',
      audience_kind: 'all',
      priority: 0,
      active: true,
      start_at: null,
      end_at: null,
      created_at: '2026-10-03T12:00:00.000Z',
      updated_at: '2026-10-03T12:00:00.000Z',
    });
  });
});

describe('toAnnouncementInsert', () => {
  const create = {
    title: 'Mantenimiento del sábado',
    body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
    severity: 'required',
    audience_kind: 'all',
    priority: 3,
    active: true,
  } as const;

  test('escribe las dos listas de audiencia siempre, aunque vengan vacías', () => {
    const out = toAnnouncementInsert(create);

    // La columna tiene `default '{}'`. Dejarla que pague el default esconde
    // justamente el caso que importa: un `specific` publicado sin destino.
    expect(out.user_ids).toEqual([]);
    expect(out.business_ids).toEqual([]);
  });

  test('convierte las fechas ISO a Date y la ventana ausente a null', () => {
    const out = toAnnouncementInsert({
      ...create,
      start_at: '2026-10-04T00:00:00.000Z',
    });

    expect(out.start_at).toEqual(new Date('2026-10-04T00:00:00.000Z'));
    expect(out.end_at).toBeNull();
  });

  test('lleva las listas de audiencia cuando vienen', () => {
    const out = toAnnouncementInsert({
      ...create,
      audience_kind: 'specific',
      user_ids: ['3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e'],
    });

    expect(out.audience_kind).toBe('specific');
    expect(out.user_ids).toEqual(['3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e']);
  });
});

describe('toAnnouncementUpdate', () => {
  test('solo lo que viene definido', () => {
    expect(toAnnouncementUpdate({ title: 'Otro título' })).toEqual({
      title: 'Otro título',
    });
  });

  test('un body vacío no inventa claves', () => {
    // El contrato ya rechaza el body vacío, así que acá solo se afirma que el
    // mapper no le agrega ninguna por su cuenta.
    expect(toAnnouncementUpdate({})).toEqual({});
  });

  test('start_at: null explícito limpia la ventana; ausente no la toca', () => {
    // La diferencia importa: si `null` y ausente fueran lo mismo, no se podría
    // sacar la fecha de inicio de un aviso, y el PATCH borraría una columna que
    // el operador no mencionó.
    expect(toAnnouncementUpdate({ start_at: null })).toEqual({
      start_at: null,
    });
    expect(toAnnouncementUpdate({ title: 'X' })).not.toHaveProperty('start_at');
  });

  test('una fecha ISO se convierte a Date', () => {
    expect(
      toAnnouncementUpdate({ end_at: '2026-10-05T00:00:00.000Z' }),
    ).toEqual({ end_at: new Date('2026-10-05T00:00:00.000Z') });
  });

  test('deja cambiar la audiencia dirigida', () => {
    expect(
      toAnnouncementUpdate({
        audience_kind: 'specific',
        user_ids: ['3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e'],
      }),
    ).toEqual({
      audience_kind: 'specific',
      user_ids: ['3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e'],
    });
  });
});

describe('el vocabulario de la columna y el del contrato', () => {
  // Las tres copias del vocabulario —el CHECK de Postgres, la columna de drizzle
  // y el enum de commons— se comparan acá. Si una se separa, el mapper empieza a
  // castear un valor que el contrato no acepta, y eso es un 500 en el móvil.
  test('severity: la columna y el contrato tienen el mismo conjunto', () => {
    expect([...ANNOUNCEMENT_SEVERITIES].sort()).toEqual(
      [...AnnouncementSeveritySchema.options].sort(),
    );
  });

  test('audience_kind: la columna y el contrato tienen el mismo conjunto', () => {
    expect([...ANNOUNCEMENT_AUDIENCE_KINDS].sort()).toEqual(
      [...AudienceKindSchema.options].sort(),
    );
  });

  test('son las dos palabras exactas que exige el contrato', () => {
    // Y no solo el mismo tamaño: el CHECK de Postgres es
    // `severity in ('info','required')` y `audience_kind in (...)`.
    expect(ANNOUNCEMENT_SEVERITIES).toEqual(['info', 'required']);
    expect(ANNOUNCEMENT_AUDIENCE_KINDS).toEqual([
      'all',
      'consumers',
      'businesses',
      'specific',
    ]);
  });
});

describe('AnnouncementMapper', () => {
  test('expone los conversores', () => {
    expect(AnnouncementMapper.toDto).toBe(toAnnouncementDto);
    expect(AnnouncementMapper.toInsert).toBe(toAnnouncementInsert);
    expect(AnnouncementMapper.toUpdate).toBe(toAnnouncementUpdate);
  });
});
