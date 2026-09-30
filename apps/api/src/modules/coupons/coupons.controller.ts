import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateCouponSchema,
  ListCouponsQuerySchema,
  UpdateCouponSchema,
  ValidateCouponRequestSchema,
} from '@0xc1x/role-commons';
import type {
  CouponDto,
  CouponPaginatedData,
  CouponValidation,
  CreateCouponDto,
  ListCouponsQuery,
  UpdateCouponDto,
  ValidateCouponRequest,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CouponsService } from './coupons.service';

/**
 * The routes below `validate` are admin-only because they ENUMERATE discount
 * codes: the list, the detail, the writes. Enumeration is the thing to keep away
 * from a consumer, because a code in hand is a discount in hand and a
 * brute-forceable list of every active promotion is a revenue line, not a
 * feature.
 *
 * `validate` is the one deliberate exception, and the reasoning is narrow on
 * purpose. It is AUTHENTICATED but not role-restricted — no `@Public()`, no
 * `@Roles(...)` — because mobile validates during checkout, where a session
 * already exists; a role here would mean the consumer app is the one client
 * that cannot use its own coupon screen. `@Public()` would be worse: it hands
 * an unauthenticated caller exactly the enumeration the other routes withhold,
 * one guessed code per request, at a far lower bar than the admin list.
 */
@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  /**
   * Would `POST /orders` accept this coupon? The pre-check, not a second
   * authority: it applies the SAME rules through the same evaluator the
   * reservation uses, so it can never approve a code the reservation rejects.
   *
   * ADVISORY, and the limitation is documented here so nobody "fixes" it: this
   * route takes NO lock and does NOT consume `max_uses`. Two users can both pass
   * it and one of them will still get `COUPON_EXHAUSTED` at reservation. That is
   * correct — the reservation is the only writer of `used_count` — and
   * incrementing it here would exhaust coupons on lookups the user then
   * abandons.
   *
   * A rejection is 200 with `applies: false` and the code the reservation would
   * raise, so the client renders both answers with one branch.
   */
  @Post('validate')
  // Nest answers a POST with 201 by default. Nothing is created here, and a
  // client that has to tell "the code applies" (200) from "something was made"
  // (201) is being asked to know about a distinction this route does not have.
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Pre-check a discount code for a checkout (advisory)',
  })
  @ApiOkResponse({
    description: 'Whether the code applies, and the final price',
  })
  validate(
    @Body(new ZodValidationPipe(ValidateCouponRequestSchema))
    body: ValidateCouponRequest,
  ): Promise<CouponValidation> {
    return this.couponsService.validate(body);
  }

  @Get()
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List coupons (admin)' })
  @ApiOkResponse({ description: 'Paginated coupon list' })
  list(
    @Query(new ZodValidationPipe(ListCouponsQuerySchema))
    query: ListCouponsQuery,
  ): Promise<CouponPaginatedData> {
    return this.couponsService.list(query);
  }

  @Get(':id')
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get coupon by id (admin)' })
  @ApiOkResponse({ description: 'Coupon detail' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<CouponDto> {
    return this.couponsService.getById(id);
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a coupon (admin)' })
  @ApiCreatedResponse({ description: 'Coupon created' })
  create(
    @Body(new ZodValidationPipe(CreateCouponSchema))
    body: CreateCouponDto,
  ): Promise<CouponDto> {
    return this.couponsService.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update a coupon (admin)' })
  @ApiOkResponse({ description: 'Coupon updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCouponSchema))
    body: UpdateCouponDto,
  ): Promise<CouponDto> {
    return this.couponsService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete a coupon (admin)' })
  @ApiOkResponse({ description: 'Coupon deleted' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<CouponDto> {
    return this.couponsService.remove(id);
  }
}
