import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  MyPaymentMethodDto,
  MyPaymentMethodListDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentMethodsService } from './payment-methods.service';

/**
 * The caller's own saved cards, under `/payment-methods`.
 *
 * WHY A MODULE OF ITS OWN AND NOT A ROUTE UNDER `/me`: the closest precedent in
 * this API is `saved_addresses`, which is a separate module serving
 * `/addresses` — the same shape (an owner-scoped resource, not a settings row),
 * the same one-default rule, the same soft delete. The `/me` controller is for
 * the caller's SETTINGS (`/me/preferences`, `/me/consents`, `/me/devices`): rows
 * that hold one value each. Cards are a collection with a lifecycle, a one-default
 * rule the service has to decide rather than merely detect (the partial unique
 * index catches a second default only AFTER both writes landed) and an ADR that
 * bounds what may be written — that is a resource, and giving it a repository, a
 * mapper and its own controller is the same call `saved-addresses` already made.
 *
 * GUARDS: no `@Public()` and no `@Roles(...)`. The global `AuthGuard` is
 * default-deny, so a token is required on all three routes, and the absent role
 * list is what makes this a consumer surface (any authenticated role) instead of
 * an admin one.
 *
 * NOTHING HERE TAKES AN OWNER. Every handler reads `@CurrentUser()` and the only
 * parameter any of them accepts is a card id, so no route on this controller can
 * be pointed at another account — and that is enforced in the repository as well,
 * where the `user_id` predicate is inside every statement rather than in the
 * caller's head. The API connects as the table's owner and is therefore exempt
 * from this table's RLS policy, so that predicate is the access control.
 *
 * NO CREATE ROUTE, DELIBERATELY. See the scope note in
 * `PaymentMethodsService`: ADR-0007 keeps the add-a-card path behind the gateway
 * SDK, and a create here would need a `gateway_token` in a request body — the one
 * field this contract is not allowed to carry. The `@ApiTags` block below is the
 * whole surface: three verbs, and no `POST`.
 */
@ApiTags('Payment Methods')
@ApiBearerAuth('bearer')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @Get()
  @ApiOperation({
    summary: 'List my saved cards (default first, newest after)',
  })
  @ApiOkResponse({
    description:
      'My usable cards. Soft-deleted and inactive cards are filtered out, and no response ever carries the gateway token (PCI DSS).',
  })
  list(@CurrentUser() user: AuthUser): Promise<MyPaymentMethodListDto> {
    return this.paymentMethods.list(user);
  }

  /**
   * PUT, not PATCH, and not POST.
   *
   * PUT because the resource is the "default designation" of one card and PUT
   * replaces it: setting the same card default twice leaves the same state, so
   * the verb and the behaviour agree. PATCH would promise a partial edit of card
   * DETAILS, which is not an operation this surface has — changing a card means
   * re-tokenising it at the gateway, which is a create, and creates are out of
   * scope (ADR-0007). POST would promise a new resource, and none is made.
   *
   * The path is a sub-resource rather than a body flag for the same reason: there
   * is nothing in a body for the caller to get wrong, and there is no request
   * schema here at all — which is the strongest form of "the owner cannot come
   * from the request".
   */
  @Put(':id/default')
  @ApiOperation({
    summary: 'Make one of my cards the default (clears my previous one)',
  })
  @ApiOkResponse({ description: 'The card in its new state' })
  @ApiNotFoundResponse({
    description: 'No such usable card of mine',
  })
  setDefault(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MyPaymentMethodDto> {
    return this.paymentMethods.setDefault(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remove one of my cards (soft delete: active=false, deleted_at set)',
  })
  @ApiNoContentResponse({
    description: 'Card removed, or already removed — both are 204',
  })
  @ApiNotFoundResponse({
    description:
      'No such card of mine — or not mine at all, which reads the same',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.paymentMethods.remove(user, id);
  }
}
