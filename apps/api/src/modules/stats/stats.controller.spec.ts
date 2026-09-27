import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { RevenueStatsService } from './revenue-stats.service';
import { StatsService } from './stats.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

describe('StatsController', () => {
  let controller: StatsController;
  let service: jest.Mocked<Pick<StatsService, 'getPlatformStats'>>;
  let revenueService: jest.Mocked<Pick<RevenueStatsService, 'getRevenueStats'>>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        {
          provide: StatsService,
          useValue: { getPlatformStats: jest.fn() },
        },
        {
          provide: RevenueStatsService,
          useValue: { getRevenueStats: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(StatsController);
    service = module.get(StatsService);
    revenueService = module.get(RevenueStatsService);
    reflector = module.get(Reflector);
  });

  it('getPlatformStats delega en el servicio', () => {
    controller.getPlatformStats();
    expect(service.getPlatformStats).toHaveBeenCalled();
  });

  it('getRevenueStats delega con el query', () => {
    const query = { from: '2026-09-01', to: '2026-09-30' };
    controller.getRevenueStats(query);
    expect(revenueService.getRevenueStats).toHaveBeenCalledWith(query);
  });

  it('el reporte de dinero exige rol admin y no es público', () => {
    const handler = controller.getRevenueStats;

    expect(reflector.get(ROLES_KEY, handler)).toEqual(['admin']);
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('el endpoint público no pide rol ni expone el de dinero', () => {
    const handler = controller.getPlatformStats;

    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(reflector.get(ROLES_KEY, handler)).toBeUndefined();
  });
});
