import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { UsersModule } from '../users/users.module';
import { BusinessesController } from './businesses.controller';
import { BusinessesPublicController } from './businesses-public.controller';
import { BusinessesPublicService } from './businesses-public.service';
import { BusinessesRepository } from './businesses.repository';
import { BusinessesService } from './businesses.service';

/**
 * ORDER MATTERS in `controllers`, and the array is written in that order on
 * purpose.
 *
 * `BusinessesController` declares `@Get(':id')`, and Express matches in
 * registration order, so `/businesses/public` is a shape that route matches.
 * With the panel controller registered first, `GET /businesses/public` is
 * swallowed by `:id`, never reaches this module's public controller, and comes
 * out of the default-deny AuthGuard as a 401. The public controller therefore
 * registers FIRST and claims `/businesses/public` and `/businesses/public/:id`
 * before the panel route is ever tried.
 *
 * The alternative — putting the two public handlers inside
 * `BusinessesController` above its `@Get(':id')`, which is what
 * `CategoriesController` does with `admin` — was rejected for two reasons: the
 * class carries `@ApiBearerAuth('bearer')`, so the two anonymous routes would be
 * published as authenticated ones; and it puts an anonymous read in the middle
 * of the panel API it is deliberately not part of.
 *
 * `ReviewsFeedsController` owns `businesses/public/{id}/reviews` and is immune to
 * the same hazard: it is three segments after `businesses`, and neither
 * `public/:id` nor `:id` can match it, in any registration order.
 */
@Module({
  imports: [AppConfigModule, UsersModule],
  controllers: [BusinessesPublicController, BusinessesController],
  providers: [BusinessesService, BusinessesPublicService, BusinessesRepository],
  // Exported for the review feeds, which gate the public business feed on the
  // same predicate this module's public reads use.
  exports: [BusinessesRepository],
})
export class BusinessesModule {}
