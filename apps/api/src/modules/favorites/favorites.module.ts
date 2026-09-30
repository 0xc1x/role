import { Module } from '@nestjs/common';
import { OffersModule } from '../offers/offers.module';
import { FavoritesController } from './favorites.controller';
import { FavoritesRepository } from './favorites.repository';
import { FavoritesService } from './favorites.service';

@Module({
  // OffersModule only for the offer projection embedded in the list; the
  // favorite rows themselves never leave the database through it.
  imports: [OffersModule],
  controllers: [FavoritesController],
  providers: [FavoritesService, FavoritesRepository],
})
export class FavoritesModule {}
