import { Module, forwardRef } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { OffersModule } from '../offers/offers.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersExpirationJob } from './orders-expiration.job';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  // `BusinessesModule` por UNA razón: `BusinessesRepository.roleOf` es la única
  // respuesta a «¿esto es mi negocio?». Antes este módulo preguntaba por su
  // cuenta con `OrdersRepository.isBusinessOwner` —y con el join contra
  // `business_ownership` de las dos lecturas del pedido—, que eran la tercera
  // de las copias del mismo predicado.
  imports: [
    OffersModule,
    BusinessesModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, OrdersExpirationJob],
})
export class OrdersModule {}
