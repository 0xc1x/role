jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));

import { Test } from '@nestjs/testing';
import { EmailExpeditionProcessor } from './email-expedition.processor';
import { CampaignsService } from './campaigns.service';

const makeCampaign = (status: string) => ({
  id: 'c-1',
  name: 'Campaña',
  status,
  template_id: 't-1',
});

describe('EmailExpeditionProcessor', () => {
  let processor: EmailExpeditionProcessor;
  let campaignsService: jest.Mocked<Pick<CampaignsService, 'getCampaign' | 'processBatch'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailExpeditionProcessor,
        {
          provide: CampaignsService,
          useValue: {
            getCampaign: jest.fn(),
            processBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get(EmailExpeditionProcessor);
    campaignsService = module.get(CampaignsService);
    jest.resetAllMocks();
  });

  it('procesa el lote de una campaña en envío', async () => {
    const campaign = makeCampaign('sending') as never;
    campaignsService.getCampaign.mockResolvedValue(campaign);
    campaignsService.processBatch.mockResolvedValue(3);

    await processor.process({ data: { campaignId: 'c-1' } } as never);

    expect(campaignsService.processBatch).toHaveBeenCalledWith(campaign);
  });

  it('no procesa campañas que ya no están en envío', async () => {
    campaignsService.getCampaign.mockResolvedValue(makeCampaign('cancelled') as never);

    await processor.process({ data: { campaignId: 'c-1' } } as never);

    expect(campaignsService.processBatch).not.toHaveBeenCalled();
  });

  it('ignora campañas inexistentes (borradas)', async () => {
    campaignsService.getCampaign.mockResolvedValue(null);

    await expect(
      processor.process({ data: { campaignId: 'no-existe' } } as never),
    ).resolves.toBeUndefined();
    expect(campaignsService.processBatch).not.toHaveBeenCalled();
  });
});
