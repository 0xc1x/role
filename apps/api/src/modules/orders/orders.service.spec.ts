import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OffersRepository } from '../offers/offers.repository';
import type { OrderStatus } from '@0xc1x/role-commons';

const mockAuthUser = {
  id: 'user-1',
  email: 'test@test.com',
  role: 'user' as const,
};

const mockBusinessUser = {
  id: 'business-1',
  email: 'biz@test.com',
  role: 'business' as const,
};

const mockAdminUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  role: 'admin' as const,
};

const makeOrderRow = (overrides: Record<string, any> = {}) => ({
  id: 'order-1',
  user_id: 'user-1',
  offer_id: 'offer-1',
  business_id: 'business-1',
  order_number: 'RLE-240101-ABC123',
  status: 'pending' as OrderStatus,
  price: '9.99',
  original_price: '19.99',
  pickup_code: 'ABC123',
  pickup_time: new Date('2025-01-01T10:00:00Z'),
  coupon_id: null,
  commission_rate: '0.1000',
  platform_fee: '1.00',
  net_amount: '8.99',
  payout_id: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

const makeOfferRow = (overrides: Record<string, any> = {}) => ({
  id: 'offer-1',
  business_id: 'business-1',
  business_location_id: 'location-1',
  title: 'Test Offer',
  description: null,
  image: null,
  original_price: '19.99',
  discounted_price: '9.99',
  discount_percentage: '50.00',
  stock: 10,
  initial_stock: 10,
  pickup_start: new Date('2025-01-01T10:00:00Z'),
  pickup_end: new Date(Date.now() + 86400000), // tomorrow
  is_active: true,
  includes: null,
  allergens: null,
  rating: '4.5',
  review_count: 10,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

const makeOrderWithBusinessOwner = (overrides: Record<string, any> = {}) => ({
  order: makeOrderRow(),
  business_owner_id: 'business-1',
  ...overrides,
});

const makeCouponRow = (overrides: Record<string, any> = {}) => ({
  id: 'coupon-1',
  business_id: 'business-1',
  code: 'PROMO10',
  name: 'Promo',
  type: 'percentage' as const,
  value: '10',
  min_order_amount: '0',
  max_uses: null,
  used_count: 0,
  is_active: true,
  expires_at: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
  updated_at: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let offersRepository: jest.Mocked<OffersRepository>;
  const getFlag = jest.fn().mockReturnValue(false);

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: OrdersRepository,
          useValue: {
            transaction: jest.fn(),
            findActiveByUserAndOffer: jest.fn(),
            findByIdWithBusinessOwner: jest.fn(),
            findByIdForUpdate: jest.fn(),
            listForUser: jest.fn(),
            listForBusiness: jest.fn(),
            updateStatus: jest.fn(),
            insertOrder: jest.fn(),
            insertEvent: jest.fn(),
            isBusinessOwner: jest.fn(),
            findBusinessIdsOwnedBy: jest.fn(),
            nextOrderNumber: jest.fn(),
            findCommissionRate: jest.fn(),
            findCouponByCodeForUpdate: jest.fn(),
            incrementCouponUsedCount: jest.fn(),
            accrueBusinessBalance: jest.fn(),
          },
        },
        {
          provide: OffersRepository,
          useValue: {
            findByIdForUpdate: jest.fn(),
            decrementStock: jest.fn(),
            incrementStock: jest.fn(),
            findBusinessIdsOwnedBy: jest.fn(),
            findOrderCandidatesToExpire: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: getFlag } },
      ],
    }).compile();

    service = module.get(OrdersService);
    ordersRepository = module.get(OrdersRepository);
    offersRepository = module.get(OffersRepository);

    jest.resetAllMocks();

    (ordersRepository.transaction as jest.Mock).mockImplementation(
      async (fn: (tx: any) => Promise<any>) => fn({}),
    );
  });

  describe('create (espejo de reserve_offer)', () => {
    const body = { offer_id: 'offer-1' };
    const createdOrder = makeOrderRow({
      id: 'order-1',
      user_id: 'user-1',
      pickup_code: 'ABCDEF',
    });

    const mockHappyPath = (offer = makeOfferRow()) => {
      offersRepository.findByIdForUpdate.mockResolvedValue(offer);
      ordersRepository.findActiveByUserAndOffer.mockResolvedValue(null);
      ordersRepository.findCommissionRate.mockResolvedValue('0.1000');
      offersRepository.decrementStock.mockResolvedValue(true);
      ordersRepository.nextOrderNumber.mockResolvedValue('FD-2026-0825-001');
      ordersRepository.insertOrder.mockResolvedValue(createdOrder);
      ordersRepository.insertEvent.mockResolvedValue(undefined);
    };

    it('feliz: crea orden con snapshot de comisión y contrato del RPC', async () => {
      mockHappyPath();

      const result = await service.create(mockAuthUser, body);

      expect(result).toMatchObject({
        id: 'order-1',
        status: 'pending',
        pickup_code: 'ABCDEF',
      });
      // Snapshot de comisión sobre el precio final tras cupón (sin cupón aquí)
      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          commission_rate: '0.1',
          platform_fee: '1', // round(9.99 * 0.10, 2) = 1.00
          net_amount: '8.99', // 9.99 - 1.00
          coupon_id: null,
        }),
      );
      expect(ordersRepository.insertEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'pending', previous_status: null }),
      );
    });

    it.each([
      [
        'oferta inexistente/inactiva',
        makeOfferRow({ is_active: false }),
        'OFFER_NOT_FOUND',
      ],
      ['stock insuficiente', makeOfferRow({ stock: 0 }), 'OFFER_OUT_OF_STOCK'],
      [
        'ventana vencida',
        makeOfferRow({ pickup_end: new Date('2020-01-01T00:00:00Z') }),
        'OFFER_EXPIRED',
      ],
    ])('%s → mismo código de error que el RPC', async (_name, offer, code) => {
      mockHappyPath(offer);

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(code);
    });

    it('duplicado activo → DUPLICATE_RESERVATION', async () => {
      offersRepository.findByIdForUpdate.mockResolvedValue(makeOfferRow());
      ordersRepository.findActiveByUserAndOffer.mockResolvedValue(
        makeOrderRow({ id: 'existing' }),
      );

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        'DUPLICATE_RESERVATION',
      );
    });

    it('condición de carrera en stock → OFFER_OUT_OF_STOCK', async () => {
      mockHappyPath();
      offersRepository.decrementStock.mockResolvedValue(false);

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        'OFFER_OUT_OF_STOCK',
      );
    });

    it('cupón porcentual: descuento acotado al precio y comisión sobre el final', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(
        makeCouponRow({ type: 'percentage', value: '50' }), // 9.99 → 5.00
      );

      await service.create(mockAuthUser, { ...body, coupon_code: 'PROMO10' });

      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          price: '4.995', // 9.99 - 4.995
          coupon_id: 'coupon-1',
          platform_fee: '0.5', // round(4.995 * 0.1, 2)
          net_amount: '4.5',
        }),
      );
      expect(ordersRepository.incrementCouponUsedCount).toHaveBeenCalledWith(
        expect.anything(),
        'coupon-1',
      );
    });

    it('cupón fijo mayor al precio: descuento acotado (precio final 0)', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(
        makeCouponRow({ type: 'fixed', value: '50' }),
      );

      await service.create(mockAuthUser, { ...body, coupon_code: 'X' });

      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ price: '0', net_amount: '0' }),
      );
    });

    it('cupón agotado → COUPON_EXHAUSTED sin decrementar stock', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(
        makeCouponRow({ max_uses: 5, used_count: 5 }),
      );

      await expect(
        service.create(mockAuthUser, { ...body, coupon_code: 'X' }),
      ).rejects.toThrow('COUPON_EXHAUSTED');
      expect(offersRepository.decrementStock).not.toHaveBeenCalled();
    });

    it('mínimo no alcanzado → COUPON_MIN_NOT_MET', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(
        makeCouponRow({ min_order_amount: '20' }),
      );

      await expect(
        service.create(mockAuthUser, { ...body, coupon_code: 'X' }),
      ).rejects.toThrow('COUPON_MIN_NOT_MET');
    });

    it('cupón global (business_id null): aplica igual que el del negocio', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(
        makeCouponRow({ business_id: null, value: '20' }), // 9.99 → 7.99
      );

      await service.create(mockAuthUser, { ...body, coupon_code: 'GLOBAL10' });

      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          price: '7.992', // 9.99 * 0.8 (el espejo no redondea el precio)
          coupon_id: 'coupon-1',
        }),
      );
    });

    it('cupón inexistente/vencido: el SQL continúa sin descuento (espejo idéntico)', async () => {
      mockHappyPath();
      ordersRepository.findCouponByCodeForUpdate.mockResolvedValue(null);

      await service.create(mockAuthUser, { ...body, coupon_code: 'NOPE' });

      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ price: '9.99', coupon_id: null }),
      );
    });

    it('folio FD-YYYY-MMDD-NNN generado con lock diario', async () => {
      mockHappyPath();

      await service.create(mockAuthUser, body);

      expect(ordersRepository.nextOrderNumber).toHaveBeenCalledTimes(1);
      expect(ordersRepository.insertOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ order_number: 'FD-2026-0825-001' }),
      );
    });

    it('pickup code: 6 chars del charset sin ambiguos', async () => {
      mockHappyPath();

      const result = await service.create(mockAuthUser, body);

      expect(result.pickup_code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });
  });

  describe('cancelOrder (espejo de cancel_order)', () => {
    it('feliz: cancela, restaura stock y registra evento', async () => {
      ordersRepository.findByIdForUpdate.mockResolvedValue(
        makeOrderWithBusinessOwner({
          order: makeOrderRow({ user_id: 'user-1', status: 'pending' }),
        }),
      );
      ordersRepository.updateStatus.mockResolvedValue(
        makeOrderRow({ status: 'cancelled' }),
      );
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.cancelOrder(mockAuthUser, 'order-1');

      expect(result.status).toBe('cancelled');
      expect(offersRepository.incrementStock).toHaveBeenCalledWith(
        expect.anything(),
        'offer-1',
        1,
      );
      expect(ordersRepository.insertEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'cancelled',
          reason: 'Cancelado por el usuario',
        }),
      );
    });

    it('ORDER_NOT_FOUND cuando la orden no existe', async () => {
      ordersRepository.findByIdForUpdate.mockResolvedValue(null);

      await expect(service.cancelOrder(mockAuthUser, 'x')).rejects.toThrow(
        'ORDER_NOT_FOUND',
      );
    });

    it('NOT_ORDER_OWNER cuando no es dueño', async () => {
      ordersRepository.findByIdForUpdate.mockResolvedValue(
        makeOrderWithBusinessOwner({
          order: makeOrderRow({ user_id: 'someone-else' }),
        }),
      );

      await expect(service.cancelOrder(mockAuthUser, 'order-1')).rejects.toThrow(
        'NOT_ORDER_OWNER',
      );
    });

    it.each(['completed', 'cancelled', 'expired', 'picked_up'] as const)(
      '%s → CANNOT_CANCEL',
      async (status) => {
        ordersRepository.findByIdForUpdate.mockResolvedValue(
          makeOrderWithBusinessOwner({
            order: makeOrderRow({ user_id: 'user-1', status }),
          }),
        );

        await expect(
          service.cancelOrder(mockAuthUser, 'order-1'),
        ).rejects.toThrow('CANNOT_CANCEL');
      },
    );
  });

  describe('validatePickupCode (espejo de validate_pickup_code)', () => {
    const businessLocked = (overrides: Record<string, any> = {}) =>
      makeOrderWithBusinessOwner({
        order: makeOrderRow({
          user_id: 'consumer-1',
          status: 'ready_for_pickup',
          ...overrides,
        }),
      });

    const happyMocks = (locked = businessLocked()) => {
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue({
        ...locked.order,
        status: 'completed',
      });
      ordersRepository.insertEvent.mockResolvedValue(undefined);
    };

    it('feliz: completa la orden con metadata method=pickup_code', async () => {
      happyMocks();

      const result = await service.validatePickupCode(
        mockBusinessUser,
        'order-1',
        'ABC123',
      );

      expect(result.status).toBe('completed');
      expect(ordersRepository.insertEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'completed',
          previous_status: 'ready_for_pickup',
          metadata: expect.objectContaining({ method: 'pickup_code' }),
        }),
      );
    });

    it('UNAUTHORIZED si el caller no es el dueño del negocio (o no existe)', async () => {
      happyMocks(businessLocked());

      await expect(
        service.validatePickupCode(mockAdminUser, 'order-1', 'ABC123'),
      ).rejects.toThrow('UNAUTHORIZED');

      ordersRepository.findByIdForUpdate.mockResolvedValue(null);
      await expect(
        service.validatePickupCode(mockBusinessUser, 'nope', 'ABC123'),
      ).rejects.toThrow('UNAUTHORIZED');
    });

    it('INVALID_CODE con código incorrecto', async () => {
      happyMocks();

      await expect(
        service.validatePickupCode(mockBusinessUser, 'order-1', 'WRONG1'),
      ).rejects.toThrow('INVALID_CODE');
    });

    it.each(['pending', 'confirmed', 'completed', 'cancelled'] as const)(
      '%s → INVALID_STATUS',
      async (status) => {
        happyMocks(businessLocked({ status }));

        await expect(
          service.validatePickupCode(mockBusinessUser, 'order-1', 'ABC123'),
        ).rejects.toThrow('INVALID_STATUS');
      },
    );
  });

  describe('listMine', () => {
    it('should return paginated orders for user', async () => {
      const items = [makeOrderRow({ id: 'order-1' }), makeOrderRow({ id: 'order-2' })];
      ordersRepository.listForUser.mockResolvedValue({ items, total: 2 });

      const result = await service.listMine(mockAuthUser, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.total_pages).toBe(1);
    });
  });

  describe('listForBusiness', () => {
    it('should return orders for business owner', async () => {
      const items = [
        makeOrderRow({ id: 'order-1', user_id: 'user-1' }),
        makeOrderRow({ id: 'order-2', user_id: 'user-2' }),
      ];
      ordersRepository.listForBusiness.mockResolvedValue({ items, total: 2 });
      offersRepository.findBusinessIdsOwnedBy.mockResolvedValue(['business-1']);

      const result = await service.listForBusiness(mockBusinessUser, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('should throw ForbiddenException when user owns no business', async () => {
      offersRepository.findBusinessIdsOwnedBy.mockResolvedValue([]);

      await expect(
        service.listForBusiness(mockBusinessUser, { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnprocessableEntityException when user owns multiple businesses without business_id', async () => {
      offersRepository.findBusinessIdsOwnedBy.mockResolvedValue(['b1', 'b2']);

      await expect(
        service.listForBusiness(mockBusinessUser, { page: 1, limit: 10 }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw ForbiddenException when user does not own specified business', async () => {
      ordersRepository.isBusinessOwner.mockResolvedValue(false);

      await expect(
        service.listForBusiness(mockBusinessUser, {
          business_id: 'other-business',
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getById', () => {
    it('should return order when user is owner', async () => {
      const row = makeOrderWithBusinessOwner({
        order: makeOrderRow({ user_id: 'user-1' }),
      });
      ordersRepository.findByIdWithBusinessOwner.mockResolvedValue(row);

      const result = await service.getById(mockAuthUser, 'order-1');

      expect(result.id).toBe('order-1');
      expect(result.pickup_code).toBe('ABC123'); // owner sees pickup code
    });

    it('should return order when user is business owner', async () => {
      const row = makeOrderWithBusinessOwner({
        order: makeOrderRow({ user_id: 'user-1' }),
      });
      ordersRepository.findByIdWithBusinessOwner.mockResolvedValue(row);

      const result = await service.getById(mockBusinessUser, 'order-1');

      expect(result.id).toBe('order-1');
    });

    it('should hide pickup_code from business before ready_for_pickup', async () => {
      const row = makeOrderWithBusinessOwner({
        order: makeOrderRow({ user_id: 'user-1', status: 'confirmed' }),
      });
      ordersRepository.findByIdWithBusinessOwner.mockResolvedValue(row);

      const result = await service.getById(mockBusinessUser, 'order-1');

      expect(result.pickup_code).toBeNull();
    });

    it('should show pickup_code to business at ready_for_pickup', async () => {
      const row = makeOrderWithBusinessOwner({
        order: makeOrderRow({ user_id: 'user-1', status: 'ready_for_pickup' }),
      });
      ordersRepository.findByIdWithBusinessOwner.mockResolvedValue(row);

      const result = await service.getById(mockBusinessUser, 'order-1');

      expect(result.pickup_code).toBe('ABC123');
    });

    it('should throw NotFoundException when order not found', async () => {
      (ordersRepository.findByIdWithBusinessOwner as jest.Mock).mockResolvedValue(null);

      await expect(service.getById(mockAuthUser, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is stranger', async () => {
      const row = makeOrderWithBusinessOwner({
        order: makeOrderRow({ user_id: 'other-user' }),
      });
      ordersRepository.findByIdWithBusinessOwner.mockResolvedValue(row);

      await expect(service.getById(mockAuthUser, 'order-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should transition order status when allowed', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', user_id: 'user-1' }),
      });
      const updated = makeOrderRow({ status: 'confirmed', user_id: 'user-1' });

      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(updated);
      ordersRepository.isBusinessOwner.mockResolvedValue(true);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.updateStatus(
        mockBusinessUser,
        'order-1',
        { status: 'confirmed' },
      );

      expect(result.status).toBe('confirmed');
      expect(ordersRepository.updateStatus).toHaveBeenCalledWith(
        expect.anything(),
        'order-1',
        'confirmed',
        'pending',
      );
    });

    it('should restore stock when cancelling from stock-holding status', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', user_id: 'user-1' }),
      });
      const updated = makeOrderRow({ status: 'cancelled', user_id: 'user-1' });

      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(updated);
      ordersRepository.isBusinessOwner.mockResolvedValue(true);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      await service.updateStatus(mockBusinessUser, 'order-1', {
        status: 'cancelled',
      });

      expect(offersRepository.incrementStock).toHaveBeenCalledWith(
        expect.anything(),
        'offer-1',
        1,
      );
    });

    it('should not restore stock when completing order', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'picked_up', user_id: 'user-1' }),
      });
      const updated = makeOrderRow({ status: 'completed', user_id: 'user-1' });

      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(updated);
      ordersRepository.isBusinessOwner.mockResolvedValue(true);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      await service.updateStatus(mockBusinessUser, 'order-1', {
        status: 'completed',
      });

      expect(offersRepository.incrementStock).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when order not found', async () => {
      ordersRepository.findByIdForUpdate.mockResolvedValue(null);

      await expect(
        service.updateStatus(mockAuthUser, 'nonexistent', { status: 'confirmed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException for invalid transition', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'completed', user_id: 'user-1' }),
      });
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);

      await expect(
        service.updateStatus(mockAdminUser, 'order-1', { status: 'pending' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw ForbiddenException when user cannot transition', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', user_id: 'user-1' }),
      });
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);

      await expect(
        service.updateStatus(mockAuthUser, 'order-1', { status: 'confirmed' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when concurrent status change', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', user_id: 'user-1' }),
      });
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(null);

      await expect(
        service.updateStatus(mockBusinessUser, 'order-1', { status: 'confirmed' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow consumer to cancel early order', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', user_id: 'user-1' }),
      });
      const updated = makeOrderRow({ status: 'cancelled', user_id: 'user-1' });

      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(updated);
      ordersRepository.isBusinessOwner.mockResolvedValue(true);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.updateStatus(mockAuthUser, 'order-1', {
        status: 'cancelled',
      });

      expect(result.status).toBe('cancelled');
    });

    it('should allow admin to do any valid transition', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'picked_up', user_id: 'user-1' }),
      });
      const updated = makeOrderRow({ status: 'completed', user_id: 'user-1' });

      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(updated);
      ordersRepository.isBusinessOwner.mockResolvedValue(true);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.updateStatus(mockAdminUser, 'order-1', {
        status: 'completed',
      });

      expect(result.status).toBe('completed');
    });

    it('espejo dormido: sin flag NO acumula earnings (el trigger SQL lo hace)', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'picked_up', user_id: 'user-1' }),
      });
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(
        makeOrderRow({ status: 'completed' }),
      );
      ordersRepository.isBusinessOwner.mockResolvedValue(true);

      getFlag.mockReturnValue(false);
      await service.updateStatus(mockBusinessUser, 'order-1', {
        status: 'completed',
      });

      expect(ordersRepository.accrueBusinessBalance).not.toHaveBeenCalled();
    });

    it('espejo activo (flag): acumula net_amount al completar', async () => {
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'picked_up', user_id: 'user-1' }),
      });
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(
        makeOrderRow({ status: 'completed' }),
      );
      ordersRepository.isBusinessOwner.mockResolvedValue(true);

      getFlag.mockImplementation((key: string) => key === 'ENABLE_API_MIRROR_ORDERS');
      await service.updateStatus(mockBusinessUser, 'order-1', {
        status: 'completed',
      });

      expect(ordersRepository.accrueBusinessBalance).toHaveBeenCalledWith(
        expect.anything(),
        'business-1',
        '8.99',
      );
    });
  });

  describe('expireStaleOrders', () => {
    it('should expire pending orders and restore stock', async () => {
      const candidate = { orderId: 'order-1' };
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', offer_id: 'offer-1' }),
      });

      offersRepository.findOrderCandidatesToExpire.mockResolvedValue([candidate]);
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(
        makeOrderRow({ status: 'expired', offer_id: 'offer-1' }),
      );
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.expireStaleOrders();

      expect(result.expired).toBe(1);
      expect(offersRepository.incrementStock).toHaveBeenCalledWith(
        expect.anything(),
        'offer-1',
        1,
      );
    });

    it('should skip orders not in pending/ready_for_pickup', async () => {
      const candidate = { orderId: 'order-1' };
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'confirmed', offer_id: 'offer-1' }),
      });

      offersRepository.findOrderCandidatesToExpire.mockResolvedValue([candidate]);
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);

      const result = await service.expireStaleOrders();

      expect(result.expired).toBe(0);
      expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('should skip when updateStatus returns null (concurrent change)', async () => {
      const candidate = { orderId: 'order-1' };
      const locked = makeOrderWithBusinessOwner({
        order: makeOrderRow({ status: 'pending', offer_id: 'offer-1' }),
      });

      offersRepository.findOrderCandidatesToExpire.mockResolvedValue([candidate]);
      ordersRepository.findByIdForUpdate.mockResolvedValue(locked);
      ordersRepository.updateStatus.mockResolvedValue(null);

      const result = await service.expireStaleOrders();

      expect(result.expired).toBe(0);
    });
  });
});