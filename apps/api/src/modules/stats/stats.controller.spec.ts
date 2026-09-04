import { Test } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  let controller: StatsController;
  let service: jest.Mocked<Pick<StatsService, 'getPlatformStats'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [{ provide: StatsService, useValue: { getPlatformStats: jest.fn() } }],
    }).compile();

    controller = module.get(StatsController);
    service = module.get(StatsService);
  });

  it('getPlatformStats delega en el servicio', () => {
    controller.getPlatformStats();
    expect(service.getPlatformStats).toHaveBeenCalled();
  });
});
