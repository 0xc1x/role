import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  paginatedDataFromQuery,
  type AdminOrderListItemDto,
  type CreateOrderRequest,
  type ListAdminOrdersQuery,
  type ListBusinessOrdersQuery,
  type ListOrderEventsQuery,
  type ListOrdersQuery,
  type OrderEventsPaginatedData,
  type PaginatedData,
  shouldAccrueEarningsOnTransition,
  type UpdateOrderStatusRequest,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import { OffersRepository } from '../offers/offers.repository';
import { OrderEventMapper } from './order-event.mapper';
import {
  canActorTransition,
  isTransitionAllowed,
  shouldRestockOnTransition,
} from './order-status.machine';
import {
  OrderMapper,
  type OrderResponse,
  type OrderRow,
  type OrderViewer,
} from './orders.mapper';
import { round2 } from '../../common/utils/numeric';
import { OrdersRepository, type DbExecutor } from './orders.repository';
import {
  couponRejectionException,
  evaluateCoupon,
} from '../coupons/coupon-evaluator';

import { NotificationHandlers } from '../notifications/notification.handlers';

/** Espejo del charset de `generate_pickup_code` (sin caracteres ambiguos). */
const PICKUP_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Same code and same wording as the RPC's `IDEMPOTENCY_KEY_REUSED`: both
 * producers must report a reused key identically, or a client that moves
 * between them has to learn two different conflicts.
 */
const IDEMPOTENCY_KEY_REUSED =
  'IDEMPOTENCY_KEY_REUSED: La clave de idempotencia ya fue usada para otra reserva';

/**
 * The outcome of a reservation: the order, plus whether it is a replay of an
 * earlier request that carried the same key.
 *
 * `replayed` is the `replayed: true` of `reserve_offer`. Over there it rode
 * inside the RPC's jsonb; here it cannot ride in the body, because
 * `OrderResponse` is the response of eight endpoints and a flag belonging to
 * one of them would blur the contract of the other seven. The status carries
 * it instead: 201 means "this request created the order", 200 means "this order
 * already existed". The body is the SAME order either way, which is the whole
 * promise of the key.
 */
export type CreateOrderOutcome = {
  order: OrderResponse;
  replayed: boolean;
};

/**
 * `reserve_offer` normalizes the key with `nullif(btrim(...), '')` BEFORE it
 * hashes it and BEFORE it compares it against the stored row, so the value both
 * producers persist has to be the same one: otherwise the same logical key
 * becomes two keys, a mobile `" retry-1 "` and an API `"retry-1"` would lock
 * different advisory ids and would never recognize each other. A whitespace-only
 * key means "no key", not "the key ' '".
 */
