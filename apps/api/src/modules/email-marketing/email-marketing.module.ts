import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingRepository } from './email-marketing.repository';
import { CampaignsService } from './campaigns.service';
import { RecipientsService } from './recipients.service';
import { RendererService } from './renderer.service';
import { EmailExpeditionProcessor } from './email-expedition.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email-expedition',
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
  ],
  controllers: [EmailMarketingController, EmailMarketingPublicController],
  providers: [
    EmailMarketingRepository,
    CampaignsService,
    RecipientsService,
    RendererService,
    EmailExpeditionProcessor,
  ],
  exports: [CampaignsService, RecipientsService],
})
export class EmailMarketingModule {}
