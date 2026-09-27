import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  // Exported for the one caller that must not re-derive the catalog predicate:
  // `MeService` validates `user_preferences.favorite_categories` against it, and
  // a second copy of `active AND deleted_at IS NULL` is a second place to drift
  // from what `dispatch-nearby-offers` actually matches. Read-only use.
  exports: [CategoriesRepository],
})
export class CategoriesModule {}
