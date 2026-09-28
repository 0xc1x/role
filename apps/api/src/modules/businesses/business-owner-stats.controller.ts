import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  BusinessSalesStatsQuerySchema,
  type BusinessCompletedOrdersDto,
  type BusinessSalesStatsQuery,
  type BusinessSalesStatsResponseDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BusinessOwnerStatsService } from './business-owner-stats.service';

/**
 * THE OWNER'S OWN NUMBERS, ON THE BUSINESS SURFACE.
 *
 * A SEPARATE CONTROLLER IN THE SAME MODULE, and the reason is the one the
 * `stats` module fails: these two routes are the only ones on this module whose
 * access depends on a PATH SEGMENT, and they are the only ones that report
 * money. Keeping them off `BusinessesController` means the panel's CRUD surface
 * does not gain a revenue route in among the name and slug writes, and it gives
 * this file one job — which is what lets the spec below pin the security
 * properties of exactly these two handlers.
 *
 * ROUTE ORDERING IS NOT A CONCERN HERE, and it is worth saying why rather than
 * leaving it to the module comment's warning about the other two controllers.
 * Every path this controller serves is FOUR segments
 * (`businesses/:businessId/stats/…`) and ends in a literal. The other two
 * controllers on this prefix are two segments (`businesses/:id`) and three with
 * a literal third segment (`businesses/public/:id`,
 * `businesses/:id/email-sends`, `businesses/:businessId/locations/:locationId`),
 * so no request can reach this controller through one of them and none of them
 * can swallow one of these. `GET /businesses/public/stats` — the only string
 * that is close to a collision — is claimed by the public controller, which
 * registers first, and is not a resource.
 *
 * NO `@Body` AND NO `@Public()`. The period is a validated query and the owner
 * is a path segment resolved against `business_ownership` in the service; there
 * is no request body here, so there is nothing a caller could put a
 * `business_id` or a `user_id` into. The absence is asserted by arity in
 * `business-owner-stats.controller.spec.ts`, the same way
 * `payment-methods.controller.spec.ts` does it.
 *
 * `@Roles('business', 'admin')` is the coarse pre-filter every per-business route
 * in this module carries. It is NOT the authorisation: the ownership check is
 * `BusinessesService.assertCanViewBusiness`, and a role check alone would be
 * satisfied by any account in the platform.
 */
@ApiTags('Business Stats (owner)')
@ApiBearerAuth('bearer')
@Controller('businesses/:businessId/stats')
export class BusinessOwnerStatsController {
  constructor(private readonly ownerStats: BusinessOwnerStatsService) {}

  @Get('completed-orders')
  @Roles('business', 'admin')
  @ApiOperation({
    summary:
      'Completed-order count for a business I own (mirror of business_completed_orders_count)',
  })
  @ApiOkResponse({ description: 'The completed-order aggregate' })
  getCompletedOrders(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ): Promise<BusinessCompletedOrdersDto> {
    return this.ownerStats.getCompletedOrders(user, businessId);
  }

  /**
   * THE PERIOD IS REQUIRED. `BusinessSalesStatsQuerySchema` is a required,
   * ordered pair of instants carrying explicit offsets, and there is no default
   * on either end: the SQL function has no "all time" branch, so any default
   * would be a window this API invented rather than one the caller asked for.
   *
   * A query parameter rather than a path segment, because an instant is not a
   * path-safe token (`2026-09-01T00:00:00.000Z` carries colons) and because the
   * two ends are a PAIR — one path segment would have to be a compound value the
   * router has to parse.
   */
  @Get('sales')
  @Roles('business', 'admin')
  @ApiOperation({
    summary:
      'Sales for a window I own: count, revenue, top 5 products and a UTC daily series. `from` and `to` are required and both inclusive.',
  })
  @ApiOkResponse({
    description: 'The applied window, next to the numbers computed from it',
  })
  getSalesStats(
    @CurrentUser() user: AuthUser,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query(new ZodValidationPipe(BusinessSalesStatsQuerySchema))
    query: BusinessSalesStatsQuery,
  ): Promise<BusinessSalesStatsResponseDto> {
    return this.ownerStats.getSalesStats(user, businessId, query);
  }
}
