import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  businessMemberLocations,
  businessMembers,
  businesses,
  consumerNotificationPreferences,
  deviceTokens,
  favorites,
  marketingPreferences,
  orderEvents,
  orders,
  profiles,
  reviews,
  userConsents,
  userPreferences,
} from '../../database/schema';

/**
 * The transaction handle Drizzle hands to a `transaction()` callback.
 *
 * It is spelled out because the release of a business's ownership is a helper
 * that BOTH branches call: `anonymise` and `eraseAccount` have to release the
 * ownership BEFORE they close the memberships, and that order IS the rule.
 */
type AccountTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Rows that point at a profile and belong to somebody ELSE — a customer's
 * sale, a business's owner, a business's public rating, the account's own
 * place in a team's history. None of them is the account's to delete, and in
 * Supabase several of them CASCADE from `profiles`, so an erase that does not
 * check them does not erase the account, it erases the platform.
 */
export interface RetainedRecords {
  orders: number;
  businesses: number;
  memberships: number;
  owner_memberships: number;
  reviews: number;
}

/**
 * The database half of account self-deletion.
 *
 * WHY A REPOSITORY AND NOT MORE `DRIZZLE` IN `AuthService`: the interesting
 * decision here is a fork whose two branches must not be able to disagree, and
 * the arguments for it are all about WHAT SURVIVES a delete. That reasoning
 * belongs next to the statements that decide it, and the spec that proves the
 * orders and `business_finance.balance` survive has to assert against real rows.
 *
 * AUTHORISATION: every statement here is keyed on the CALLER's id, which comes
 * from the token subject and never from a body or a path segment — same rule,
 * and same reason, as `MeRepository`: the API connects as the `postgres`
 * pooler role, which owns `profiles`, `orders` and `device_tokens` and is
 * therefore exempt from RLS. The `where id = $1` IS the access control.
 */
