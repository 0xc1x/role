import type { OrderTimelineEventDto } from '@0xc1x/role-commons';
import type { orderEvents as orderEventsTable } from '../../database/schema';

export type OrderEventRow = typeof orderEventsTable.$inferSelect;

/**
 * `order_events` rows → the public timeline entry.
 *
 * DO NOT "helpfully" add `metadata` or `changed_by` back to this projection.
 * Both are deliberately withheld, and each for a different reason:
 *
 * - `metadata` is internal machinery, not order state. It carries the dedupe
 *   keys and source markers written by the notification handlers (see
 *   `notification.handlers.ts`), so it describes how the API happened to notify
 *   somebody. Publishing it would freeze an implementation detail into the
 *   public contract and leak notification internals to any consumer that can
 *   read an order — including the business panel.
 * - `changed_by` is a profile uuid, i.e. a user identifier. The order response
 *   already carries the customer, and the acting user is an audit fact for
 *   support, not something a timeline entry needs: callers would only be able
 *   to resolve it to a name they already have (or, for a business-panel viewer,
 *   to an id they have no permission to turn into a profile). Exposing it adds
 *   an identifier with no useful meaning for the caller.
 *
 * `status`, `previous_status`, `reason` and `created_at` are what actually
 * answers "how did this order get here". If a future requirement needs more, it
 * needs a new field with its own justification — not this mapper widened.
 */
export class OrderEventMapper {
  static toTimelineEvent(row: OrderEventRow): OrderTimelineEventDto {
    return {
      status: row.status,
      previous_status: row.previous_status,
      reason: row.reason,
      created_at: row.created_at.toISOString(),
    };
  }
}
