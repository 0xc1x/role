import { Module } from '@nestjs/common';
import { OffersModule } from '../offers/offers.module';
import { OrdersExpirationJob } from './orders-expiration.job';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [OffersModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersExpirationJob],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
