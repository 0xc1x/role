import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  MyPaymentMethodDto,
  MyPaymentMethodListDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { PaymentMethodsMapper } from './payment-methods.mapper';
import { PaymentMethodsRepository } from './payment-methods.repository';

/**
 * The saved cards of the AUTHENTICATED caller.
 *
 * Every method takes the `AuthUser` and reads the owner from `user.id`. There is
 * no `user_id` parameter anywhere in this service and no request schema on any of
 * its routes, which is the point: a payment method is private to its owner, so
 * the identity has to come from the verified token and there must be no code path
 * — not even a body field a pipe would have to strip — that could supply it from
 * the request instead. On a table of card metadata that is the difference between
 * a self-service route and a cross-account read of someone else's cards.
 *
 * SCOPE — THREE OPERATIONS, DELIBERATELY (ADR-0007).
 *
 * `list`, `setDefault` and `delete` are what exist. There is NO create. The ADR
 * fixes the scope in its own words: list/setDefault/delete are operative, and
 * adding a card shows "coming soon" until the gateway SDK lands — never a
 * first-party form holding a PAN. A create route here would need a `gateway_token`
 * in a request body, which is the one field the contract is not allowed to
 * carry. The consumer agrees: `payment-methods.tsx` renders only a "coming
 * soon" card, and the only writer of this table in the app
 * (`profileRepository.savePaymentMethod`) is itself a scaffold with no caller.
 *
 * There is also no route for editing card details, and no bulk verb. Editing a
 * card means re-tokenising it at the gateway, which is a create, not an update.
 *
 * GUARDS: no `@Public()` and no `@Roles(...)` on the controller. The global
 * `AuthGuard` is default-deny, so a token is required, and the absent role list
 * is what makes this a consumer surface — a `business` account managing its own
 * cards is not an admin action. The table's single RLS policy is owner-only
 * `FOR ALL` with no admin bypass, so these routes widen nothing.
 */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly paymentMethodsRepository: PaymentMethodsRepository,
  ) {}

  /**
   * My cards, default first and newest after.
   *
   * A bare array rather than a page: this is a private, hand-sized list that the
   * consumer renders whole — a user has a handful of cards, not a page of them —
   * and paginating it would only invite a client to show a wallet with the
   * default card missing from the first page.
   */
  async list(user: AuthUser): Promise<MyPaymentMethodListDto> {
    const rows = await this.paymentMethodsRepository.listUsableForUser(user.id);
    return rows.map((row) => PaymentMethodsMapper.toDto(row));
  }

  /**
   * Make one of my cards the default.
   *
   * ─── WHAT THE TRANSACTION GUARANTEES, AND WHAT IT DOES NOT ────────────────
   *
   * At most one of a user's cards may carry `is_default = true`, and THE
   * DATABASE DOES NOT ENFORCE IT. `public.payment_methods` has a primary key, a
   * foreign key, two CHECKs and `idx_payment_methods_user` — which is NOT unique
   * — and no partial unique index on `is_default`. Two default rows are writable
   * in plain SQL today, and mobile's own `setDefaultPaymentMethod` is two
   * separate PostgREST statements that no index and no API method can make atomic.
   *
   * SO THIS OPERATION IS ONE TRANSACTION, and the order inside it is the rule:
   * take the per-user advisory lock, read the target row to prove ownership,
   * clear the user's other defaults, then set the target. The lock is what makes
   * clear-then-set one decision rather than two statements with a window between
   * them; without it two concurrent promotions can interleave into two defaults,
   * and the schema has nothing behind this rule to repair that afterwards. See
   * `PaymentMethodsRepository.lockDefaultForUser` for why it is an advisory lock
   * rather than `SELECT … FOR UPDATE` on the rows.
   *
   * A 404 thrown after the clear rolls the clear back with it, so a failed
   * request never demotes a default. That ordering is deliberate: the ownership
   * read happens BEFORE the clear, so a request that is going to fail never
   * touches the caller's rows at all.
   *
   * The three honest limits, because a guarantee that overstates itself is worse
   * than one that admits its edges:
   *
   *  1. IT SERIALISES THIS API AGAINST ITSELF, AND NOTHING ELSE. Mobile writes
   *     this table directly through PostgREST (ADR-0002), so a promotion running
   *     in the app takes no advisory lock and is invisible to this one. The
   *     transaction makes two concurrent API calls serialise; it does not make
   *     the API and the app serialise. The fix for that is a partial unique index
   *     — `unique (user_id) where is_default and deleted_at is null`, the same
   *     shape `20260927141632_saved_addresses_one_default` added for addresses —
   *     which is DDL and therefore belongs in a Supabase migration this change
   *     is not allowed to write. Until it exists, this class is the guarantee on
   *     the API path only.
   *  2. IT DOES NOT COVER THE PATH BETWEEN MOBILE'S OWN TWO STATEMENTS. That
   *     window is mobile's, and out of scope here; the same migration that would
   *     add the index says so about addresses.
   *  3. A SOFT-DELETED ROW STILL CARRIES `is_default` until the next promotion
   *     sweeps it, and no replacement is invented on delete. That is the same
   *     decision `SavedAddressesService.remove` makes: "I no longer have a
   *     default" is a statement a user can make about their own wallet. The flag
   *     is harmless while the row is invisible to every list, and the clear in the
   *     next promotion is what removes it.
   */
  async setDefault(user: AuthUser, id: string): Promise<MyPaymentMethodDto> {
    return this.paymentMethodsRepository.transaction(async (tx) => {
      // First, because it is the only statement that can block: everything after
      // it runs with the caller's wallet to itself.
      await this.paymentMethodsRepository.lockDefaultForUser(tx, user.id);

      const target = await this.paymentMethodsRepository.findOwnedUsable(
        tx,
        user.id,
        id,
      );
      if (!target) {
        throw new NotFoundException(`Payment method ${id} not found`);
      }

      // Excluding the target id is what makes promoting a card that is ALREADY
      // the default a no-op rather than a clear-then-set of the same row, which
      // would make the two statements disagree about which write won.
      await this.paymentMethodsRepository.clearOtherDefaults(tx, user.id, id);

      const promoted = await this.paymentMethodsRepository.setDefaultOwned(
        tx,
        user.id,
        id,
      );
      // Defensive: the row was read inside this transaction and the advisory lock
      // is held, so nothing visible could have taken it. If it somehow did, the
      // throw rolls the clear back too, which is the outcome a 404 promises.
      if (!promoted) {
        throw new NotFoundException(`Payment method ${id} not found`);
      }

      return PaymentMethodsMapper.toDto(promoted);
    });
  }

  /**
   * Remove one of my cards — a SOFT delete, see
   * `PaymentMethodsRepository.softDeleteOwned`.
   *
   * A 404 IS THROWN for a row that is not the caller's, and that is a
   * deliberate departure from the delete on `favorites` and `saved_addresses`,
   * which answer 204 whenever they touch no rows. Two reasons, and the second is
   * the one that decided it:
   *
   *  1. A silent 204 to a caller who named somebody else's card tells that caller
   *     the card is gone when it is not, and the honest answer costs nothing —
   *     the id is not the caller's, so there is nothing to disclose beyond "no".
   *     "Not yours" and "not there" are deliberately the SAME 404, so this leaks
   *     no information about whether the row exists.
   *  2. This is a PCI-scoped table (ADR-0007) and the decision priority in this
   *     repository puts security and permissions above API consistency. The rows
   *     behind this id are somebody's card metadata.
   *
   * The read is the AUTHORISATION answer, not the write's precondition: the
   * UPDATE that follows is still scoped by `user_id`, so if the ownership
   * changed between the two statements the write would touch nothing and the
   * caller would get a 204 for a card they had just lost — the safe direction.
   * That race cannot be reached anyway, because `user_id` is never updated on
   * this table: there is no update route, and both existing writers set it at
   * insert time.
   *
   * A SECOND DELETE of a card the caller already removed is a 204, not a 404.
   * That is why the read is `findOwnedAny` rather than `findOwnedUsable`: an
   * already-soft-deleted row is still the caller's, so idempotency and ownership
   * are answered from one read.
   */
  async remove(user: AuthUser, id: string): Promise<void> {
    const owned = await this.paymentMethodsRepository.findOwnedAny(user.id, id);
    if (!owned) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }

    await this.paymentMethodsRepository.softDeleteOwned(user.id, id);
  }
}
