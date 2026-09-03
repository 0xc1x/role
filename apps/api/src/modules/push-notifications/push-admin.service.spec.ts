import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PushAdminService } from './push-admin.service';
import { PushNotificationsRepository } from './push-notifications.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { RecipientsService } from '../email-marketing/recipients.service';

describe('PushAdminService', () => {
  let service: PushAdminService;
  let pushRepo: jest.Mocked<PushNotificationsRepository>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let recipientsService: jest.Mocked<RecipientsService>;

  const sendInput = {
    title: 'Hola {{nombre}}',
    body: 'Cuerpo',
    type: 'announcement' as const,
    data: {},
    segment_ids: [],
    include_user_ids: ['u1'],
    exclude_user_ids: [],
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PushAdminService,
        {
          provide: PushNotificationsRepository,
          useValue: {
            findTemplateById: jest.fn(),
            insertNotification: jest.fn(),
            countUsersWithActiveTokens: jest.fn(),
            findProfileNames: jest.fn(),
            filterPushEnabled: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: { sendWithReport: jest.fn() },
        },
        {
          provide: RecipientsService,
          useValue: { resolveUserIds: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(PushAdminService);
    pushRepo = module.get(PushNotificationsRepository);
    notificationsService = module.get(NotificationsService);
    recipientsService = module.get(RecipientsService);
    jest.resetAllMocks();
  });

  it('audience cuenta usuarios con push habilitado y token activo', async () => {
    recipientsService.resolveUserIds.mockResolvedValue(['u1', 'u2', 'u3']);
    pushRepo.filterPushEnabled.mockResolvedValue(['u1', 'u2']);
    pushRepo.countUsersWithActiveTokens.mockResolvedValue(2);

    await expect(
      service.countAudience({
        segmentIds: [],
        includeUserIds: ['u1'],
        excludeUserIds: [],
      }),
    ).resolves.toEqual({ total: 2 });
  });

  it('send resuelve audiencia, envía con render y registra el historial', async () => {
    recipientsService.resolveUserIds.mockResolvedValue(['u1']);
    pushRepo.filterPushEnabled.mockResolvedValue(['u1']);
    pushRepo.findProfileNames.mockResolvedValue([{ user_id: 'u1', full_name: 'Ana' }]);
    notificationsService.sendWithReport.mockResolvedValue({
      targeted: 1,
      sent: 1,
      failed: 0,
    });
    pushRepo.insertNotification.mockResolvedValue([
      { id: 'n1' },
    ] as never);

    const result = await service.send(sendInput, 'admin1');

    expect(notificationsService.sendWithReport).toHaveBeenCalledWith(
      ['u1'],
      { title: 'Hola {{nombre}}', body: 'Cuerpo', data: { type: 'announcement' } },
      expect.objectContaining({ render: expect.any(Function) }),
    );
    // El render sustituye {{nombre}} por el nombre del perfil.
    const call = notificationsService.sendWithReport.mock.calls[0]!;
    const render = call[2]!.render!;
    expect(render('u1').title).toBe('Hola Ana');
    expect(result).toEqual({ id: 'n1', targeted: 1, sent: 1, failed: 0 });
    expect(pushRepo.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        total_targeted: 1,
        sent_count: 1,
        failed_count: 0,
        created_by: 'admin1',
      }),
    );
  });

  it('send marca partial cuando hay fallidos', async () => {
    recipientsService.resolveUserIds.mockResolvedValue(['u1', 'u2']);
    pushRepo.filterPushEnabled.mockResolvedValue(['u1', 'u2']);
    pushRepo.findProfileNames.mockResolvedValue([]);
    notificationsService.sendWithReport.mockResolvedValue({
      targeted: 2,
      sent: 1,
      failed: 1,
    });
    pushRepo.insertNotification.mockResolvedValue([{ id: 'n2' }] as never);

    await service.send(sendInput, 'admin1');

    expect(pushRepo.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partial' }),
    );
  });

  it('test envía sin filtros, con prefijo [TEST] y sin registrar historial', async () => {
    notificationsService.sendWithReport.mockResolvedValue({
      targeted: 1,
      sent: 1,
      failed: 0,
    });

    await service.test({
      user_ids: ['u1'],
      title: 'Hola',
      body: 'Cuerpo',
      type: 'announcement',
    });

    expect(notificationsService.sendWithReport).toHaveBeenCalledWith(
      ['u1'],
      { title: '[TEST] Hola', body: 'Cuerpo', data: { type: 'announcement' } },
      expect.objectContaining({ skipFilters: true }),
    );
    expect(pushRepo.insertNotification).not.toHaveBeenCalled();
  });

  it('testTemplate rechaza plantilla inexistente', async () => {
    pushRepo.findTemplateById.mockResolvedValue(null);
    await expect(
      service.testTemplate('no-id', {
        user_ids: ['u1'],
        title: 't',
        body: 'b',
        type: 'announcement',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('testTemplate renderiza {{nombre}} por destinatario', async () => {
    pushRepo.findTemplateById.mockResolvedValue({
      id: 'tpl1',
      name: 'Saludo',
      title: 'Hola {{nombre}}',
      body: '¡Bienvenido {{nombre}}!',
      data: {},
      is_active: true,
      created_by: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    } as never);
    pushRepo.findProfileNames.mockResolvedValue([
      { user_id: 'u1', full_name: 'Ana' },
    ]);
    notificationsService.sendWithReport.mockResolvedValue({
      targeted: 1,
      sent: 1,
      failed: 0,
    });

    await service.testTemplate('tpl1', {
      user_ids: ['u1'],
      title: 'x',
      body: 'y',
      type: 'announcement',
    });

    const call = notificationsService.sendWithReport.mock.calls[0]!;
    expect(call[1]!.title).toBe('[TEST] Hola {{nombre}}');
    const render = call[2]!.render!;
    expect(render('u1').title).toBe('[TEST] Hola Ana');
    expect(render('u1').body).toBe('¡Bienvenido Ana!');
  });

  it('test sin {{nombre}} no consulta perfiles', async () => {
    notificationsService.sendWithReport.mockResolvedValue({
      targeted: 1,
      sent: 1,
      failed: 0,
    });

    await service.test({
      user_ids: ['u1'],
      title: 'Sin variables',
      body: 'Cuerpo plano',
      type: 'announcement',
    });

    expect(pushRepo.findProfileNames).not.toHaveBeenCalled();
    expect(notificationsService.sendWithReport).toHaveBeenCalledWith(
      ['u1'],
      expect.anything(),
      expect.objectContaining({ render: undefined }),
    );
  });
});
