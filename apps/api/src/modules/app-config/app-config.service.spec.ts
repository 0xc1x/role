import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigService } from './app-config.service';
import { AppConfigRepository, type AppConfigRow } from './app-config.repository';

jest.mock('./mappers/app-config.mapper', () => ({
  AppConfigMapper: {
    toDto: (row: AppConfigRow) => ({ key: row.key, label: row.label }),
    toPublicList: (rows: AppConfigRow[]) =>
      rows.map((r) => ({ key: r.key, value: r.value })),
    toInsert: (dto: unknown) => dto,
    toUpdate: (dto: unknown) => dto,
  },
}));

const makeRow = (overrides: Partial<AppConfigRow> = {}): AppConfigRow => ({
  key: 'fees.vat_percent',
  value: 15,
  value_type: 'number',
  category: 'financiero',
  label: 'IVA aplicable (%)',
  description: null,
  is_public: true,
  active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('AppConfigService', () => {
  let service: AppConfigService;
  let repository: jest.Mocked<AppConfigRepository>;

  beforeEach(async () => {
    repository = {
      findByKey: jest.fn(),
      insert: jest.fn(),
      listPublic: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      transaction: jest.fn((fn) => fn({} as never)),
    } as unknown as jest.Mocked<AppConfigRepository>;

    const module = await Test.createTestingModule({
      providers: [
        AppConfigService,
        { provide: AppConfigRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(AppConfigService);
  });

  it('create lanza ConflictException si la clave ya existe', async () => {
    repository.findByKey.mockResolvedValue(makeRow());
    await expect(
      service.create({
        key: 'fees.vat_percent',
        value: 15,
        value_type: 'number',
        category: 'financiero',
        label: 'IVA',
        description: null,
        is_public: true,
        active: true,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('listPublic devuelve solo filas públicas activas mapeadas', async () => {
    repository.listPublic.mockResolvedValue([makeRow()]);
    const result = await service.listPublic();
    expect(result).toEqual([{ key: 'fees.vat_percent', value: 15 }]);
  });

  it('update lanza NotFoundException si la clave no existe', async () => {
    repository.transaction.mockImplementation(
      () => Promise.resolve(null) as never,
    );
    await expect(service.update('nope.key', { value: 1 })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('remove lanza NotFoundException si la clave no existe', async () => {
    repository.remove.mockResolvedValue(false);
    await expect(service.remove('nope.key')).rejects.toThrow(
      NotFoundException,
    );
  });
});
