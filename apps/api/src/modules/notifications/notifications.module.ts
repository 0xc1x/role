import { Module } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationHandlers } from './notification.handlers';
import { NotificationJobs } from './notification.jobs';

@Module({
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationHandlers,
    NotificationJobs,
  ],
  exports: [NotificationsService, NotificationHandlers, NotificationsRepository],
})
export class NotificationsModule {}
