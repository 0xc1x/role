import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type {
  AnnouncementDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '@0xc1x/role-commons';
import type { Database } from '../../database/database.module';
import {
  AnnouncementsRepository,
  type AnnouncementRow,
  type DbExecutor,
  type EligibleAnnouncementRow,
} from './announcements.repository';
import { AnnouncementsService } from './announcements.service';

/**
 * Un `DbExecutor` de verdad para el callback de `transaction()`. No conecta:
 * `postgres()` es lazy y solo abre socket al primer query, y acá no llega ninguno
 * porque los métodos del repositorio están mockeados. Existe para no tener que
 * castear `{}` a `Database` —un `as` para callar al typechecker es un agujero
 * con uniforme—.
 */
const dbQueNoSeUsa: Database = drizzle({
  client: postgres('postgres://localhost:1/nada', { max: 1 }),
});

/** Dos ids que la policy puede usar, y que el contrato acepta como uuid. */
const CONSUMER = '3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e';
const BUSINESS = '9a8b7c6d-5e4f-4a3b-b2c1-d0e9f8a7b6c5';
const OTHER = '11111111-2222-4333-8444-555555555555';

/** Payload mínimo de creación: lo que la base exige sin default. */
const minimalCreate: CreateAnnouncementDto = {
  title: 'Mantenimiento del sábado',
  body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
  severity: 'info',
  audience_kind: 'all',
  active: true,
  priority: 0,
};

const makeRow = (
  overrides: Partial<AnnouncementRow> = {},
): AnnouncementRow => ({
  id: OTHER,
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

/** El mismo id en los tres lugares: fila de la base, DTO, y a lo que espera el repo. */
const ANNOUNCEMENT_ID = makeRow().id;

/**
 * La fila del read path PÚBLICO, con la forma que devuelve PostgREST: los
 * timestamps son strings ISO, no `Date`. No es un detalle del mock —el read
 * público va por Supabase y el de admin por drizzle—, y los fixtures tienen que
 * distinguir las dos o el test no está probando la ruta que dice.
 */
const asPostgrest = (row: AnnouncementRow): EligibleAnnouncementRow => ({
  id: row.id,
  title: row.title,
  body: row.body,
  severity: row.severity,
  audience_kind: row.audience_kind,
  priority: row.priority,
  active: row.active,
  start_at: row.start_at?.toISOString() ?? null,
  end_at: row.end_at?.toISOString() ?? null,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
});

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let repository: jest.Mocked<AnnouncementsRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: AnnouncementsRepository,
          useValue: {
            transaction: jest.fn(),
            insert: jest.fn(),
            findById: jest.fn(),
            list: jest.fn(),
            update: jest.fn(),
            deactivate: jest.fn(),
            listEligible: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(AnnouncementsService);
    repository = module.get(AnnouncementsRepository);

    jest.resetAllMocks();

    repository.transaction.mockImplementation(async (fn) => fn(dbQueNoSeUsa));
  });

  // ─── listForAudience: la elegibilidad es de RLS, no del service ─────────────
  //
  // Los tres casos de acá son el mismo predicado escrito al revés. La fila que
  // devuelve el repositorio YA viene filtrada por la policy de Supabase; si el
  // service la vuelve a filtrar, la misma regla queda escrita dos veces y el
  // arreglo futuro se aplica en la de nadie mira.
  describe('listForAudience', () => {
    it('pide las filas por la vía que RLS filtra y no reimplementa el filtro', async () => {
      repository.listEligible.mockResolvedValue([asPostgrest(makeRow())]);

      const result = await service.listForAudience('un-jwt');

      // Un solo argumento: el token. Sin `availableAt`, sin `audience`, sin
      // `active`. Si mañana aparece un parámetro de ventana acá, es la regla
      // duplicada y este test hay que revisarlo.
      expect(repository.listEligible).toHaveBeenCalledWith('un-jwt');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe(ANNOUNCEMENT_ID);
    });

    it('devuelve también las filas que un filtro propio habría descartado', async () => {
      // Las tres son INELIGIBLES para quien pregunta: inactiva, fuera de la
      // ventana, y dirigida a otra persona. Ninguna llega desde el repositorio
      // en producción, porque la policy no las deja pasar; por eso el service
      // no puede distinguirlas y no debe intentarlo.
      const ayer = new Date(Date.now() - 86_400_000);
      const inactiva = asPostgrest(makeRow({ active: false }));
      const vencida = asPostgrest(
        makeRow({
          start_at: new Date(ayer.getTime() - 86_400_000),
          end_at: ayer,
        }),
      );
      const de_otro = asPostgrest(makeRow({ audience_kind: 'specific' }));
      repository.listEligible.mockResolvedValue([inactiva, vencida, de_otro]);

      const result = await service.listForAudience(null);

      expect(result.map((a) => a.id)).toEqual([
        ANNOUNCEMENT_ID,
        ANNOUNCEMENT_ID,
        ANNOUNCEMENT_ID,
      ]);
      expect(result.map((a) => a.active)).toEqual([false, true, true]);
    });

    it('no manda user_ids ni business_ids aunque la fila venga con ellas', async () => {
      // El read path público no las expone: la policy deja leer la misma fila a
      // muchísimos dispositivos, así que mandarlas le regalaría a cada uno la
      // lista de todos los demás que el aviso loca.
      //
      // El tipo de la fila las declara; el del read path no. La intersección
      // modela un `select *` accidental —una fila que SÍ llega con las listas—,
      // que es el escenario contra el que el contrato está puesto.
      const filaConListas: EligibleAnnouncementRow & {
        user_ids: string[];
        business_ids: string[];
      } = {
        ...asPostgrest(makeRow({ audience_kind: 'specific' })),
        user_ids: [CONSUMER],
        business_ids: [BUSINESS],
      };
      repository.listEligible.mockResolvedValue([filaConListas]);

      const [anuncio] = await service.listForAudience(null);

      expect(anuncio).not.toHaveProperty('user_ids');
      expect(anuncio).not.toHaveProperty('business_ids');
    });

    it('no inventa una lista vacía cuando la lectura falla', async () => {
      repository.listEligible.mockRejectedValue(new Error('DB error'));

      await expect(service.listForAudience(null)).rejects.toThrow(
        'No se pudieron obtener los anuncios',
      );
    });

    it('devuelve [] cuando no hay nada que ver', async () => {
      repository.listEligible.mockResolvedValue([]);

      await expect(service.listForAudience(null)).resolves.toEqual([]);
    });
  });

  // ─── listAdmin: paginado y con los filtros del panel, sin forzar `active` ──
  describe('listAdmin', () => {
    it('pasa los filtros del panel y pagina', async () => {
      repository.list.mockResolvedValue({ rows: [makeRow()], total: 1 });

      const result = await service.listAdmin({
        page: 1,
        limit: 20,
        search: 'mantenimiento',
        severity: 'required',
        active: false,
      });

      expect(repository.list).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        search: 'mantenimiento',
        severity: 'required',
        active: false,
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        total_pages: 1,
      });
      expect(result.data[0]?.id).toBe(ANNOUNCEMENT_ID);
    });

    it('no fuerza active: el panel tiene que poder listar los dados de baja', async () => {
      // El endpoint público sí queda atado a RLS; este no, así que no puede
      // vengarse de la policy para esconder los inactivos.
      repository.list.mockResolvedValue({ rows: [], total: 0 });

      await service.listAdmin({ page: 1, limit: 20, active: undefined });

      expect(repository.list).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        search: undefined,
        severity: undefined,
        active: undefined,
      });
    });

    it('mapea las fechas de la base a ISO', async () => {
      repository.list.mockResolvedValue({
        rows: [
          makeRow({
            start_at: new Date('2026-10-01T00:00:00Z'),
            end_at: new Date('2026-10-05T00:00:00Z'),
          }),
        ],
        total: 1,
      });

      const result = await service.listAdmin({ page: 1, limit: 20 });

      expect(result.data[0]?.start_at).toBe('2026-10-01T00:00:00.000Z');
      expect(result.data[0]?.end_at).toBe('2026-10-05T00:00:00.000Z');
    });

    it('lanza 500 en vez de una tabla vacía cuando el repositorio falla', async () => {
      repository.list.mockRejectedValue(new Error('DB error'));

      await expect(service.listAdmin({ page: 1, limit: 20 })).rejects.toThrow(
        'No se pudieron obtener los anuncios',
      );
    });
  });

  // ─── create: el `specific` sin destino es el agujero que cierra acá ────────
  describe('create', () => {
    it('rechaza un specific con las dos listas vacías', async () => {
      // Review Focus #4: el aviso queda activo en el panel y no lo ve nadie.
      // El contrato NO valida esto (es una regla del servicio), así que el
      // predicado de acá es lo único que lo frena.
      await expect(
        service.create({
          ...minimalCreate,
          audience_kind: 'specific',
          user_ids: [],
          business_ids: [],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('rechaza un specific sin ninguna de las dos listas', async () => {
      // Ausente y `[]` son el mismo predicado: los dos dejan el aviso sin
      // destino, y una lista vacía no se puede tratar como "no lo pidió".
      await expect(
        service.create({ ...minimalCreate, audience_kind: 'specific' }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.insert).not.toHaveBeenCalled();
    });

    it('basta con un id en una de las dos listas, vacía la otra', async () => {
      // El predicado mira la cantidad de ids, no la presencia de las listas: una
      // `[]` al lado de una lista con un id no es una audiencia vacía.
      repository.insert.mockResolvedValue(makeRow());

      await expect(
        service.create({
          ...minimalCreate,
          audience_kind: 'specific',
          user_ids: [],
          business_ids: [BUSINESS],
        }),
      ).resolves.toBeDefined();
      await expect(
        service.create({
          ...minimalCreate,
          audience_kind: 'specific',
          user_ids: [CONSUMER],
          business_ids: [],
        }),
      ).resolves.toBeDefined();
    });

    it('acepta un specific con al menos un id, en cualquiera de las dos listas', async () => {
      repository.insert.mockResolvedValue(
        makeRow({ audience_kind: 'specific' }),
      );

      await service.create({
        ...minimalCreate,
        audience_kind: 'specific',
        user_ids: [CONSUMER],
      });
      expect(repository.insert).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ user_ids: [CONSUMER] }),
      );

      await service.create({
        ...minimalCreate,
        audience_kind: 'specific',
        business_ids: [BUSINESS],
      });
      expect(repository.insert).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ business_ids: [BUSINESS] }),
      );
    });

    it('no exige audiencia dirigida en las otras tres audiencias', async () => {
      repository.insert.mockResolvedValue(makeRow());

      for (const audience_kind of ['all', 'consumers', 'businesses'] as const) {
        await expect(
          service.create({ ...minimalCreate, audience_kind }),
        ).resolves.toBeDefined();
      }
    });

    it('inserta y devuelve el DTO mapeado', async () => {
      repository.insert.mockResolvedValue(makeRow({ priority: 5 }));

      const result = await service.create({ ...minimalCreate, priority: 5 });

      expect(repository.insert).toHaveBeenCalledWith(expect.anything(), {
        title: minimalCreate.title,
        body: minimalCreate.body,
        severity: 'info',
        audience_kind: 'all',
        user_ids: [],
        business_ids: [],
        priority: 5,
        active: true,
        start_at: null,
        end_at: null,
      });
      expect(result).toEqual<AnnouncementDto>({
        id: ANNOUNCEMENT_ID,
        title: minimalCreate.title,
        body: minimalCreate.body,
        severity: 'info',
        audience_kind: 'all',
        priority: 5,
        active: true,
        start_at: null,
        end_at: null,
        created_at: '2026-10-03T12:00:00.000Z',
        updated_at: '2026-10-03T12:00:00.000Z',
      });
    });

    it('convierte las fechas de la ventana', async () => {
      repository.insert.mockResolvedValue(makeRow());

      await service.create({
        ...minimalCreate,
        start_at: '2026-10-04T00:00:00.000Z',
        end_at: '2026-10-05T00:00:00.000Z',
      });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          start_at: new Date('2026-10-04T00:00:00.000Z'),
          end_at: new Date('2026-10-05T00:00:00.000Z'),
        }),
      );
    });
  });

  // ─── update: el mismo agujero, por la otra puerta ──────────────────────────
  describe('update', () => {
    const specific: UpdateAnnouncementDto = { audience_kind: 'specific' };

    it('lanza 404 si el aviso no existe', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update(ANNOUNCEMENT_ID, { title: 'Otro título' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza dejar un specific sin ningún id', async () => {
      // Mismo no-op silencioso que en `create`: vaciar la lista de una fila
      // `specific` la deja invisible para todos, y el panel no se entera.
      repository.findById.mockResolvedValue(
        makeRow({
          audience_kind: 'specific',
          user_ids: [CONSUMER],
          business_ids: [],
        }),
      );

      await expect(
        service.update(ANNOUNCEMENT_ID, { user_ids: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rechaza cambiar a specific sin traer los ids', async () => {
      repository.findById.mockResolvedValue(makeRow({ audience_kind: 'all' }));

      await expect(service.update(ANNOUNCEMENT_ID, specific)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('acepta cambiar la audiencia dirigida con ids', async () => {
      repository.findById.mockResolvedValue(
        makeRow({ audience_kind: 'all', user_ids: [], business_ids: [] }),
      );
      repository.update.mockResolvedValue(
        makeRow({ audience_kind: 'specific', user_ids: [CONSUMER] }),
      );

      const result = await service.update(ANNOUNCEMENT_ID, {
        audience_kind: 'specific',
        user_ids: [CONSUMER],
      });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        ANNOUNCEMENT_ID,
        { audience_kind: 'specific', user_ids: [CONSUMER] },
      );
      expect(result.audience_kind).toBe('specific');
    });

    it('no manda las listas que el PATCH no menciona', async () => {
      repository.findById.mockResolvedValue(makeRow());
      repository.update.mockResolvedValue(makeRow({ title: 'Otro título' }));

      await service.update(ANNOUNCEMENT_ID, { title: 'Otro título' });

      expect(repository.update).toHaveBeenCalledWith(
        expect.anything(),
        ANNOUNCEMENT_ID,
        { title: 'Otro título' },
      );
    });

    it('permite dar de baja un aviso por PATCH, que es el mismo soft delete', async () => {
      repository.findById.mockResolvedValue(makeRow());
      repository.update.mockResolvedValue(makeRow({ active: false }));

      const result = await service.update(ANNOUNCEMENT_ID, { active: false });

      expect(result.active).toBe(false);
    });
  });

  // ─── remove: soft delete, sin borrado físico ───────────────────────────────
  describe('remove', () => {
    it('da de baja el aviso con active=false', async () => {
      repository.deactivate.mockResolvedValue(makeRow({ active: false }));

      await expect(service.remove(ANNOUNCEMENT_ID)).resolves.toBeUndefined();

      expect(repository.deactivate).toHaveBeenCalledWith(
        expect.anything(),
        ANNOUNCEMENT_ID,
      );
    });

    it('lanza 404 si no hay nada que dar de baja', async () => {
      repository.deactivate.mockResolvedValue(null);

      await expect(service.remove(ANNOUNCEMENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
