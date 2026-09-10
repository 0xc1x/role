import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailMarketingModule } from '../email-marketing/email-marketing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsRepository } from './push-notifications.repository';
import { PushAdminService } from './push-admin.service';
import { PushCampaignDispatcher } from './push-campaign-dispatcher';

@Module({
  imports: [
    NotificationsModule,
    EmailMarketingModule,
    // Comparte la cola de expedición de campañas con email-marketing:
    // el dispatcher encola lotes de push_sends en la misma queue.
    BullModule.registerQueue({ name: 'email-expedition' }),
  ],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsRepository, PushAdminService, PushCampaignDispatcher],
})
export class PushNotificationsModule {}
