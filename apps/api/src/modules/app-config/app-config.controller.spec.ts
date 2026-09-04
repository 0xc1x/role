jest.mock('@0xc1x/role-commons', () => ({
  CreateAppConfigSchema: {},
  ListAppConfigQuerySchema: {},
  UpdateAppConfigSchema: {},
}));

import { Test } from '@nestjs/testing';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';

describe('AppConfigController', () => {
  let controller: AppConfigController;
  let service: jest.Mocked<AppConfigService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppConfigController],
      providers: [
        {
          provide: AppConfigService,
          useValue: {
            listPublic: jest.fn(),
            list: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AppConfigController);
    service = module.get(AppConfigService);
  });

  it('listPublic delega (ruta pública)', () => {
    controller.listPublic();
    expect(service.listPublic).toHaveBeenCalled();
  });

  it('list pasa el query', () => {
    const query = { page: 1, limit: 20 } as never;
    controller.list(query);
    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('create delega con el body', () => {
    const body = { key: 'ios_min_version', value: '1.2.0' } as never;
    controller.create(body);
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it('update pasa key y body', () => {
    const body = { value: '1.3.0' } as never;
    controller.update('ios_min_version', body);
    expect(service.update).toHaveBeenCalledWith('ios_min_version', body);
  });

  it('remove delega por key', () => {
    controller.remove('ios_min_version');
    expect(service.remove).toHaveBeenCalledWith('ios_min_version');
  });
});
