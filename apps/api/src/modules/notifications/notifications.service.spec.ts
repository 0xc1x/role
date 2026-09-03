import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';

describe('NotificationsService (espejo send-push-notification)', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<NotificationsRepository>;
  const get = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: {
            findActiveTokens: jest.fn(),
            deactivateToken: jest.fn(),
            filterByConsumerPrefs: jest.fn(),
            isInQuietHours: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get } },
      ],
    }).compile();
    service = module.get(NotificationsService);
    repo = module.get(NotificationsRepository);
    jest.resetAllMocks();
    get.mockImplementation((key: string) => {
      if (key === 'CORS_ORIGINS') return 'http://localhost:3000';
      if (key === 'REDIS_URL') return ''; // direct mode for tests
      if (key === 'FCM_SERVICE_ACCOUNT') return '';
      if (key === 'FCM_PROJECT_ID') return '';
      if (key === 'EXPO_ACCESS_TOKEN') return '';
      return '';
    });
  });

  it('filtra por push_enabled y quiet_hours antes de enviar', async () => {
    repo.filterByConsumerPrefs
      .mockResolvedValueOnce(['u1']) // prefFlag none
      .mockResolvedValueOnce(['u1']); // push_enabled
    repo.isInQuietHours.mockResolvedValue(false);
    repo.findActiveTokens.mockResolvedValue([
      { user_id: 'u1', token: 'ExponentPushToken[xxx]', platform: 'android' },
    ]);
    // Mock Expo fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as never);

    await service.processSend({
      userIds: ['u1'],
      payload: { title: 'Hola', body: 'Test', data: { link: '/orders/1' } },
    });

    expect(repo.findActiveTokens).toHaveBeenCalledWith(['u1']);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('desactiva token muerto (Expo DeviceNotRegistered)', async () => {
    repo.filterByConsumerPrefs.mockResolvedValue(['u1']);
    repo.isInQuietHours.mockResolvedValue(false);
    repo.findActiveTokens.mockResolvedValue([
      { user_id: 'u1', token: 'ExponentPushToken[dead]', platform: 'android' },
    ]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'error', details: { error: 'DeviceNotRegistered' } } }),
    } as never);

    await service.processSend({
      userIds: ['u1'],
      payload: { title: 'T', body: 'B' },
    });

    expect(repo.deactivateToken).toHaveBeenCalledWith('ExponentPushToken[dead]');
  });

  it('sin FCM_SERVICE_ACCOUNT hace mock success (no deactivate)', async () => {
    repo.filterByConsumerPrefs.mockResolvedValue(['u1']);
    repo.isInQuietHours.mockResolvedValue(false);
    repo.findActiveTokens.mockResolvedValue([
      { user_id: 'u1', token: 'web-token', platform: 'web' },
    ]);
    await service.processSend({
      userIds: ['u1'],
      payload: { title: 'T', body: 'B' },
    });
    expect(repo.deactivateToken).not.toHaveBeenCalled();
  });

  it('FCM con private_key truncada cuenta como fallo y no desactiva el token', async () => {
    repo.filterByConsumerPrefs.mockResolvedValue(['u1']);
    repo.isInQuietHours.mockResolvedValue(false);
    repo.findActiveTokens.mockResolvedValue([
      { user_id: 'u1', token: 'web-token', platform: 'web' },
    ]);
    get.mockImplementation((key: string) => {
      if (key === 'FCM_SERVICE_ACCOUNT')
        return '{"type":"service_account","client_email":"sa@fudi.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIEvQ\\n-----END PRIVATE KEY-----\\n"}';
      if (key === 'FCM_PROJECT_ID') return 'fudi';
      if (key === 'CORS_ORIGINS') return 'http://localhost:3000';
      return '';
    });
    global.fetch = jest.fn();

    const report = await service.sendWithReport(['u1'], { title: 'T', body: 'B' });

    expect(report).toEqual({ targeted: 1, sent: 0, failed: 1 });
    expect(repo.deactivateToken).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
