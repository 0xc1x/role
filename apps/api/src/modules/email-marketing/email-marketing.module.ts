import { Module } from '@nestjs/common';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { EmailMarketingController } from './email-marketing.controller';
import { EmailMarketingRepository } from './email-marketing.repository';
import { CampaignsService } from './campaigns.service';
import { RecipientsService } from './recipients.service';
import { RendererService } from './renderer.service';
import { EmailMarketingExpeditionJob } from './expedition.job';

@Module({
  controllers: [EmailMarketingController, EmailMarketingPublicController],
  providers: [
    EmailMarketingRepository,
    CampaignsService,
    RecipientsService,
    RendererService,
    EmailMarketingExpeditionJob,
  ],
  exports: [CampaignsService],
})
export class EmailMarketingModule {}
