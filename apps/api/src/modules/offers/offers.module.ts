import { Module, forwardRef } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OffersController } from './offers.controller';
import { OffersExpirationJob } from './offers-expiration.job';
import { OffersRepository } from './offers.repository';
import { OffersService } from './offers.service';

@Module({
  // `BusinessesModule` por UNA razón: `BusinessesRepository.roleOf` es la única
  // respuesta a «¿esto es mi negocio?». Antes este módulo preguntaba por su
  // cuenta con `OffersRepository.isBusinessOwner`, que era la segunda de las
  // tres copias del mismo predicado, y las tres leían la tabla que Plan 3 va a
  // dropear.
  imports: [BusinessesModule, forwardRef(() => NotificationsModule)],
  controllers: [OffersController],
  providers: [OffersService, OffersRepository, OffersExpirationJob],
  exports: [OffersRepository],
})
export class OffersModule {}
