import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller';
import { OffersExpirationJob } from './offers-expiration.job';
import { OffersRepository } from './offers.repository';
import { OffersService } from './offers.service';

@Module({
  controllers: [OffersController],
  providers: [OffersService, OffersRepository, OffersExpirationJob],
  exports: [OffersService, OffersRepository],
})
export class OffersModule {}
