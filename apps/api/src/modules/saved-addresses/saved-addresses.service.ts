import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddSavedAddressRequestDto,
  SavedAddressDto,
  UpdateSavedAddressDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { SavedAddressMapper } from './saved-addresses.mapper';
import { SavedAddressesRepository } from './saved-addresses.repository';

/**
 * The address book of the AUTHENTICATED caller.
 *
 * Every method takes the `AuthUser` and reads the owner from `user.id`. There is
 * no `user_id` parameter anywhere in this service, which is the whole point: an
 * address book is private to its owner, so the identity has to come from the
 * verified token and there must be no code path that could accept it from the
 * request instead. `AddSavedAddressRequestSchema` drops `user_id` from the body
 * for the same reason `AddFavoriteRequestSchema` does, and the repository takes
 * the owner as an argument rather than as a field of the payload.
 *
 * These are consumer endpoints, not an admin or business surface: any
 * authenticated role may use them, so the controller declares no `@Roles`. The
 * RLS policies on this table are owner-only on all four verbs with no admin
 * bypass, so these routes widen nothing — they can only do what the calling
 * user's own policy already allowed.
 *
 * ─── THE ONE-DEFAULT RULE, AND WHY IT IS HERE ────────────────────────────
 *
 * At most one of a user's addresses may carry `is_default = true`, and THE
 * DATABASE DOES NOT ENFORCE IT. `public.saved_addresses` has a primary key and
 * a foreign key to profiles and nothing else: no unique constraint, no partial
 * unique index, no trigger. Two default rows are writable in plain SQL today.
 *
 * That is not cosmetic. `supabase/functions/dispatch-nearby-offers` selects
 * `user_id, latitude, longitude ... eq("is_default", true)` and folds the rows
 * into a `Map` with no ordering, so a second default makes the proximity origin
 * an arbitrary pick between two addresses the user did not choose. The
 * consequence is silent: the user gets notifications for offers near an address
 * they may not have meant, or none at all.
 *
 * SO THIS SERVICE IS THE ONLY ENFORCEMENT POINT, and it is deliberately the
 * only one: every write that can set the flag clears the caller's other rows
 * first, inside the same transaction, and the tests in
 * `saved-addresses.service.db.spec.ts` pin that. The real fix is a partial
 * unique index (`unique (user_id) where is_default`), which is DDL and therefore
 * belongs in a Supabase migration — not in a PR that is only allowed to touch
 * the API. Until that index exists, this class is the guarantee.
 */
@Injectable()
export class SavedAddressesService {
  constructor(
    private readonly savedAddressesRepository: SavedAddressesRepository,
  ) {}

  /**
   * The caller's book, default first. A bare array rather than a page: this is a
   * private, hand-sized list that the consumer renders whole, and paginating it
   * would only invite a client to show an address book with the default address
   * missing from the first page.
   */
  async list(user: AuthUser): Promise<SavedAddressDto[]> {
    const rows = await this.savedAddressesRepository.listForUser(user.id);
    return rows.map((row) => SavedAddressMapper.toDto(row));
  }

  /**
   * Create one of my addresses.
   *
   * WHY THE CLEAR IS IN THE SAME TRANSACTION AS THE INSERT: without the
   * transaction there is a window — between the clear and the insert, and
   * between the insert and the read that decides the flag — in which the user's
   * book holds two defaults, and because the schema has no constraint behind
   * this rule NOTHING repairs that window later. One transaction makes the read
   * ("do I already have addresses?"), the clear and the insert one decision.
   *
   * THE VERY FIRST ADDRESS A USER SAVES becomes their default. The caller may
   * omit `is_default` and get that, or ask for it explicitly; what it may not do
   * is ask for `false`, because there is no other row to be the default and the
   * edge function that reads this flag would then skip the user entirely. The
   * count is what decides it, exactly as the consumer decided it before the
   * cutover (`is_default: !current || current.length === 0`), so a create
   * behaves the same through either writer. A book that already exists with no
   * default — writable today through PostgREST, which has the same hole this
   * class is closing — is not repaired here: that is a data migration's job, not
   * a create's, and silently promoting an address the user never chose is worse
   * than the state it would fix.
   */
  async create(
    user: AuthUser,
    body: AddSavedAddressRequestDto,
  ): Promise<SavedAddressDto> {
    return this.savedAddressesRepository.transaction(async (tx) => {
      const existing = await this.savedAddressesRepository.countForUser(
        tx,
        user.id,
      );

      const isDefault = this.isDefaultOnCreate(body.is_default, existing);
      if (isDefault) {
        await this.savedAddressesRepository.clearOtherDefaults(
          tx,
          user.id,
          null,
        );
      }

      const inserted = await this.savedAddressesRepository.insertAs(
        tx,
        user.id,
        {
          ...SavedAddressMapper.toCreate(body),
          is_default: isDefault,
        },
      );

      return SavedAddressMapper.toDto(inserted);
    });
  }

