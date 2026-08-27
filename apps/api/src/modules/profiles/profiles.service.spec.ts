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
