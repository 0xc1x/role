jest.mock('@0xc1x/role-commons', () => ({
  CreatePushSendSchema: {},
  CreatePushTemplateSchema: {},
  ListPushNotificationsQuerySchema: {},
  ListPushTemplatesQuerySchema: {},
  ListPushTokensQuerySchema: {},
  PushAudienceSchema: {},
  PushTestSchema: {},
  UpdatePushTemplateSchema: {},
  UpdatePushTokenSchema: {},
  paginatedDataFromQuery: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { paginatedDataFromQuery } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { PushNotificationsController } from './push-notifications.controller';
import { PushAdminService } from './push-admin.service';
import { PushNotificationsRepository } from './push-notifications.repository';

const TEMPLATE_ROW = {
  id: 'tpl-1',
  name: ' Promo semanal',
  title: 'Nuevas ofertas',
  body: 'Mira lo nuevo',
  data: { screen: 'explore' },
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  deleted_at: null,
};

const TOKEN_ROW = {
  id: 'tok-1',
  user_id: 'u-1',
  user_email: 'ana@x.com',
  user_full_name: 'Ana',
  token: 'ExponentPushToken[x]',
  platform: 'ios',
  is_active: true,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

const NOTIFICATION_ROW = {
  id: 'not-1',
  template_id: null,
  title: 'Nuevas ofertas',
  body: 'Mira lo nuevo',
  type: 'manual',
  data: {},
  segment_ids: [],
  include_user_ids: ['u-1'],
  exclude_user_ids: [],
  total_targeted: 1,
  sent_count: 1,
  failed_count: 0,
  status: 'sent',
  created_by: 'admin-1',
  created_at: new Date('2026-01-01T00:00:00Z'),
};

describe('PushNotificationsController', () => {
  let controller: PushNotificationsController;
  let repository: jest.Mocked<
    Pick<
      PushNotificationsRepository,
      | 'listTemplates'
      | 'insertTemplate'
      | 'updateTemplate'
      | 'deleteTemplate'
      | 'listTokens'
      | 'updateToken'
      | 'listNotifications'
      | 'findNotificationById'
    >
  >;
  let pushAdminService: jest.Mocked<
    Pick<PushAdminService, 'testTemplate' | 'countAudience' | 'send' | 'test'>
  >;
  const admin: AuthUser = { id: 'admin-1', role: 'admin', email: 'a@x.com' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PushNotificationsController],
      providers: [
        {
          provide: PushNotificationsRepository,
          useValue: {
            listTemplates: jest.fn(),
            insertTemplate: jest.fn(),
            updateTemplate: jest.fn(),
            deleteTemplate: jest.fn(),
            listTokens: jest.fn(),
            updateToken: jest.fn(),
            listNotifications: jest.fn(),
            findNotificationById: jest.fn(),
          },
        },
        {
          provide: PushAdminService,
          useValue: {
            testTemplate: jest.fn(),
            countAudience: jest.fn(),
            send: jest.fn(),
            test: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PushNotificationsController);
    repository = module.get(PushNotificationsRepository);
    pushAdminService = module.get(PushAdminService);
    jest.clearAllMocks();
    (paginatedDataFromQuery as jest.Mock).mockImplementation(
      (data: unknown[], q: Record<string, unknown>, total: number) => ({
        data,
        meta: { ...q, total },
      }),
    );
  });

  describe('plantillas', () => {
    it('listTemplates mapea filas a DTO paginado', async () => {
      repository.listTemplates.mockResolvedValue({ rows: [TEMPLATE_ROW], total: 1 } as never);

      const out = (await controller.listTemplates({ page: 1, limit: 20 } as never)) as {
        data: { id: string; created_at: string }[];
        meta: { total: number };
      };

      expect(out.data[0]).toMatchObject({ id: 'tpl-1', title: 'Nuevas ofertas' });
      expect(typeof out.data[0]!.created_at).toBe('string');
      expect(out.meta.total).toBe(1);
    });

    it('createTemplate inyecta created_by y data default', async () => {
      repository.insertTemplate.mockResolvedValue([TEMPLATE_ROW] as never);

      await controller.createTemplate(admin, {
        name: 'Promo',
        title: 'T',
        body: 'B',
      } as never);

      expect(repository.insertTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'admin-1', data: {} }),
      );
    });

    it('updateTemplate devuelve null si la fila no existe', async () => {
      repository.updateTemplate.mockResolvedValue(null);
      await expect(controller.updateTemplate('tpl-1', { title: 'x' } as never)).resolves.toBeNull();
    });

    it('removeTemplate delega', () => {
      repository.deleteTemplate.mockResolvedValue(true);
      controller.removeTemplate('tpl-1');
      expect(repository.deleteTemplate).toHaveBeenCalledWith('tpl-1');
    });
  });

  describe('envío manual', () => {
    it('testTemplate delega en el servicio', () => {
      controller.testTemplate('tpl-1', { user_ids: ['u-1'] } as never);
      expect(pushAdminService.testTemplate).toHaveBeenCalledWith('tpl-1', {
        user_ids: ['u-1'],
      });
    });

    it('audience normaliza el body al formato del servicio', () => {
      controller.audience({
        segment_ids: ['seg-1'],
        include_user_ids: [],
        exclude_user_ids: ['u-9'],
      } as never);

      expect(pushAdminService.countAudience).toHaveBeenCalledWith({
        segmentIds: ['seg-1'],
        includeUserIds: [],
        excludeUserIds: ['u-9'],
      });
    });

    it('send pasa el body y el id del admin', () => {
      const body = { title: 'T', body: 'B' } as never;
      controller.send(admin, body);
      expect(pushAdminService.send).toHaveBeenCalledWith(body, 'admin-1');
    });

    it('test delega tal cual', () => {
      const body = { user_ids: ['u-1'] } as never;
      controller.test(body);
      expect(pushAdminService.test).toHaveBeenCalledWith(body);
    });
  });

  describe('dispositivos', () => {
    it('listTokens mapea el join a DTO', async () => {
      repository.listTokens.mockResolvedValue({ rows: [TOKEN_ROW], total: 1 } as never);

      const out = (await controller.listTokens({ page: 1, limit: 20 } as never)) as {
        data: { id: string; user_email: string }[];
      };

      expect(out.data[0]).toMatchObject({ id: 'tok-1', user_email: 'ana@x.com' });
    });

    it('updateToken delega', () => {
      repository.updateToken.mockResolvedValue({ id: 'tok-1' } as never);
      controller.updateToken('tok-1', { is_active: false } as never);
      expect(repository.updateToken).toHaveBeenCalledWith('tok-1', { is_active: false });
    });
  });

  describe('historial', () => {
    it('listNotifications mapea filas a DTO paginado', async () => {
      repository.listNotifications.mockResolvedValue({ rows: [NOTIFICATION_ROW], total: 1 } as never);

      const out = (await controller.listNotifications({ page: 1, limit: 20 } as never)) as {
        data: { id: string; status: string }[];
      };

      expect(out.data[0]).toMatchObject({ id: 'not-1', status: 'sent' });
    });

    it('getNotification devuelve null cuando no existe', async () => {
      repository.findNotificationById.mockResolvedValue(null);
      await expect(controller.getNotification('nope')).resolves.toBeNull();
    });
  });
});