function normalizeIdempotencyKey(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

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
  ): Promise<CreateOrderOutcome> {
    const idempotencyKey = normalizeIdempotencyKey(body.idempotency_key);

    const outcome = await this.ordersRepository.transaction(async (tx) => {
      await this.ordersRepository.setEventActor(tx, user.id);

      // Idempotency comes FIRST, before the offer is even read. That order is
      // the RPC's, and it is not cosmetic: a replay has to return the original
      // order even when the offer has since sold out or its pickup window has
      // closed, which is exactly the moment a retrying client shows up. Running
      // the checks first would answer OFFER_OUT_OF_STOCK to a client that
      // already holds a valid reservation.
      if (idempotencyKey) {
        const existing = await this.replayReservedOrder(
          tx,
          user,
          body,
          idempotencyKey,
        );
        if (existing) return { order: existing, replayed: true as const };
      }

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
      const businessAvailable =
        await this.offersRepository.isBusinessAvailableForOffers(
          tx,
          offer.business_id,
        );
      if (!businessAvailable) {
        throw new ConflictException(
          'OFFER_NOT_FOUND: Oferta no encontrada o inactiva',
        );
      }
      if (offer.stock <= 0) {
        throw new ConflictException('OFFER_OUT_OF_STOCK: Oferta agotada');
      }
      if (new Date() > offer.pickup_end) {
        throw new ConflictException('OFFER_EXPIRED: Ventana de pickup cerrada');
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
      let couponId: string | null = null;

      if (body.coupon_code) {
        // A supplied coupon is never silently ignored: if it cannot be applied
        // the reservation FAILS. The SQL RPC used to continue at full price on a
        // miss, which is what let the client see a discount in the UI and get
        // charged the full amount. Both sides now reject, with the same reasons,
        // before any stock or order row is touched.
        //
        // One divergence remains, and it is in the input, not the outcome: the
        // SQL receives a coupon ID (`p_coupon_id`) and this mirror receives a
        // code (`coupon_code`), so the SQL cannot distinguish `not_found` from a
        // caller that passed a stale ID for a coupon that was deleted. The
        // resolution order and the resulting `coupon_id` are otherwise identical.
        const coupon = await this.ordersRepository.findCouponByCodeForUpdate(
          tx,
          offer.business_id,
          body.coupon_code,
        );
        // The stages themselves live in `evaluateCoupon`, shared with
        // `POST /coupons/validate`: the checkout pre-check must not be able to
        // approve a code this reservation rejects. `now` is passed in rather
        // than read here so both callers judge expiry against one instant, and
        // `price` is the pre-discount amount, which is what stage 6 compares
        // `min_order_amount` against.
        //
        // Stage order is the contract (existence -> business scope -> is_active
        // -> expires_at -> max_uses -> min_order_amount -> apply) and it is
        // documented where the stages are. It runs before the stock decrement,
        // so a rejection consumes no stock, writes no order and mutates no
        // coupon.
        const evaluation = evaluateCoupon(coupon, {
          businessId: offer.business_id,
          amount: price,
          now: new Date(),
        });
        if (evaluation.status === 'rejected') {
          throw couponRejectionException(evaluation);
        }
        // Only the final price is persisted: `orders` has no discount column,
        // and `original_price - price` is the discount of the row.
        price = evaluation.finalPrice;
        couponId = evaluation.couponId;
        await this.ordersRepository.incrementCouponUsedCount(
          tx,
          evaluation.couponId,
        );
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
        // Written, not just checked: the key is what makes the NEXT attempt a
        // replay instead of a second reservation. The partial unique index
        // behind `orders_user_idempotency_key_unique` is the backstop, but the
        // advisory lock is what turns a concurrent loser into a replay rather
        // than a 23505.
        idempotency_key: idempotencyKey,
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

      return { order, replayed: false as const };
    });

    // A replay changed nothing — no order, no stock, no status transition — so
    // re-emitting would notify the user about an event that did not happen. The
    // RPC's replay path emits nothing either.
    if (!outcome.replayed) {
      // Fase 2.3: emisión desde flujo API (dormida hasta flag)
      this.emitOrderChange(outcome.order.id);
    }

    return {
      order: OrderMapper.toResponse(outcome.order, {
        isOrderOwner: true,
        isBusinessOwner: false,
        isAdmin: user.role === 'admin',
      }),
      replayed: outcome.replayed,
    };
  }

  /**
   * The `reserve_offer` idempotency block, in the SQL's order: take the
   * advisory lock, look the key up, then either replay the stored order or
   * report that the key already belongs to a different reservation.
   *
   * Returns null when the key is unused, which is the caller's signal to fall
   * through to the reservation flow. A key that is free on entry is NOT
   * reserved here: the insert at the end of the transaction is what claims it,
   * and it is the transaction that makes the claim atomic.
   *
   * Note the ordering of the two comparisons, which the SQL also uses: the
   * offer first, because a mismatching offer is already a conflict and must not
   * pay for a coupon resolution it does not need.
   */
  private async replayReservedOrder(
    tx: DbExecutor,
    user: AuthUser,
    body: CreateOrderRequest,
    key: string,
  ): Promise<OrderRow | null> {
    await this.ordersRepository.lockIdempotencyKey(tx, user.id, key);
    const existing = await this.ordersRepository.findByUserAndIdempotencyKey(
      tx,
      user.id,
      key,
    );
    if (!existing) return null;

    if (existing.offer_id !== body.offer_id) {
      throw new ConflictException(IDEMPOTENCY_KEY_REUSED);
    }
    if (!(await this.replayCouponMatches(tx, existing, body))) {
      throw new ConflictException(IDEMPOTENCY_KEY_REUSED);
    }

    return existing;
  }

  /**
   * Whether the request's coupon is the one the replayed order already used.
   *
   * The SQL compares coupon IDs because it RECEIVES one (`p_coupon_id`); this
   * mirror receives a `coupon_code` and resolves it later in the flow, so the
   * comparison has to happen on the resolved ID. That is the same comparison,
   * and not merely a similar one:
   *
   *  - The offer already matched, and the offer fixes the business.
   *  - `coupons` is UNIQUE (business_id, code), so within one business a code
   *    names at most one coupon and the code -> id mapping is a function, not a
   *    guess. Same code and same business means same coupon means same id.
   *  - The resolution is the flow's own `findCouponByCodeForUpdate`, so the
   *    replay can never disagree with what a fresh reservation would have done
   *    with the same input.
   *
   * The two cases where it is NOT provably equivalent, both reported rather
   * than papered over:
   *
   *  1. Platform coupons carry `business_id IS NULL`, and a btree unique index
   *    does not constrain NULLs, so two global coupons may share a code. The
   *    lookup breaks that tie by preference alone, and the ID it returns then
   *    depends on which row the plan visits first. There are no duplicate
   *    global codes in the live database today, and the risk is a false
   *    conflict, not a double reservation.
   *  2. Coupons are hard-deleted (`coupons.repository.remove` notes that
   *    `orders.coupon_id` has no FK and survives as history), so a code can stop
   *    resolving after the original reservation. The SQL, holding the id, would
   *    replay; here the unresolvable code cannot be proven to be the same
   *    coupon, so it reports the conflict. A wrong conflict is the safe
   *    direction: the alternative would be a second reservation.
   */
  private async replayCouponMatches(
    tx: DbExecutor,
    existing: OrderRow,
    body: CreateOrderRequest,
  ): Promise<boolean> {
    const code = body.coupon_code ?? null;

    // Both sides coupon-less is a match; exactly one side carrying a coupon is
    // the same mismatch the SQL reports as `coupon_id IS DISTINCT FROM`.
    if (existing.coupon_id === null || code === null) {
      return existing.coupon_id === null && code === null;
    }

    // The stored order's business is the offer's business — the offer matched
    // on the line above — so resolving against it needs no second offer read.
    const coupon = await this.ordersRepository.findCouponByCodeForUpdate(
      tx,
      existing.business_id,
      code,
    );
    return coupon !== null && coupon.id === existing.coupon_id;
  }

  /** Espejo de la RPC `cancel_order`. */
  async cancelOrder(user: AuthUser, id: string): Promise<OrderResponse> {
    const cancelled = await this.ordersRepository.transaction(async (tx) => {
      await this.ordersRepository.setEventActor(tx, user.id);
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
      await this.ordersRepository.setEventActor(tx, user.id);
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

  /**
   * Back office: listado transversal de órdenes. La autorización vive en el
   * guard (`@Roles('admin')` en el controller) — un solo punto de enforcement,
   * y por eso el panel no debe asumir que un `403` aquí es un bug.
   */
  async listForAdmin(
    query: ListAdminOrdersQuery,
  ): Promise<PaginatedData<AdminOrderListItemDto>> {
    const { items, total } = await this.ordersRepository.listForAdmin({
      status: query.status,
      businessId: query.business_id,
      // `stuck=false` no significa "todo lo sano": no hay un conjunto
      // complementario útil, así que se ignora en vez de invertir el filtro.
      stuckOnly: query.stuck === true,
      page: query.page,
      limit: query.limit,
    });

    // Un solo `new Date()` para toda la página: si se calculara por fila, dos
    // pedidos del mismo lote podrían caer en lados distintos del umbral.
    const now = new Date();
    return paginatedDataFromQuery(
      items.map((row) => OrderMapper.toAdminListItem(row, now)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(user: AuthUser, id: string): Promise<OrderResponse> {
    const { order, viewer } = await this.resolveAccessibleOrder(user, id);

    return OrderMapper.toResponse(order, viewer);
  }

  /**
   * The order timeline: its recorded status transitions, oldest first.
   *
   * Authorization is `resolveAccessibleOrder` — literally the same check
   * `GET /orders/{id}` runs, not a lookalike. The business panel needs its own
   * timeline for the orders it owns, and it reaches them through the same
   * owner/business/admin rule; a second, narrower check written here would be
   * the kind of divergence that surfaces later as a 403 nobody remembers
   * introducing.
   */
  async listEvents(
    user: AuthUser,
    id: string,
    query: ListOrderEventsQuery,
  ): Promise<OrderEventsPaginatedData> {
    await this.resolveAccessibleOrder(user, id);

    const { items, total } = await this.ordersRepository.listEvents(id, {
      page: query.page,
      limit: query.limit,
    });

    return paginatedDataFromQuery(
      items.map((row) => OrderEventMapper.toTimelineEvent(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * The one place that decides who may read an order, shared by every order
   * read (`GET /orders/{id}` and the timeline): the order's owner, the owner of
   * the business it belongs to, or an admin. Anything else is a 403, and a
   * non-existent order stays a 404 so the two cannot be told apart by probing.
   */
  private async resolveAccessibleOrder(
    user: AuthUser,
    id: string,
  ): Promise<{ order: OrderRow; viewer: OrderViewer }> {
    const row = await this.ordersRepository.findByIdWithBusinessOwner(id);
    if (!row) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    const isOrderOwner = row.order.user_id === user.id;
    const isBusinessOwner = row.business_owner_id === user.id;
    if (!isOrderOwner && !isBusinessOwner && user.role !== 'admin') {
      throw new ForbiddenException('You cannot access this order');
    }

    return {
      order: row.order,
      viewer: {
        isOrderOwner,
        isBusinessOwner,
        isAdmin: user.role === 'admin',
      },
    };
  }

  async updateStatus(
    user: AuthUser,
    id: string,
    body: UpdateOrderStatusRequest,
  ): Promise<OrderResponse> {
    const updated = await this.ordersRepository.transaction(async (tx) => {
      await this.ordersRepository.setEventActor(tx, user.id);
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

      if (shouldAccrueEarningsOnTransition(next)) {
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
    if (!this.config.get('ENABLE_API_MIRROR_NOTIFICATIONS', { infer: true }))
      return;
    // Fire-and-forget: no bloquea la respuesta HTTP, BullMQ hace reintentos
    this.notificationHandlers?.onOrderStatusChanged(orderId).catch((err) => {
      this.logger.warn({
        event: 'order_status_notification_failed',
        ...safeErrorFields(err),
      });
    });
  }
}
