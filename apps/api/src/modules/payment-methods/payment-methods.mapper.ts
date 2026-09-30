import type { MyPaymentMethodDto } from '@0xc1x/role-commons';
import type { PaymentMethodRow } from './payment-methods.repository';

/**
 * Payment-method persistence rows → API DTOs.
 *
 * ─── PCI DSS: THIS METHOD IS THE PROJECTION, AND IT IS AN ALLOWLIST ───────
 *
 * `PaymentMethodRow` HAS a `gateway_token` field — it has to, because that is
 * the column the table holds and the mirror declares it. This mapper does not
 * use `select()`-shaped spread, `Omit<>` or a pick-by-exclusion to build the
 * DTO. It NAMES every field, and `gateway_token` is not one of the names.
 *
 * That is the whole guarantee, and it is worth being precise about why it is
 * shaped this way, because the obvious alternatives are all worse:
 *
 *  - `const { gateway_token, ...rest } = row; return rest;` compiles, and the
 *    next column added to the table is in the response with no edit here.
 *  - Returning `row` and letting Nest serialise it leaks the token today.
 *  - Returning the row and parsing it through `MyPaymentMethodSchema` looks like
 *    a filter and is not one: `z.object()` in Zod 4 STRIPS unknown keys, so it
 *    would drop the token and then be indistinguishable from this mapper — the
 *    safety would be indistinguishable from a coincidence, and it would move the
 *    boundary to a place that does not own it.
 *
 * The return type is `MyPaymentMethodDto`, which is `z.infer` of a schema that
 * has no `gateway_token` key at all, so a field added here that is not on the
 * contract is a compile error rather than a reviewer's job.
 *
 * THE HONEST LIMIT OF MAKING THE MAPPER THE BOUNDARY: the token does exist in
 * this process's memory for the duration of the call. The repository selects the
 * full row, and `setDefaultOwned` gets one back from `RETURNING`, so the column is
 * read out of Postgres and then dropped here. Nothing SERIALISES it and no log,
 * filter or interceptor sees it — this is about what can leave the process, not
 * about what briefly passes through it. A column-level projection on the SELECT
 * would narrow that window, but it would not close it: the `RETURNING` of the
 * promotion is full-row by convention, so the two would feed this one mapper two
 * different row shapes and buy a partial guarantee at the cost of a second type.
 * The allowlist plus the `MyPaymentMethodDto` return type is the coherent
 * boundary, and `payment-methods.service.db.spec.ts` asserts it against the real
 * returned object rather than against this comment.
 *
 * WHAT DOES CROSS THE WIRE: `brand`, `last4`, `exp_month`, `exp_year` and
 * `holder_name` are the display metadata and belong in the response — a card
 * list without them is a list of four digits with no owner. `user_id` is the
 * caller's own id, read from the ROW. `active` and `deleted_at` do NOT cross:
 * the list has already filtered them, so they could only ever be `true` and
 * `null`, and a client that has to filter again will eventually show a deleted
 * card.
 */
export class PaymentMethodsMapper {
  static toDto(row: PaymentMethodRow): MyPaymentMethodDto {
    return {
      id: row.id,
      user_id: row.user_id,
      gateway: row.gateway,
      brand: row.brand,
      last4: row.last4,
      exp_month: row.exp_month,
      exp_year: row.exp_year,
      holder_name: row.holder_name,
      is_default: row.is_default,
      created_at: row.created_at.toISOString(),
    };
  }
}
