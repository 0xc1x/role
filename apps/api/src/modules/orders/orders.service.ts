import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  paginatedDataFromQuery,
  type CreateOrderRequest,
  type ListBusinessOrdersQuery,
  type ListOrdersQuery,
  type PaginatedData,
  type UpdateOrderStatusRequest,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import type { Env } from '../../config/env.schema';
import { OffersRepository } from '../offers/offers.repository';
import {
  canActorTransition,
  isTransitionAllowed,
  shouldRestockOnTransition,
  type OrderEventSource,
} from './order-status.machine';
import { OrderMapper, type OrderResponse } from './orders.mapper';
import {
  OrdersRepository,
  type DbExecutor,
} from './orders.repository';

import { NotificationHandlers } from '../notifications/notification.handlers';

/** Espejo del charset de `generate_pickup_code` (sin caracteres ambiguos). */
const PICKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const round2 = (n: number): number => Math.round(n * 100) / 100;

@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly offersRepository: OffersRepository,
    private readonly config: ConfigService<Env, true>,
    @Optional()
    private readonly notificationHandlers?: NotificationHandlers,
  ) {}

  async create(
    user: AuthUser,
    body: CreateOrderRequest,
  ): Promise<OrderResponse> {
    const created = await this.ordersRepository.transaction(async (tx) => {
      // Espejo de `reserve_offer`: los códigos de error son los mismos que
      // devuelve el RPC para que los tests de equivalencia sean directos.
      const offer = await this.offersRepository.findByIdForUpdate(
        tx,
        body.offer_id,
      );
      if (!offer || !offer.is_active) {
        throw new ConflictException(
          'OFFER_NOT_FOUND: Oferta no encontrada o inactiva',
        );
      }
      if (offer.stock <= 0) {
        throw new ConflictException('OFFER_OUT_OF_STOCK: Oferta agotada');
      }
      if (new Date() > offer.pickup_end) {
        throw new ConflictException(
          'OFFER_EXPIRED: Ventana de pickup cerrada',
        );
      }

      const existing = await this.ordersRepository.findActiveByUserAndOffer(
        tx,
        user.id,
        body.offer_id,
      );
      if (existing) {
        throw new ConflictException(
          'DUPLICATE_RESERVATION: Ya tienes una reserva activa para esta oferta',
        );
      }

      const commissionRate =
        Number(
          await this.ordersRepository.findCommissionRate(tx, offer.business_id),
        ) || 0;

      let price = Number(offer.discounted_price);
      const originalPrice = Number(offer.original_price);
      let discount = 0;
      let couponId: string | null = null;

      if (body.coupon_code) {
        const coupon = await this.ordersRepository.findCouponByCodeForUpdate(
          tx,
          offer.business_id,
          body.coupon_code,
        );
        if (coupon) {
          if (
            coupon.max_uses !== null &&
            coupon.used_count >= coupon.max_uses
          ) {
            throw new ConflictException('COUPON_EXHAUSTED: Cupon agotado');
          }
          if (Number(coupon.min_order_amount ?? 0) > price) {
            throw new ConflictException(
              'COUPON_MIN_NOT_MET: Monto minimo no alcanzado para el cupon',
            );
          }
          discount =
            coupon.type === 'percentage'
              ? Math.min((price * Number(coupon.value)) / 100, price)
              : Math.min(Number(coupon.value), price);
          price = Math.max(price - discount, 0);
          couponId = coupon.id;
          await this.ordersRepository.incrementCouponUsedCount(tx, coupon.id);
        }
        // Sin coincidencia el SQL continúa sin descuento — espejo idéntico.
      }

      const decremented = await this.offersRepository.decrementStock(
        tx,
        offer.id,
        1,
      );
      if (!decremented) {
        throw new ConflictException(
          'OFFER_OUT_OF_STOCK: Oferta agotada (condicion de carrera)',
        );
      }

      const platformFee = round2(price * commissionRate);

      const orderNumber = await this.ordersRepository.nextOrderNumber(tx);
      const pickupCode = this.generatePickupCode();

      const order = await this.ordersRepository.insertOrder(tx, {
        user_id: user.id,
        offer_id: offer.id,
        business_id: offer.business_id,
        order_number: orderNumber,
        status: 'pending',
        price: String(price),
        original_price: String(originalPrice),
        pickup_code: pickupCode,
        pickup_time: offer.pickup_start,
        coupon_id: couponId,
        commission_rate: String(commissionRate),
        platform_fee: String(platformFee),
        net_amount: String(round2(price - platformFee)),
      });

      await this.ordersRepository.insertEvent(tx, {
        order_id: order.id,
        status: 'pending',
        previous_status: null,
        changed_by: user.id,
        reason: 'Reserva creada',
        metadata: { source: 'api' satisfies OrderEventSource },
      });

      return order;
    });

    // Fase 2.3: emisión desde flujo API (dormida hasta flag)
    this.emitOrderChange(created.id);

    return OrderMapper.toResponse(created, {
      isOrderOwner: true,
      isBusinessOwner: false,
      isAdmin: user.role === 'admin',
    });
  }

  /** Espejo de la RPC `cancel_order`. */
  async cancelOrder(user: AuthUser, id: string): Promise<OrderResponse> {
    const cancelled = await this.ordersRepository.transaction(async (tx) => {
      const locked = await this.ordersRepository.findByIdForUpdate(tx, id);
      if (!locked) {
        throw new NotFoundException('ORDER_NOT_FOUND: Pedido no encontrado');
      }
      if (locked.order.user_id !== user.id) {
        throw new ForbiddenException(
          'NOT_ORDER_OWNER: No eres el dueño de este pedido',
        );
      }
      const current = locked.order.status;
      if (
        current !== 'pending' &&
        current !== 'confirmed' &&
        current !== 'ready_for_pickup'
      ) {
        throw new UnprocessableEntityException(
          'CANNOT_CANCEL: Este pedido no se puede cancelar',
        );
      }

      const order = await this.ordersRepository.updateStatus(
        tx,
        id,
        'cancelled',
        current,
      );

      await this.offersRepository.incrementStock(tx, locked.order.offer_id, 1);

      await this.ordersRepository.insertEvent(tx, {
        order_id: id,
        status: 'cancelled',
        previous_status: current,
        changed_by: user.id,
        reason: 'Cancelado por el usuario',
        metadata: { source: 'api' satisfies OrderEventSource },
      });

      return order!;
    });

    this.emitOrderChange(id);

    return OrderMapper.toResponse(cancelled, {
      isOrderOwner: true,
      isBusinessOwner: false,
      isAdmin: user.role === 'admin',
    });
  }

  /** Espejo de la RPC `validate_pickup_code`. */
  async validatePickupCode(
    user: AuthUser,
    id: string,
    pickupCode: string,
  ): Promise<OrderResponse> {
    const completed = await this.ordersRepository.transaction(async (tx) => {
      // El SQL valida ownership antes que existencia (join contra businesses).
      const locked = await this.ordersRepository.findByIdForUpdate(tx, id);
      if (!locked || locked.business_owner_id !== user.id) {
        throw new ForbiddenException(
          'UNAUTHORIZED: No tienes permiso para validar este pedido',
        );
      }
      if (locked.order.pickup_code !== pickupCode) {
        throw new ConflictException(
          'INVALID_CODE: Código de recogida inválido',
        );
      }
      if (locked.order.status !== 'ready_for_pickup') {
        throw new ConflictException(
          'INVALID_STATUS: El pedido no está listo para recoger',
        );
      }

      const order = await this.ordersRepository.updateStatus(
        tx,
        id,
        'completed',
        'ready_for_pickup',
      );

      await this.accrueEarningsIfNeeded(tx, locked.order);

      await this.ordersRepository.insertEvent(tx, {
        order_id: id,
        status: 'completed',
        previous_status: 'ready_for_pickup',
        changed_by: user.id,
        reason: null,
        metadata: {
          method: 'pickup_code',
          source: 'api' satisfies OrderEventSource,
        },
      });

      return order!;
    });

    this.emitOrderChange(id);

    return OrderMapper.toResponse(completed, {
      isOrderOwner: false,
      isBusinessOwner: true,
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

      if (next === 'completed') {
        await this.accrueEarningsIfNeeded(tx, locked.order, current);
      }

      return order;
    });

    this.emitOrderChange(id);

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

  /**
   * Espejo dormido del trigger `accrue_order_earnings`: al pasar a completed,
   * suma net_amount al balance del negocio. Detrás de flag porque el trigger
   * SQL sigue activo en Supabase (evita doble acumulación hasta el cutover).
   */
  private async accrueEarningsIfNeeded(
    tx: DbExecutor,
    order: { business_id: string; net_amount: string },
    previousStatus?: string,
  ): Promise<void> {
    const mirrorEnabled = this.config.get('ENABLE_API_MIRROR_ORDERS', {
      infer: true,
    });
    if (!mirrorEnabled) return;
    if (previousStatus === 'completed') return;
    await this.ordersRepository.accrueBusinessBalance(
      tx,
      order.business_id,
      order.net_amount,
    );
  }

  private generatePickupCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += PICKUP_CODE_CHARS[randomInt(PICKUP_CODE_CHARS.length)];
    }
    return code;
  }

  private emitOrderChange(orderId: string): void {
    if (!this.config.get('ENABLE_API_MIRROR_NOTIFICATIONS', { infer: true })) return;
    // Fire-and-forget: no bloquea la respuesta HTTP, BullMQ hace reintentos
    this.notificationHandlers?.onOrderStatusChanged(orderId).catch(() => {});
  }
}
