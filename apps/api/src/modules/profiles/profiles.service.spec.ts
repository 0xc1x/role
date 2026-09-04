import { Test } from '@nestjs/testing';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';

describe('ProfilesService.registerDefaults (espejo de handle_new_user defaults)', () => {
  let service: ProfilesService;
  const insertRegistrationDefaults = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: ProfilesRepository,
          useValue: { insertRegistrationDefaults },
        },
      ],
    }).compile();
    service = module.get(ProfilesService);
    jest.resetAllMocks();
  });

  it('delega la creación de preferencias y consents default', async () => {
    insertRegistrationDefaults.mockResolvedValue(undefined);

    await service.registerDefaults('user-1');

    expect(insertRegistrationDefaults).toHaveBeenCalledWith('user-1');
  });
});

describe('ProfilesService.list (mapeo de filtros al repositorio)', () => {
  let service: ProfilesService;
  const list = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: ProfilesRepository, useValue: { list } },
      ],
    }).compile();
    service = module.get(ProfilesService);
    jest.resetAllMocks();
    list.mockResolvedValue({ rows: [], total: 0 });
  });

  it('mapea los filtros query (snake_case) a las claves del repositorio', async () => {
    await service.list({
      page: 1,
      limit: 10,
      subscribed_to: 'promotions',
      has_active_push_token: true,
    });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribedTo: 'promotions',
        hasActivePushToken: true,
      }),
    );
  });

  it('no filtra por push token cuando el query no lo trae', async () => {
    await service.list({ page: 1, limit: 10 });

    expect(list).toHaveBeenCalledWith(
      expect.not.objectContaining({ hasActivePushToken: expect.anything() }),
    );
  });
});

describe('ProfilesService.getById/update (delegación)', () => {
  test('getById mapea o null; update lanza si falta', async () => {
    const row = {
      id: 'u1',
      email: 'a@b.cl',
      full_name: null,
      avatar_url: null,
      phone: null,
      role: 'user',
      city: null,
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    };
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: ProfilesRepository,
          useValue: {
            findById: async (id: string) => (id === 'u1' ? row : null),
            update: async (id: string, v: object) =>
              id === 'u1' ? { ...row, ...v } : null,
          },
        },
      ],
    }).compile();
    const svc = module.get(ProfilesService);
    expect(await svc.getById('u1')).toMatchObject({ email: 'a@b.cl' });
    expect(await svc.getById('x')).toBeNull();
    expect((await svc.update('u1', { city: 'Stgo' })).city).toBe('Stgo');
    await expect(svc.update('x', {})).rejects.toThrow('Perfil no encontrado');
  });
});
