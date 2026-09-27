import { describe, expect, it } from 'bun:test';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { BusinessesPublicController } from './businesses-public.controller';
import { BusinessesController } from './businesses.controller';
import { BusinessesModule } from './businesses.module';

/**
 * `BusinessesModule.controllers` is ordered, and the order is load-bearing.
 *
 * `BusinessesController` declares `@Get(':id')`, which matches the path
 * `/businesses/public`. Nest registers routes in the order the controllers are
 * listed, so with the panel controller first, `GET /api/v1/businesses/public` is
 * claimed by `:id` and the anonymous catalog answers 401 from the default-deny
 * AuthGuard. That is not hypothetical: it is what the e2e suite caught the first
 * time this module was wired.
 *
 * The e2e case is the real guard. This one exists so the array cannot be
 * "tidied" into alphabetical order in a review that cannot see the router.
 */
describe('BusinessesModule route order', () => {
  it('registers the public controller before the panel one', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      BusinessesModule,
    ) as unknown[] | undefined;

    expect(controllers?.indexOf(BusinessesPublicController)).toBe(0);
    expect(controllers?.indexOf(BusinessesController)).toBe(1);
  });
});
