import { Module, forwardRef } from '@nestjs/common';
import { OffersModule } from '../offers/offers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersExpirationJob } from './orders-expiration.job';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [OffersModule, forwardRef(() => NotificationsModule)],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersExpirationJob],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
