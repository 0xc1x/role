import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { MeController } from './me.controller';
import { MeRepository } from './me.repository';
import { MeService } from './me.service';

@Module({
  // CategoriesModule for ONE reason: `favorite_categories` is validated against
  // the catalog rather than stored as free text, and that predicate has to be
  // the same one the near-offer dispatch matches on. The categories rows
  // themselves never leave through this module; only their names and slugs are
  // read, to resolve a value the caller sent.
  imports: [CategoriesModule],
  controllers: [MeController],
  providers: [MeService, MeRepository],
})
export class MeModule {}
