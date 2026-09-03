import { Module } from '@nestjs/common';
import { EmailMarketingModule } from '../email-marketing/email-marketing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsRepository } from './push-notifications.repository';
import { PushAdminService } from './push-admin.service';

@Module({
  imports: [NotificationsModule, EmailMarketingModule],
  controllers: [PushNotificationsController],
  providers: [PushNotificationsRepository, PushAdminService],
})
export class PushNotificationsModule {}
