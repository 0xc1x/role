import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OffersExpirationJob } from './offers-expiration.job';
import { OffersService } from './offers.service';

describe('OffersExpirationJob', () => {
  let job: OffersExpirationJob;
  let offersService: jest.Mocked<Pick<OffersService, 'expireStale'>>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OffersExpirationJob,
        {
          provide: OffersService,
          useValue: { expireStale: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => true) },
        },
      ],
    }).compile();

    job = module.get(OffersExpirationJob);
    offersService = module.get(OffersService);
    config = module.get(ConfigService);
    offersService.expireStale.mockResolvedValue({ expired: 0 });
  });

  it('desactiva ofertas vencidas cuando el mirror está habilitado', async () => {
    offersService.expireStale.mockResolvedValue({ expired: 2 });

    await job.handleExpireStale();

    expect(offersService.expireStale).toHaveBeenCalledTimes(1);
  });

  it('dormido sin ENABLE_API_MIRROR_OFFERS (trigger SQL manda)', async () => {
    config.get.mockReturnValue(false);

    await job.handleExpireStale();

    expect(offersService.expireStale).not.toHaveBeenCalled();
  });

  it('no lanza el error del servicio y libera el flag para el próximo tick', async () => {
    offersService.expireStale.mockRejectedValueOnce(new Error('db down'));

    await expect(job.handleExpireStale()).resolves.toBeUndefined();
    await job.handleExpireStale();
    expect(offersService.expireStale).toHaveBeenCalledTimes(2);
  });

  it('salta el tick cuando ya hay una ejecución en curso', async () => {
    let release!: () => void;
    offersService.expireStale.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ expired: 0 });
      }),
    );

    const first = job.handleExpireStale();
    await job.handleExpireStale();

    expect(offersService.expireStale).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