  /**
   * Edit one of my addresses.
   *
   * Same transaction, same reason: the clear that promotes a row and the write
   * that promotes it are one decision, and the `user_id` predicate inside them
   * is what keeps a stranger's address untouched. A 404 thrown after the clear
   * rolls the clear back with it, so a failed request never demotes a default.
   *
   * MAY A PATCH LEAVE THE USER WITH NO DEFAULT AT ALL? No — it is rejected with
   * a 409. Three reasons, in order of weight:
   *
   *  1. The request has no coherent reading. "Make this not the default" when it
   *     is the only address is unsatisfiable, and the reading a caller almost
   *     always means instead — "I want a different default" — is expressible
   *     directly: send `is_default: true` on the other address. A silent success
   *     here would leave the caller believing something changed when the flag
   *     they care about did not.
   *  2. A book with no default is a silent downgrade, not a neutral state. The
   *     one consumer that reads this flag skips the user with `continue` and no
   *     error, so last-minute-deal notifications stop with nothing reported to
   *     anybody.
   *  3. No existing client needs the write to succeed. The consumer's own sheet
   *     renders the "set as default" control only on a NON-default row
   *     (`address && !address.is_default`), so nothing in the app ever asks to
   *     un-default the last one. A 409 costs no current flow and tells a
   *     hand-rolled client exactly what to do instead.
   *
   * The honest limit of this rule: it is NOT "exactly one default forever".
   * Deleting the default address is still allowed and leaves a book with no
   * default (see `remove`), because "I no longer have a default" is a
   * statement the user can make about their own book, and inventing a
   * replacement during a delete would silently move their default under them.
   */
  async update(
    user: AuthUser,
    id: string,
    body: UpdateSavedAddressDto,
  ): Promise<SavedAddressDto> {
    return this.savedAddressesRepository.transaction(async (tx) => {
      const current = await this.savedAddressesRepository.findOwned(
        tx,
        user.id,
        id,
      );
      if (!current) {
        throw new NotFoundException(`Address ${id} not found`);
      }

      if (body.is_default === false && current.is_default) {
        throw new ConflictException(
          'Cannot clear is_default: it is the only default address. Set another ' +
            'address as default, or delete this one.',
        );
      }

      if (body.is_default === true) {
        // Excluding this row is what makes promoting a row that is already the
        // default a no-op instead of a demotion.
        await this.savedAddressesRepository.clearOtherDefaults(tx, user.id, id);
      }

      const updated = await this.savedAddressesRepository.updateOwned(
        tx,
        user.id,
        id,
        SavedAddressMapper.toPatch(body),
      );
      // Defensive: the row was just read inside this transaction, so nothing
      // visible could take it. If a concurrent delete did, the throw rolls the
      // clear back too, which is the outcome a stranger-free 404 promises.
      if (!updated) {
        throw new NotFoundException(`Address ${id} not found`);
      }

      return SavedAddressMapper.toDto(updated);
    });
  }

  /**
   * Remove one of my addresses. Deleting something that is not there is a
   * success, not a 404, for the same reason it is on favorites: the Supabase-side
   * behaviour this mirrors deletes zero rows and reports success, and a consumer
   * that double-fires a delete should not have to distinguish the two cases.
   *
   * No replacement default is promoted, deliberately — see the note in `update`.
   */
  async remove(user: AuthUser, id: string): Promise<void> {
    await this.savedAddressesRepository.deleteOwned(user.id, id);
  }

  /**
   * The default flag a new address is stored with.
   *
   * Split out so the rule has exactly one statement: a user with no addresses
   * cannot ask for a non-default one, and a user with addresses gets `false`
   * unless they explicitly ask for the flag.
   */
  private isDefaultOnCreate(
    requested: boolean | undefined,
    existing: number,
  ): boolean {
    if (existing > 0) return requested ?? false;

    if (requested === false) {
      throw new ConflictException(
        'Cannot save the first address with is_default false: a user with saved ' +
          'addresses has a default. Send is_default true or omit the field.',
      );
    }

    return true;
  }
}
