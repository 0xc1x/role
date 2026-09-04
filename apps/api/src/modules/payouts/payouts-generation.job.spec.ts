import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PayoutsGenerationJob } from './payouts-generation.job';
import { PayoutsService } from './payouts.service';

describe('PayoutsGenerationJob', () => {
  let job: PayoutsGenerationJob;
  let payoutsService: jest.Mocked<Pick<PayoutsService, 'generate'>>;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayoutsGenerationJob,
        {
          provide: PayoutsService,
          useValue: { generate: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => true) },
        },
      ],
    }).compile();

    job = module.get(PayoutsGenerationJob);
    payoutsService = module.get(PayoutsService);
    config = module.get(ConfigService);
    payoutsService.generate.mockResolvedValue({ count: 0 });
  });

  it('genera pagos cuando el mirror está habilitado', async () => {
    payoutsService.generate.mockResolvedValue({ count: 5 });

    await job.handleGenerate();

    expect(payoutsService.generate).toHaveBeenCalledTimes(1);
  });

  it('dormido sin ENABLE_API_MIRROR_PAYOUTS (cron SQL manda hasta el cutover)', async () => {
    config.get.mockReturnValue(false);

    await job.handleGenerate();

    expect(payoutsService.generate).not.toHaveBeenCalled();
  });

  it('no lanza el error del servicio y libera el flag', async () => {
    payoutsService.generate.mockRejectedValueOnce(new Error('db down'));

    await expect(job.handleGenerate()).resolves.toBeUndefined();
    await job.handleGenerate();
    expect(payoutsService.generate).toHaveBeenCalledTimes(2);
  });

  it('salta el tick cuando ya hay una ejecución en curso', async () => {
    let release!: () => void;
    payoutsService.generate.mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve({ count: 0 });
      }),
    );

    const first = job.handleGenerate();
    await job.handleGenerate();

    expect(payoutsService.generate).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
