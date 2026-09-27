import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  ListAdminOrdersQuerySchema,
  ListBusinessOrdersQuerySchema,
  ListOrderEventsQuerySchema,
  ListOrdersQuerySchema,
  UpdateOrderStatusSchema,
  ValidatePickupCodeSchema,
} from '@0xc1x/role-commons';
import type {
  CreateOrderRequest,
  ListAdminOrdersQuery,
  ListBusinessOrdersQuery,
  ListOrderEventsQuery,
  ListOrdersQuery,
  UpdateOrderStatusRequest,
  ValidatePickupCodeRequest,
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
  @ApiOkResponse({
    description:
      'The order an earlier request with the same idempotency_key already ' +
      'created. Same body as the 201: this request created nothing.',
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateOrderRequestSchema))
    body: CreateOrderRequest,
    // `passthrough` keeps Nest's serialization: only the status is set here.
    @Res({ passthrough: true }) res: Response,
  ) {
    const { order, replayed } = await this.ordersService.create(user, body);
    // 201 is "this request created the order", 200 is "this order already
    // existed" — the `replayed: true` of the RPC, in HTTP's own vocabulary. The
    // body is the original order either way, so a client that retries over a
    // flaky connection cannot tell the two apart by content, only by status,
    // and the reservation it already made is never duplicated.
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return order;
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

  // Antes que `:id` — igual que `business`. Un segmento literal declarado
  // después del comodín nunca se enrutaría.
  // Sin `@ApiBearerAuth` propio: la clase ya lo declara y duplicarlo produce un
  // `security` con dos entradas iguales en el openapi exportado.
  @Get('admin')
  @Roles('admin')
  @ApiOperation({ summary: 'List every order across businesses (admin)' })
  @ApiOkResponse({ description: 'Paginated orders with business and offer' })
  listForAdmin(
    @Query(new ZodValidationPipe(ListAdminOrdersQuerySchema))
    query: ListAdminOrdersQuery,
  ) {
    return this.ordersService.listForAdmin(query);
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

  // No `@Roles(...)`: authorization is the same owner/business/admin check
  // `GET /orders/:id` runs, enforced in the service, so the business panel can
  // read the timeline of the orders it owns without a role declaration here.
  @Get(':id/events')
  @ApiOperation({ summary: 'Get the status transitions of an order' })
  @ApiOkResponse({ description: 'Paginated order timeline, oldest first' })
  listEvents(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListOrderEventsQuerySchema))
    query: ListOrderEventsQuery,
  ) {
    return this.ordersService.listEvents(user, id, query);
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

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel my order (espejo de la RPC cancel_order)' })
  @ApiOkResponse({ description: 'Cancelled order' })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.cancelOrder(user, id);
  }

  @Post(':id/validate-pickup')
  @Roles('business')
  @ApiOperation({
    summary: 'Validate pickup code (espejo de la RPC validate_pickup_code)',
  })
  @ApiOkResponse({ description: 'Completed order' })
  validatePickup(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ValidatePickupCodeSchema))
    body: ValidatePickupCodeRequest,
  ) {
    return this.ordersService.validatePickupCode(user, id, body.pickup_code);
  }
}