@Injectable()
export class AuthAccountRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * What would be destroyed, or rewritten, by erasing this profile.
   *
   * ORDERS ARE THE HEADLINE, and the reason is a foreign key: in Supabase,
   * `orders.user_id` is `REFERENCES public.profiles(id) ON DELETE CASCADE`
   * (`20260507193539`). Deleting the profile deletes the sale record the
   * business reconciles payouts against — `price`, `commission_rate`,
   * `platform_fee` and `net_amount` are the frozen snapshot the payout maths is
   * built from, and `business_finance.balance` was accrued from them. A person's
   * data-deletion request would silently become a company's accounting incident.
   *
   * BUT ORDERS ALONE ARE NOT THE CONDITION, and the other two are the reason
   * this method exists rather than a single `countOrders`:
   *
   *  - `businesses` — the ownership of a business lived in `business_ownership`
   *    (whose `owner_id` is `ON DELETE CASCADE` from `profiles`) and now lives
   *    in the owner's `business_members` row (whose `user_id` is `ON DELETE
   *    CASCADE` from `profiles` too). A business owner who never placed an
   *    order passes a "no orders" test, and erasing their profile takes the
   *    business with it — and with it every order that business's OTHER
   *    customers placed, since `orders.business_id` cascades too. That is a
   *    stranger's purchase destroyed by somebody else's account deletion.
   *  - `reviews` — `reviews.user_id` is also `ON DELETE CASCADE`, and a review
   *    is a business's public rating. Deleting the author's account would move
   *    that business's score without anybody deciding to move it.
   *
   *  - `memberships` — `business_members.user_id` is `ON DELETE CASCADE` from
   *    `profiles`, and the §8 says that table's delete is logical and "queda como
   *    operación separada, no expuesta en la v1". So a membership is a row this
   *    account does not get to destroy either: erasing the profile would take
   *    the alias out of the unique index —giving the identifier back to whoever
   *    asks for it next— and would delete the answer to "who was on this team",
   *    which is the whole reason the delete is logical. This is the row that
   *    decided the hard-delete branch's fate: with the cascade in place, an erase
   *    that ignored it either destroys the history or —see the owner guard in
   *    `AuthService.deleteAccount`— runs into a database error.
   *
   * SO THE HARD-DELETE BRANCH IS ENTERED ONLY WHEN THIS RETURNS ALL ZEROES, and
   * anything else falls to the anonymise branch, which keeps every one of these
   * rows and removes only the columns that describe a person.
   *
   * `owner_memberships` is the one number here that is NOT a retention gate: it
   * is a subset of `memberships` that the service reads to decide whether the
   * caller has to do something before the erase (degrade or hand over), because
   * §5.4 says a business is not left without anyone who can administer it. It
   * counts LIVE owner rows only — an archived one is history and grants nothing.
   *
   * ─── Y SOLO CUENTA DUEÑOS DE NEGOCIOS ACTIVOS ─────────────────────────────────
   *
   * Un negocio INACTIVO no es un negocio que alguien pueda administrar: está
   * apagado, y su dueño se va con él (D2). Contar su dueño como una razón para
   * no borrar la cuenta es una jaula sin salida: el dueño no puede transferir
   * un negocio que no existe a efectos del negocio, y la única puerta que
   * existe —la liberación— es la que le deja borrar su cuenta.
   *
   * El join con `businesses.is_active` es lo que convierte el número en la
   * puerta que el plan describe: la cuenta de un dueño de un negocio activo
   * sigue bloqueada, y la de un dueño de un negocio inactivo no.
   *
   * ─── EL CONTEO DE NEGOCIOS SALE DE LA MEMBRESÍA ──────────────────────────────
   *
   * `businesses` cuenta los negocios que la cuenta ADMINISTRA, y la fila que
   * lo dice es la membresía de dueño viva: `role = 'owner'` y
   * `deleted_at is null`. No es lo mismo que `owner_memberships` —que además
   * exige que el negocio esté ACTIVO— porque los dos números cuentan cosas
   * distintas: uno cuenta los negocios que la cuenta dirige, y el otro cuenta
   * los que la bloquearían.
   *
   * La fila de `business_ownership` era el espejo de esto y se retira con la
   * Task 10: leerla sería leer una tabla que ya no existe, y su número y el
   * de la membresía son iguales en producción (16 negocios, 16 filas de
   * propiedad, 16 membresías de dueño vivas: medido).
   */
  async countRetained(userId: string): Promise<RetainedRecords> {
    const [orderCount] = await this.db
      .select({ c: count() })
      .from(orders)
      .where(eq(orders.user_id, userId));
    const [businessCount] = await this.db
      .select({ c: count() })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.user_id, userId),
          eq(businessMembers.role, 'owner'),
          isNull(businessMembers.deleted_at),
        ),
      );
    const [membershipCount] = await this.db
      .select({ c: count() })
      .from(businessMembers)
      .where(eq(businessMembers.user_id, userId));
    const [ownerMembershipCount] = await this.db
      .select({ c: count() })
      .from(businessMembers)
      .innerJoin(businesses, eq(businesses.id, businessMembers.business_id))
      .where(
        and(
          eq(businessMembers.user_id, userId),
          eq(businessMembers.role, 'owner'),
          isNull(businessMembers.deleted_at),
          eq(businesses.is_active, true),
        ),
      );
    const [reviewCount] = await this.db
      .select({ c: count() })
      .from(reviews)
      .where(eq(reviews.user_id, userId));

    return {
      orders: Number(orderCount?.c ?? 0),
      businesses: Number(businessCount?.c ?? 0),
      memberships: Number(membershipCount?.c ?? 0),
      owner_memberships: Number(ownerMembershipCount?.c ?? 0),
      reviews: Number(reviewCount?.c ?? 0),
    };
  }

  /**
   * ANONYMISE, NOT DELETE.
   *
   * The row survives because the money does: `orders`, `order_events`, reviews
   * and the business balances derived from orders all point at `profiles.id`, and
   * that id is the only thing that can be a stable key for them once the person
   * is gone. So the question is not "which rows do we keep" but "which columns
   * still describe a person".
   *
   * SCRUBBED, and why each one:
   *
   *  - `email` — the primary identifier, and NOT NULL, so it is replaced rather
   *    than nulled. The sentinel embeds the row id and uses `.invalid`, a domain
   *    reserved by RFC 2606 that can never resolve: still a syntactically valid
   *    address, so every reader that validates this column keeps working, while
   *    being undeliverable and carrying no name, domain or mailbox.
   *  - `full_name`, `avatar_url`, `phone`, `city` — the remaining self-supplied
   *    personal data. Nulled, not blanked: an empty string is still a value the
   *    UI has to special-case, and `full_name` renders in the public review feed
   *    where an empty name is indistinguishable from a bug.
   *
   * NOT SCRUBBED, and why:
   *
   *  - `id` — the join key for every surviving row. Scrubbing it would be the
   *    deletion this branch exists to avoid.
   *  - `role` — platform state, not personal data, and this service must not be
   *    able to change it from any of these endpoints. Rewriting it would also
   *    quietly move the platform's user/admin headcount, which is an accounting
   *    fact about the platform, not about the person.
   *  - `created_at` — the account's age. Cohort reporting needs it and it
   *    identifies nobody. `updated_at` does move, because the row was written;
   *    that is what the column is for.
   *
   * The two extra statements are not cosmetics:
   *
   *  - `marketing_preferences.is_subscribed = false` — a scrubbed row that stays
   *    subscribed is a row the campaign engine keeps resolving as a recipient
   *    (`findSubscribedRecipients` joins `profiles` and reads `lower(p.email)`),
   *    so the platform would keep mailing an address the person asked to stop
   *    being reachable at. Update only, never insert: this API does not create
   *    that row, and one that was never seeded has nothing to unsubscribe.
   *  - `device_tokens.is_active = false` — `NotificationsRepository` reads tokens
   *    `where user_id = any($1) and is_active = true`. An active push token
   *    beside a surviving profile is a working channel to a phone belonging to
   *    somebody who just deleted the account, and it is the one thing the two
   *    branches differ on for a reason that is not PII: this branch has no
   *    profile cascade to inherit it from.
   *
   * `user_consents` is deliberately left alone: it holds no personal data of its
   * own (`user_id`, `consent_type`, `granted`, timestamps) and it is the proof
   * of what was consented to. A consumer-protection claim needs that ledger to
   * outlive the person.
   *
   * REVIEWS ARE DELETED, not blanked. A `reviews.comment` is personal data the
   * person wrote and it renders publicly, attributed, beside a business name —
   * so leaving it is not erasure, it is publication. A review is also the
   * business's rating, which is why this was an explicit decision and not an
   * obvious one, and why the rejected alternative is recorded here: blanking the
   * body and keeping the score. A score is a fact about a transaction and
   * survives the person; the words are theirs and do not.
   *
   * THE MEMBERSHIP IS DETACHED, NOT DELETED, and it is the same decision the
   * `order_events` actor gets below: the row is somebody else's record —"this
   * person had access to this business, and this is what they touched"— and the
   * §8 says its delete is logical and not exposed in the v1. So it gets
   * `deleted_at` and keeps its alias, its role, its branch scope and its
   * timestamps.
   *
   * ─── POR QUÉ ESTA SENTENCIA EXISTE Y NO SÓLO EL CONTEO ───────────────────────
   *
   * `auth.users → profiles → business_members` es toda `ON DELETE CASCADE`, así
   * que la alternativa a esta sentencia es la cascada, y la cascada es justo lo
   * que no se puede elegir: una fila que la cuenta no tiene derecho a borrar
   * igual se borraría, en silencio, por la clave foránea. Es la misma forma que
   * los borrados explícitos de `eraseAccount`: una sentencia cuya corrección
   * depende de una acción referencial que nadie de este repositorio escribió no
   * es verificable, y acá es peor que no verificable — contra la fila de un
   * dueño, la cascada levanta `R0002` de `trg_enforce_owner_cannot_be_deleted` y
   * el borrado de la cuenta falla.
   *
   * La mitad `deleted_at is null` es lo que la hace segura: una fila ya archivada
   * queda como estaba, y una fila con `role = 'owner'` no puede llegar acá —
   * `AuthService.deleteAccount` las rechaza antes de tocar la identidad, porque el
   * §5.4 no admite un negocio sin nadie que lo administre. Si algún llamador
   * futuro Consegu una, la base dice que no con el motivo adjunto, que es el
   * resultado que hay que querer: esa guarda existe para que nadie termine la
   * propiedad de un negocio sin decidirlo.
   *
   * The average is not recomputed by hand. `on_review_change` and
   * `on_review_offer_change` are `AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW`,
   * so deleting the row fires both and rewrites `businesses.rating`,
   * `businesses.review_count`, `offers.rating` and `offers.review_count` from
   * what is left. Writing those updates here would be a second source of truth
   * for a calculation the database already owns, and it would be the one that
   * drifts.
   *
   * One transaction, because a half-scrubbed profile is worse than either
   * outcome: a row that is no longer identifiable but is still subscribed and
   * still pushable is precisely the failure this method exists to make
   * impossible.
   */
  async anonymise(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // FIRST, and before anything is archived: the ownership of the
      // businesses this account owns is RELEASED, not archived.
      //
      // ─── POR QUÉ UNA FUNCIÓN DE LA BASE Y NO UN `DELETE` AQUÍ ─────────────────
      //
      // Porque «liberado» es una regla de TRES partes —la membresía de dueño
      // archivada, su alcance archivado y la fila de `business_ownership`
      // borrada— y la base es la frontera (ADR-0002): el móvil escribe directo
      // a Supabase y no pasa por esta API. La función
      // `public.release_business_ownership` la dice una vez, y esta API la
      // PREGUNTA.
      //
      // ─── Y POR QUÉ VA PRIMERO, Y NO DESPUÉS ───────────────────────────────────
      //
      // Porque la liberación exige que el actor sea el dueño VIVO del negocio:
      // si las membresías se archivaran primero, la liberación no encontraría a
      // su dueño, la fila de `business_ownership` sobreviviría nombrando a una
      // persona que se va, y el negocio quedaría diciendo que tiene un dueño
      // que no tiene. Es el huérfano silencioso, y el ORDEN es lo que lo
      // evita.
      await this.releaseOwnedBusinesses(tx, userId);

      await tx
        .update(profiles)
        .set({
          email: `anonymized-${userId}@role.invalid`,
          full_name: null,
          avatar_url: null,
          phone: null,
          city: null,
          updated_at: new Date(),
        })
        .where(eq(profiles.id, userId));

      // Between the scrub and the reviews: the person's access is not personal
      // data, it is the record of what they could reach, and it is closed before
      // the identity behind it stops existing.
      await tx
        .update(businessMembers)
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(businessMembers.user_id, userId),
            isNull(businessMembers.deleted_at),
          ),
        );

      // Y las filas de ALCANCE, con ellas. El §8 pide marcar `deleted_at` en
      // `business_members` Y en sus `business_member_locations`, y las dos
      // tablas discrepaban sobre qué significaba (ítem 14 de la herencia): una
      // membresía archivada con su alcance vivo sigue diciendo «esta persona
      // llegaba a esta sucursal» de alguien que ya no está.
      const memberIds = await tx
        .select({ id: businessMembers.id })
        .from(businessMembers)
        .where(eq(businessMembers.user_id, userId));
      if (memberIds.length > 0) {
        await tx
          .update(businessMemberLocations)
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where(
            inArray(
              businessMemberLocations.member_id,
              memberIds.map((member) => member.id),
            ),
          );
      }

      await tx
        .update(marketingPreferences)
        .set({ is_subscribed: false, unsubscribed_at: new Date() })
        .where(eq(marketingPreferences.user_id, userId));

      await tx
        .update(deviceTokens)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(deviceTokens.user_id, userId));

      // Last, so the rating triggers see the profile still in place. Deleting a
      // review fires `on_review_change` and `on_review_offer_change`, which read
      // `businesses` and `offers` to rewrite the averages; running this after the
      // scrub keeps the transaction readable top to bottom — identity first, then
      // what the person can no longer be reached at, then what they published.
      await tx.delete(reviews).where(eq(reviews.user_id, userId));
    });
  }

  /**
   * The ownership of the businesses this account owns, RELEASED.
   *
   * The rule of what a release is lives in the database
   * (`public.release_business_ownership`): the owner's membership is archived,
   * its scope rows are archived with it, and the `business_ownership` row of
   * that business is deleted —because that row is the one the mobile reads to
   * know whose business it is, and leaving it names a person who is leaving.
   *
   * The business itself is NOT deleted and NOT reactivated: a retirement is
   * not a deletion. The other members are NOT touched: the team that stays
   * stays, with its scope, and it is the team that receives the owner back
   * when the platform returns one.
   *
   * AND IT FAILS LOUDLY WHEN IT MUST: the function refuses with `R0004` when
   * the business is still ACTIVE —an active business does not release its
   * owner, it hands it over (`POST /businesses/:id/ownership/transfer`)— and
   * the refusal carries that reason, which is the sentence a person reading
   * the failure needs.
   */
  private async releaseOwnedBusinesses(
    tx: AccountTransaction,
    userId: string,
  ): Promise<void> {
    const owned = await tx
      .select({ businessId: businessMembers.business_id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.user_id, userId),
          eq(businessMembers.role, 'owner'),
          isNull(businessMembers.deleted_at),
        ),
      );

    for (const { businessId } of owned) {
      await tx.execute(
        sql`select public.release_business_ownership(${businessId}::uuid, ${userId}::uuid)`,
      );
    }
  }

  /**
   * HARD DELETE, for an account `countRetained` cleared.
   *
   * The account's own rows go first, explicitly, and the reason is not
   * preference: it is that the Drizzle mirror and Supabase disagree about
   * referential actions. `drizzle-kit pull` writes a bare `REFERENCES` and drops
   * the `ON DELETE CASCADE` clause, so in this repo's own test database
   * `user_preferences`, `user_consents`, `device_tokens`, `favorites`, `reviews`
   * and `orders` all reference `profiles` with NO ACTION — while in Supabase
   * they cascade. A delete that "works because of the cascade" therefore works
   * in production and raises 23503 in every spec, and a statement whose
   * correctness depends on a clause the tests cannot see is not verifiable.
   * Writing the deletes here makes the branch true in both.
   *
   * `consumer_notification_preferences.user_id` is the one child that is NO
   * ACTION in SUPABASE as well (`20260616015353`, `references public.profiles(id)`
   * with no referential action). Every account gets that row from the seeder or
   * the trigger chain, so a hard delete of a `profiles` row raises 23503 in
   * production too — which means "no orders, so delete the profile" is not a
   * working plan without this statement, for a reason that has nothing to do with
   * orders at all.
   *
   * `order_events.changed_by` is the odd one out and is DETACHED rather than
   * deleted: it is `ON DELETE SET NULL` in Supabase, and the rows belong to other
   * people's orders. `validate_pickup_code` writes the caller's id there, so an
   * employee with no orders and no business can still be named on an event
   * ledger that is not theirs to erase.
   *
   * Not listed, because they cascade in BOTH places and are this account's own:
   * `marketing_preferences`, `segment_users`, `push_sends`, `saved_addresses`,
   * `business_ownership` (zero by the gate, and deleting a business here would
   * be the cascade disaster `countRetained` exists to prevent).
   *
   * ─── Y LAS MEMBRESÍAS, QUE ANTES DE ESTO NO TENÍAN GUARDA PROPIA ────────────
   *
   * `business_members.user_id` es `ON DELETE CASCADE` desde `profiles`, así que
   * borrar el perfil se lleva la fila de la membresía con él —y con ella el
   * alias, que el índice único `business_members_alias_key` NO libera a
   * propósito, y el registro de quién estuvo en el equipo. El trigger
   * `trg_enforce_owner_cannot_be_deleted` sólo protege las filas de DUEÑO
   * vivas: una fila de `staff` se la lleva la cascada sin que nadie lo note
   * (ítem 13 de la herencia).
   *
   * Por eso, si esta rama encontrara una membresía —VIVA o ya cerrada—, la
   * cierra y NO borra el perfil: el perfil es lo que cascadea, y borrarlo
   * dejaría la fila archivada en el aire. La puerta (`countRetained`) manda a
   * toda cuenta con membresía a la rama de anonimizar, que conserva el perfil;
   * esto es la defensa en profundidad para el caso de que la puerta se esquive.
   *
   * Y la LIBERACIÓN va antes que el archivado, por el mismo motivo que en
   * `anonymise`: la liberación exige que el actor sea el dueño vivo, y si las
   * membresías se cerraran primero la fila de `business_ownership` sobreviviría
   * nombrando a una persona que se va.
   *
   * One transaction: a partial erase is the one outcome that is worse than not
   * erasing at all.
   */
  async eraseAccount(userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await this.releaseOwnedBusinesses(tx, userId);

      const liveMembers = await tx
        .select({ id: businessMembers.id })
        .from(businessMembers)
        .where(eq(businessMembers.user_id, userId));

      if (liveMembers.length > 0) {
        const ids = liveMembers.map((member) => member.id);
        await tx
          .update(businessMembers)
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where(
            and(
              inArray(businessMembers.id, ids),
              isNull(businessMembers.deleted_at),
            ),
          );
        await tx
          .update(businessMemberLocations)
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where(inArray(businessMemberLocations.member_id, ids));

        // The profile stays: deleting it would take the closed memberships with
        // it, and a closed membership is still the record of who was here.
        return false;
      }

      await tx
        .delete(consumerNotificationPreferences)
        .where(eq(consumerNotificationPreferences.user_id, userId));
      await tx
        .delete(userPreferences)
        .where(eq(userPreferences.user_id, userId));
      await tx.delete(userConsents).where(eq(userConsents.user_id, userId));
      await tx.delete(deviceTokens).where(eq(deviceTokens.user_id, userId));
      await tx.delete(favorites).where(eq(favorites.user_id, userId));
      await tx
        .update(orderEvents)
        .set({ changed_by: null })
        .where(eq(orderEvents.changed_by, userId));

      const rows = await tx
        .delete(profiles)
        .where(eq(profiles.id, userId))
        .returning({ id: profiles.id });
      return rows.length > 0;
    });
  }
}
