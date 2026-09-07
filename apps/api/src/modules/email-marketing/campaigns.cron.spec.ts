import { Test } from '@nestjs/testing';
import { CampaignsCron } from './campaigns.cron';
import { CampaignsService } from './campaigns.service';

describe('CampaignsCron', () => {
  let cron: CampaignsCron;
  let campaignsService: jest.Mocked<Pick<CampaignsService, 'processTick'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CampaignsCron,
        { provide: CampaignsService, useValue: { processTick: jest.fn() } },
      ],
    }).compile();

    cron = module.get(CampaignsCron);
    campaignsService = module.get(CampaignsService);
    jest.resetAllMocks();
  });

  it('delega el tick en processTick (due + transaccionales; sending solo sin Redis)', async () => {
    campaignsService.processTick.mockResolvedValue({ processed: 2 });

    await cron.tick();

    expect(campaignsService.processTick).toHaveBeenCalledTimes(1);
  });

  it('no propaga el error del tick (el cron del minuto siguiente reintenta)', async () => {
    campaignsService.processTick.mockRejectedValue(new Error('db down'));

    await expect(cron.tick()).resolves.toBeUndefined();
  });
});
