import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CampaignsService } from './campaigns.service';

@Processor('email-expedition', { concurrency: 5, limiter: { max: 10, duration: 1000 } })
export class EmailExpeditionProcessor extends WorkerHost {
  constructor(private readonly campaignsService: CampaignsService) {
    super();
  }

  async process(job: Job<{ campaignId: string }>): Promise<void> {
    const campaign = await this.campaignsService.getCampaign(job.data.campaignId);
    if (!campaign) return;
    if (campaign.status !== 'sending') return;
    await this.campaignsService.processBatch(campaign);
  }
}
