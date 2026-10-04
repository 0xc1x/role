import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type {
  AnnouncementDto,
  AnnouncementListQuery,
  CreateAnnouncementDto,
} from '@0c1x/role-commons';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

describe('AnnouncementsController', () => {
  let controller: AnnouncementsController;
  let service: jest.Mocked<AnnouncementsService>;
  let reflector: Reflector;

  const ID = '3f1b1a4e-2c6d-4a5f-9c2e-1f0d2b3c4d5e';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [
        {
          provide: AnnouncementsService,
          useValue: {
            listForAudience: jest.fn(),
            listAdmin: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AnnouncementsController);
    service = module.get(AnnouncementsService);
    reflector = module.get(Reflector);

    jest.resetAllMocks();
  });

  describe('list', () => {
    it('pasa la cabecera Authorization al service tal cual', async () => {
      service.listForAudience.mockResolvedValue([]);

      await controller.list('Bearer un-jwt');

      // La cabecera viaja entera porque el service la reenvía a Supabase: la
      // lectura tiene que ocurrir como el usuario para que la policy decida.
      expect(service.listForAudience).toHaveBeenCalledWith('Bearer un-jwt');
    });

    it('sin cabecera, el service recibe null y no una cadena vacía', async () => {
      service.listForAudience.mockResolvedValue([]);

      await controller.list(undefined);

      expect(service.listForAudience).toHaveBeenCalledWith(null);
    });

    it('devuelve la lista tal como la da el service', async () => {
      const rows: AnnouncementDto[] = [
        {
          id: ID,
          title: 'Mantenimiento',
          body: 'No hay ofertas nuevas.',
          severity: 'info',
          audience_kind: 'all',
          priority: 0,
          active: true,
          start_at: null,
          end_at: null,
          created_at: '2026-10-03T12:00:00.000Z',
          updated_at: '2026-10-03T12:00:00.000Z',
        },
      ];
      service.listForAudience.mockResolvedValue(rows);

      await expect(controller.list(undefined)).resolves.toEqual(rows);
    });
  });

  describe('authorization', () => {
    // La metadata es lo único que separa "el operador publica" de "cualquiera
    // publica". Un `@Public()` de más en un POST es una escritura abierta, y un
    // `@Roles('admin')` de menos en el listado es la tabla entera del panel.
    it('la lectura pública es pública', () => {
      // El landing no tiene sesión: sin esto su banner no se renderiza. Y es la
      // ÚNICA lectura sin sesión — la de admin no, porque hay que ser admin para
      // ver los avisos que ya no están activos.
      expect(reflector.get(IS_PUBLIC_KEY, controller.list)).toBe(true);
    });

    it('el listado del panel y las escrituras exigen rol admin', () => {
      expect(reflector.get(ROLES_KEY, controller.listAdmin)).toEqual(['admin']);
      expect(reflector.get(ROLES_KEY, controller.create)).toEqual(['admin']);
      expect(reflector.get(ROLES_KEY, controller.update)).toEqual(['admin']);
      expect(reflector.get(ROLES_KEY, controller.remove)).toEqual(['admin']);
    });

    it('ninguna escritura es pública, ni siquiera por herencia de la clase', () => {
      for (const handler of [
        controller.listAdmin,
        controller.create,
        controller.update,
        controller.remove,
      ]) {
        expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
      }
    });
  });

  describe('create / update / remove', () => {
    const dto: AnnouncementDto = {
      id: ID,
      title: 'Mantenimiento del sábado',
      body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
      severity: 'required',
      audience_kind: 'all',
      priority: 0,
      active: true,
      start_at: null,
      end_at: null,
      created_at: '2026-10-03T12:00:00.000Z',
      updated_at: '2026-10-03T12:00:00.000Z',
    };

    it('create delega el body sin tocarlo', async () => {
      const body: CreateAnnouncementDto = {
        title: 'Mantenimiento del sábado',
        body: 'No hay ofertas nuevas entre las 3 y las 5 de la tarde.',
        severity: 'required',
        audience_kind: 'all',
        priority: 0,
        active: true,
      };
      service.create.mockResolvedValue(dto);

      await controller.create(body);

      expect(service.create).toHaveBeenCalledWith(body);
    });

    it('update delega id y body', async () => {
      service.update.mockResolvedValue(dto);

      await controller.update(ID, { title: 'Otro título' });

      expect(service.update).toHaveBeenCalledWith(ID, { title: 'Otro título' });
    });

    it('remove delega el id y no devuelve nada', async () => {
      service.remove.mockResolvedValue(undefined);

      await expect(controller.remove(ID)).resolves.toBeUndefined();

      expect(service.remove).toHaveBeenCalledWith(ID);
    });

    it('listAdmin delega la query parseada', async () => {
      const query: AnnouncementListQuery = {
        page: 1,
        limit: 20,
        active: false,
      };
      service.listAdmin.mockResolvedValue({
        data: [dto],
        meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
      });

      await controller.listAdmin(query);

      expect(service.listAdmin).toHaveBeenCalledWith(query);
    });
  });
});
