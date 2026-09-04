jest.mock('@0xc1x/role-commons', () => ({
  ListProfilesQuerySchema: {},
  UpdateProfileSchema: {},
}));

import { Test } from '@nestjs/testing';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

describe('ProfilesController', () => {
  let controller: ProfilesController;
  let service: jest.Mocked<ProfilesService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [
        {
          provide: ProfilesService,
          useValue: { list: jest.fn(), getById: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(ProfilesController);
    service = module.get(ProfilesService);
  });

  it('list pasa el query', () => {
    const query = { page: 1, limit: 20 } as never;
    controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('getById delega', () => {
    controller.getById('prof-1');
    expect(service.getById).toHaveBeenCalledWith('prof-1');
  });

  it('update filtra email y avatar_url (viven en auth/Storage)', () => {
    controller.update('prof-1', {
      full_name: 'Ana',
      email: 'nuevo@x.com',
      avatar_url: 'https://cdn/x.png',
    } as never);

    expect(service.update).toHaveBeenCalledWith('prof-1', { full_name: 'Ana' });
  });
});
