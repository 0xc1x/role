import type { AppRole, OrderStatus } from '@0xc1x/role-commons';
import {
  ACTIVE_ORDER_STATUSES,
  canActorTransition,
  canViewPickupCode,
  isTransitionAllowed,
  ORDER_TRANSITIONS,
  shouldRestockOnTransition,
  STOCK_HOLDING_STATUSES,
} from './order-status.machine';

const ALL_STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[];
const ALL_ROLES: AppRole[] = ['user', 'business', 'admin'];

describe('order status machine', () => {
  describe('transition graph', () => {
    it('allows pending → confirmed', () => {
      expect(isTransitionAllowed('pending', 'confirmed')).toBe(true);
    });

    it('rejects completed → pending', () => {
      expect(isTransitionAllowed('completed', 'pending')).toBe(false);
    });

    it('has no transitions out of terminal states', () => {
      expect(ORDER_TRANSITIONS.completed).toEqual([]);
      expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
      expect(ORDER_TRANSITIONS.expired).toEqual([]);
    });

    it.each(
      ALL_STATUSES.flatMap((from) =>
        ALL_STATUSES.map((to) => ({
          from,
          to,
          allowed: (ORDER_TRANSITIONS[from] as readonly string[]).includes(to),
        })),
      ),
    )('isTransitionAllowed($from → $to) === $allowed', ({ from, to, allowed }) => {
      expect(isTransitionAllowed(from, to)).toBe(allowed);
    });
  });

  describe('canActorTransition matrix', () => {
    const ownershipCases = [
      { isOrderOwner: true, isBusinessOwner: false, label: 'order-owner' },
      { isOrderOwner: false, isBusinessOwner: true, label: 'business-owner' },
      { isOrderOwner: false, isBusinessOwner: false, label: 'stranger' },
      { isOrderOwner: true, isBusinessOwner: true, label: 'both' },
    ] as const;

    it.each(
      ALL_ROLES.flatMap((role) =>
        ALL_STATUSES.flatMap((from) =>
          ALL_STATUSES.flatMap((to) =>
            ownershipCases.map((own) => ({
              role,
              from,
              to,
              ...own,
              expected: canActorTransition(role, from, to, {
                isOrderOwner: own.isOrderOwner,
                isBusinessOwner: own.isBusinessOwner,
              }),
            })),
          ),
        ),
      ),
    )(
      '$role | $from→$to | $label => $expected',
      ({ role, from, to, isOrderOwner, isBusinessOwner, expected }) => {
        expect(
          canActorTransition(role, from, to, { isOrderOwner, isBusinessOwner }),
        ).toBe(expected);
      },
    );

    it('lets consumer cancel early orders', () => {
      expect(
        canActorTransition('user', 'pending', 'cancelled', {
          isOrderOwner: true,
          isBusinessOwner: false,
        }),
      ).toBe(true);
    });

    it('blocks consumer from confirming', () => {
      expect(
        canActorTransition('user', 'pending', 'confirmed', {
          isOrderOwner: true,
          isBusinessOwner: false,
        }),
      ).toBe(false);
    });

    it('lets business owner advance to ready_for_pickup', () => {
      expect(
        canActorTransition('business', 'confirmed', 'ready_for_pickup', {
          isOrderOwner: false,
          isBusinessOwner: true,
        }),
      ).toBe(true);
    });

    it('blocks business role without ownership from advancing', () => {
      expect(
        canActorTransition('business', 'confirmed', 'ready_for_pickup', {
          isOrderOwner: false,
          isBusinessOwner: false,
        }),
      ).toBe(false);
    });

    it('blocks business role without ownership from expiring', () => {
      expect(
        canActorTransition('business', 'pending', 'expired', {
          isOrderOwner: false,
          isBusinessOwner: false,
        }),
      ).toBe(false);
    });

    it('lets admin do anything allowed by graph', () => {
      expect(
        canActorTransition('admin', 'picked_up', 'completed', {
          isOrderOwner: false,
          isBusinessOwner: false,
        }),
      ).toBe(true);
    });
  });

  describe('shouldRestockOnTransition', () => {
    it.each(STOCK_HOLDING_STATUSES)(
      'restocks when cancelling from %s',
      (from) => {
        expect(shouldRestockOnTransition(from, 'cancelled')).toBe(true);
      },
    );

    it('restocks when expiring from pending/ready', () => {
      expect(shouldRestockOnTransition('pending', 'expired')).toBe(true);
      expect(shouldRestockOnTransition('ready_for_pickup', 'expired')).toBe(
        true,
      );
    });

    it('does not restock after pickup', () => {
      expect(shouldRestockOnTransition('picked_up', 'completed')).toBe(false);
      expect(shouldRestockOnTransition('completed', 'cancelled')).toBe(false);
    });
  });

  describe('canViewPickupCode', () => {
    it('shows code to order owner always', () => {
      expect(
        canViewPickupCode({
          status: 'pending',
          isOrderOwner: true,
          isBusinessOwner: false,
          isAdmin: false,
        }),
      ).toBe(true);
    });

    it('hides code from business until ready_for_pickup', () => {
      expect(
        canViewPickupCode({
          status: 'confirmed',
          isOrderOwner: false,
          isBusinessOwner: true,
          isAdmin: false,
        }),
      ).toBe(false);
      expect(
        canViewPickupCode({
          status: 'ready_for_pickup',
          isOrderOwner: false,
          isBusinessOwner: true,
          isAdmin: false,
        }),
      ).toBe(true);
    });

    it('shows code to admin always', () => {
      expect(
        canViewPickupCode({
          status: 'pending',
          isOrderOwner: false,
          isBusinessOwner: false,
          isAdmin: true,
        }),
      ).toBe(true);
    });
  });

  describe('constants', () => {
    it('defines active and stock-holding sets', () => {
      expect(ACTIVE_ORDER_STATUSES).toContain('pending');
      expect(ACTIVE_ORDER_STATUSES).not.toContain('cancelled');
      expect(STOCK_HOLDING_STATUSES).not.toContain('picked_up');
    });
  });
});
