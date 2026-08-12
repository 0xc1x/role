import {
  Body,
  Controller,
  Get,
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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { OrdersService } from './orders.service';
import {
  CreateOrderRequestSchema,
  ListBusinessOrdersQuerySchema,
  ListOrdersQuerySchema,
  UpdateOrderStatusSchema,
} from '@0xc1x/role-commons';
import type {
  CreateOrderRequest,
  ListBusinessOrdersQuery,
  ListOrdersQuery,
  UpdateOrderStatusRequest,
} from '@0xc1x/role-commons';

@ApiTags('Orders')
@ApiBearerAuth('bearer')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Throttle({ orders: { limit: 10, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: 'Reserve / create an order for an offer' })
  @ApiCreatedResponse({ description: 'Order created' })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateOrderRequestSchema))
    body: CreateOrderRequest,
  ) {
    return this.ordersService.create(user, body);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders (consumer)' })
  @ApiOkResponse({ description: 'Paginated orders' })
  listMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListOrdersQuerySchema))
    query: ListOrdersQuery,
  ) {
    return this.ordersService.listMine(user, query);
  }

  @Get('business')
  @Roles('business', 'admin')
  @ApiOperation({ summary: 'List orders for a business I own' })
  @ApiOkResponse({ description: 'Paginated business orders' })
  listForBusiness(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ListBusinessOrdersQuerySchema))
    query: ListBusinessOrdersQuery,
  ) {
    return this.ordersService.listForBusiness(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by id' })
  @ApiOkResponse({ description: 'Order detail' })
  getById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.getById(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Transition order status' })
  @ApiOkResponse({ description: 'Updated order' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOrderStatusSchema))
    body: UpdateOrderStatusRequest,
  ) {
    return this.ordersService.updateStatus(user, id, body);
  }
}
