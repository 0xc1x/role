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
} from '@0xc1x/role-commons';
import type {
  CouponDto,
  CouponPaginatedData,
  CreateCouponDto,
  ListCouponsQuery,
  UpdateCouponDto,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CouponsService } from './coupons.service';

/**
 * A diferencia de categories, aquí no hay rutas @Public(): el listado expone
 * códigos de descuento y solo el admin debe poder enumerarlos. El checkout
 * consumidor resuelve cupones vía Supabase directo, no por esta API.
 */
@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

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
