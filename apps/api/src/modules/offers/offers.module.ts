import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OffersController } from './offers.controller';
import { OffersExpirationJob } from './offers-expiration.job';
import { OffersRepository } from './offers.repository';
import { OffersService } from './offers.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [OffersController],
  providers: [OffersService, OffersRepository, OffersExpirationJob],
  exports: [OffersService, OffersRepository],
})
export class OffersModule {}
