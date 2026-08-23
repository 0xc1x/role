import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  paginatedDataFromQuery,
  type CreateOrderRequest,
  type ListBusinessOrdersQuery,
  type ListOrdersQuery,
  type PaginatedData,
  type UpdateOrderStatusRequest,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { OffersRepository } from '../offers/offers.repository';
import {
  canActorTransition,
  isTransitionAllowed,
  shouldRestockOnTransition,
  type OrderEventSource,
} from './order-status.machine';
import { OrderMapper, type OrderResponse } from './orders.mapper';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly offersRepository: OffersRepository,
  ) {}

  async create(
    user: AuthUser,
    body: CreateOrderRequest,
  ): Promise<OrderResponse> {
    // coupon_code reserved for later wave
    void body.coupon_code;

    const created = await this.ordersRepository.transaction(async (tx) => {
      const existing = await this.ordersRepository.findActiveByUserAndOffer(
        tx,
        user.id,
        body.offer_id,
      );
      if (existing) {
        throw new ConflictException(
          'You already have an active order for this offer',
        );
      }

      const offer = await this.offersRepository.findByIdForUpdate(
        tx,
        body.offer_id,
      );
      if (!offer) {
        throw new NotFoundException(`Offer ${body.offer_id} not found`);
      }

      const now = new Date();
      if (!offer.is_active) {
        throw new ConflictException('Offer is not active');
      }
      if (offer.stock < 1) {
        throw new ConflictException('Offer is out of stock');
      }
      if (offer.pickup_end <= now) {
        throw new ConflictException('Offer pickup window has ended');
      }

      const decremented = await this.offersRepository.decrementStock(
        tx,
        offer.id,
        1,
      );
      if (!decremented) {
        throw new ConflictException('Offer is out of stock');
      }

      const orderNumber = this.generateOrderNumber();
      const pickupCode = this.generatePickupCode();

      const order = await this.ordersRepository.insertOrder(tx, {
        user_id: user.id,
        offer_id: offer.id,
        business_id: offer.business_id,
        order_number: orderNumber,
        status: 'pending',
        price: offer.discounted_price,
        original_price: offer.original_price,
        pickup_code: pickupCode,
        pickup_time: offer.pickup_start,
        coupon_id: null,
      });

      await this.ordersRepository.insertEvent(tx, {
        order_id: order.id,
        status: 'pending',
        previous_status: null,
        changed_by: user.id,
        reason: 'Order created',
        metadata: { source: 'api' satisfies OrderEventSource },
      });

      return order;
    });

    return OrderMapper.toResponse(created, {
      isOrderOwner: true,
      isBusinessOwner: false,
      isAdmin: user.role === 'admin',
    });
  }

  async listMine(
    user: AuthUser,
    query: ListOrdersQuery,
  ): Promise<PaginatedData<OrderResponse>> {
    const { items, total } = await this.ordersRepository.listForUser(user.id, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return paginatedDataFromQuery(
      items.map((row) =>
        OrderMapper.toResponse(row, {
          isOrderOwner: true,
          isBusinessOwner: false,
          isAdmin: user.role === 'admin',
        }),
      ),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async listForBusiness(
    user: AuthUser,
    query: ListBusinessOrdersQuery,
  ): Promise<PaginatedData<OrderResponse>> {
    let businessId = query.business_id;

    if (!businessId) {
      const owned = await this.offersRepository.findBusinessIdsOwnedBy(user.id);
      if (owned.length === 0 && user.role !== 'admin') {
        throw new ForbiddenException('You do not own any business');
      }
      if (owned.length === 0) {
        return paginatedDataFromQuery(
          [],
          { page: query.page, limit: query.limit },
          0,
        );
      }
      if (owned.length > 1 && user.role !== 'admin') {
        throw new UnprocessableEntityException(
          'business_id is required when you own multiple businesses',
        );
      }
      businessId = owned[0];
    } else if (user.role !== 'admin') {
      const isOwner = await this.ordersRepository.isBusinessOwner(
        businessId,
        user.id,
      );
      if (!isOwner) {
        throw new ForbiddenException('You do not own this business');
      }
    }

    const { items, total } = await this.ordersRepository.listForBusiness(
      businessId!,
      {
        status: query.status,
        page: query.page,
        limit: query.limit,
      },
    );

    return paginatedDataFromQuery(
      items.map((row) =>
        OrderMapper.toResponse(row, {
          isOrderOwner: row.user_id === user.id,
          isBusinessOwner: true,
          isAdmin: user.role === 'admin',
        }),
      ),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(user: AuthUser, id: string): Promise<OrderResponse> {
    const row = await this.ordersRepository.findByIdWithBusinessOwner(id);
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const isOwner = row.order.user_id === user.id;
    const isBusinessOwner = row.business_owner_id === user.id;
    if (!isOwner && !isBusinessOwner && user.role !== 'admin') {
      throw new ForbiddenException('You cannot access this order');
    }

    return OrderMapper.toResponse(row.order, {
      isOrderOwner: isOwner,
      isBusinessOwner,
      isAdmin: user.role === 'admin',
    });
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    body: UpdateOrderStatusRequest,
  ): Promise<OrderResponse> {
    const updated = await this.ordersRepository.transaction(async (tx) => {
      const locked = await this.ordersRepository.findByIdForUpdate(tx, id);
      if (!locked) {
        throw new NotFoundException(`Order ${id} not found`);
      }

      const current = locked.order.status;
      const next = body.status;

      if (current === next) {
        return locked.order;
      }

      if (!isTransitionAllowed(current, next)) {
        throw new UnprocessableEntityException(
          `Cannot transition order from '${current}' to '${next}'`,
        );
      }

      const isOrderOwner = locked.order.user_id === user.id;
      const isBusinessOwner = locked.business_owner_id === user.id;

      if (
        !canActorTransition(user.role, current, next, {
          isOrderOwner,
          isBusinessOwner,
        })
      ) {
        throw new ForbiddenException(
          `Role '${user.role}' cannot transition order to '${next}'`,
        );
      }

      const order = await this.ordersRepository.updateStatus(
        tx,
        id,
        next,
        current,
      );
      if (!order) {
        throw new ConflictException(
          'Order status changed concurrently; retry the request',
        );
      }

      if (shouldRestockOnTransition(current, next)) {
        await this.offersRepository.incrementStock(
          tx,
          locked.order.offer_id,
          1,
        );
      }

      const source: OrderEventSource = user.role === 'admin' ? 'admin' : 'api';

      await this.ordersRepository.insertEvent(tx, {
        order_id: id,
        status: next,
        previous_status: current,
        changed_by: user.id,
        reason: body.reason ?? null,
        metadata: { source },
      });

      return order;
    });

    const isOrderOwner = updated.user_id === user.id;
    const isBusinessOwner = await this.ordersRepository.isBusinessOwner(
      updated.business_id,
      user.id,
    );

    return OrderMapper.toResponse(updated, {
      isOrderOwner,
      isBusinessOwner,
      isAdmin: user.role === 'admin',
    });
  }

  /**
   * System job: expire pending/ready_for_pickup orders whose offer pickup_end has passed.
   * Restores stock in the same transaction per order.
   */
  async expireStaleOrders(): Promise<{ expired: number }> {
    const now = new Date();
    const candidates =
      await this.offersRepository.findOrderCandidatesToExpire(now);

    let expired = 0;

    for (const candidate of candidates) {
      await this.ordersRepository.transaction(async (tx) => {
        const locked = await this.ordersRepository.findByIdForUpdate(
          tx,
          candidate.orderId,
        );
        if (!locked) return;

        const current = locked.order.status;
        if (current !== 'pending' && current !== 'ready_for_pickup') {
          return;
        }
        if (!isTransitionAllowed(current, 'expired')) {
          return;
        }

        const order = await this.ordersRepository.updateStatus(
          tx,
          candidate.orderId,
          'expired',
          current,
        );
        if (!order) return;

        if (shouldRestockOnTransition(current, 'expired')) {
          await this.offersRepository.incrementStock(
            tx,
            locked.order.offer_id,
            1,
          );
        }

        await this.ordersRepository.insertEvent(tx, {
          order_id: candidate.orderId,
          status: 'expired',
          previous_status: current,
          changed_by: null,
          reason: 'Pickup window ended',
          metadata: { source: 'cron' satisfies OrderEventSource },
        });

        expired += 1;
      });
    }

    return { expired };
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const y = date.getUTCFullYear().toString().slice(-2);
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const rand = randomBytes(3).toString('hex').toUpperCase();
    return `RLE-${y}${m}${d}-${rand}`;
  }

  private generatePickupCode(): string {
    // 6-char alphanumeric, easy to read at counter
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
