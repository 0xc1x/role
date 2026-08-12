import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepository: jest.Mocked<OrdersRepository>;
  let offersRepository: jest.Mocked<OffersRepository>;

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

  describe('create', () => {
    it('should create and return an order', async () => {
      const body = { offer_id: 'offer-1' };
      const offer = makeOfferRow();
      const createdOrder = makeOrderRow({ id: 'order-1', user_id: 'user-1' });

      offersRepository.findByIdForUpdate.mockResolvedValue(offer);
      ordersRepository.findActiveByUserAndOffer.mockResolvedValue(null);
      offersRepository.decrementStock.mockResolvedValue(true);
      ordersRepository.insertOrder.mockResolvedValue(createdOrder);
      ordersRepository.insertEvent.mockResolvedValue(undefined);

      const result = await service.create(mockAuthUser, body);

      expect(result).toMatchObject({
        id: 'order-1',
        user_id: 'user-1',
        offer_id: 'offer-1',
        business_id: 'business-1',
        status: 'pending',
        pickup_code: 'ABC123',
      });
      expect(offersRepository.findByIdForUpdate).toHaveBeenCalledWith(
        expect.anything(),
        'offer-1',
      );
      expect(ordersRepository.insertOrder).toHaveBeenCalled();
      expect(ordersRepository.insertEvent).toHaveBeenCalled();
    });

    it('should throw ConflictException when user already has active order', async () => {
      const body = { offer_id: 'offer-1' };
      ordersRepository.findActiveByUserAndOffer.mockResolvedValue(
        makeOrderRow({ id: 'existing-order' }),
      );

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException when offer not found', async () => {
      const body = { offer_id: 'nonexistent' };
      offersRepository.findByIdForUpdate.mockResolvedValue(null);

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when offer is inactive', async () => {
      const body = { offer_id: 'offer-1' };
      offersRepository.findByIdForUpdate.mockResolvedValue(
        makeOfferRow({ is_active: false }),
      );

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when offer is out of stock', async () => {
      const body = { offer_id: 'offer-1' };
      offersRepository.findByIdForUpdate.mockResolvedValue(
        makeOfferRow({ stock: 0 }),
      );

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when pickup window ended', async () => {
      const body = { offer_id: 'offer-1' };
      offersRepository.findByIdForUpdate.mockResolvedValue(
        makeOfferRow({ pickup_end: new Date('2020-01-01T00:00:00Z') }),
      );

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when decrementStock fails', async () => {
      const body = { offer_id: 'offer-1' };
      offersRepository.findByIdForUpdate.mockResolvedValue(makeOfferRow());
      offersRepository.decrementStock.mockResolvedValue(false);

      await expect(service.create(mockAuthUser, body)).rejects.toThrow(
        ConflictException,
      );
    });
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