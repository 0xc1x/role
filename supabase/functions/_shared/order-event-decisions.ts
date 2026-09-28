/**
 * The decision half of `handle-order-event`, with no I/O in it.
 *
 * ─── WHY THIS IS A SEPARATE FILE ────────────────────────────────────────────
 *
 * `index.ts` cannot be imported by the test runner. It opens with
 * `import "jsr:@supabase/functions-js/edge-runtime.d.ts"` and
 * `npm:@supabase/supabase-js@2`, which are Deno specifiers `bun test` cannot
 * resolve, and it calls `Deno.serve` at module scope, which has no meaning
 * outside the edge runtime. So the table of decisions — which recipients get a
 * push, with which title, and under which preferences — was unreachable from
 * `bun test supabase` and therefore untested, while being the part of the
 * function most likely to be wrong.
 *
 * The split is deliberate and narrow: everything that decides lives here, and
 * `index.ts` keeps only auth, parsing, the five database reads and the dispatch.
 * Nothing about a notification is decided at the call site any more, which is
 * also why there is exactly one place to look when a push stops arriving.
 *
 * Behaviour is unchanged. This is a move, not a rewrite, and the test file is
 * written against the behaviour as it was on disk before the split.
 *
 * ─── WHY IT IS PURE, NOT A SERVICE ──────────────────────────────────────────
 *
 * The inputs are the rows the function already fetched. Making this a class
 * with a client would have moved the same decisions somewhere a test still
 * cannot reach, and the two-personality option of passing a mock around is what
 * makes a "pure" module quietly stop being one.
 */

/** The row `order_events` carries, as the webhook hands it over. */
export type OrderEvent = {
  order_id: string;
  status: string;
  metadata?: Record<string, unknown> | null;
};

export type Order = {
  id: string;
  user_id: string;
  business_id: string;
  order_number: string;
  offer_id: string;
};

export type PushPlan = {
  /** Which audience this is for. Recorded so the caller cannot send it to both. */
  audience: "consumer" | "business";
  userIds: string[];
  title: string;
  body: string;
  data: Record<string, string>;
};

export type Decision =
  /** Nothing to do, and the reason is part of the answer. */
  | { kind: "skip"; reason: string }
  | { kind: "push"; pushes: PushPlan[] };

/** Statuses the business is told about. The consumer is told about all of them. */
const BUSINESS_NOTIFIED: readonly string[] = [
  "pending",
  "confirmed",
  "cancelled",
  "expired",
];

const labels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  ready_for_pickup: "Listo para recoger",
  picked_up: "Recogido",
  completed: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

/**
 * Copy a person reads on a lock screen, and it is verbatim: it moved here from
 * `index.ts`, where it had lived since the function was written.
 *
 * An earlier version of this split "improved" six of these strings in passing,
 * which made a refactor that claimed to change nothing quietly change what the
 * product says to its users. The `copy is a contract, not a draft` test exists
 * because of that, not because the strings needed covering on their own merits.
 */
const messages: Record<string, { consumer: string; business: string }> = {
  pending: {
    consumer: "Reserva creada. Espera la confirmación del negocio.",
    business: "Nueva reserva recibida. Confirma el pedido.",
  },
  confirmed: {
    consumer: "Tu pedido ha sido confirmado. Prepara tu código de recogida.",
    business: "Nuevo pedido confirmado. Prepara el pedido.",
  },
  ready_for_pickup: {
    consumer: "Tu pedido está listo para recoger.",
    business: "El pedido está marcado como listo para recoger.",
  },
  picked_up: {
    consumer: "Gracias por recoger tu pedido. ¡Buen provecho!",
    business: "El cliente ha recogido su pedido.",
  },
  completed: {
    consumer: "Pedido completado. Cuéntanos cómo fue tu experiencia.",
    business: "Pedido completado exitosamente.",
  },
  cancelled: {
    consumer: "Tu pedido ha sido cancelado.",
    business: "El pedido ha sido cancelado.",
  },
  expired: {
    consumer: "El tiempo para recoger tu pedido ha expirado.",
    business: "El pedido ha expirado por falta de recogida.",
  },
};

/**
 * An unknown status still gets a notification, labelled with the raw value.
 *
 * The enum grows, and a status this build has never heard of is still a state a
 * consumer is looking at on a screen. Falling back to `undefined` would send
 * them a push with `undefined` in the title.
 */
export function labelFor(status: string): string {
  return labels[status] ?? status;
}

/**
 * The order-event push trigger writes its own `order_events` row to mark a
 * pickup reminder as sent, and that row is an `INSERT` on the same table this
 * function listens to. Without this the reminder dispatches itself forever.
 *
 * That the marker is a row rather than a flag is why it is checked here and not
 * in the trigger: the trigger cannot know the difference between its own write
 * and a real state change.
 */
export function isInternalMarker(event: OrderEvent): boolean {
  return event.metadata?.dedupe === "pickup_reminder";
}

/**
 * True when the payload is not a state change to act on.
 *
 * The envelope is the contract with `handle_order_event_push()`: it sends
 * `{type, table, schema, record}` and a function that ignores `type` will answer
 * a DELETE or a truncated payload by looking up an order that may be long gone.
 */
export function isNotAnInsert(
  webhook: { type?: string; record?: OrderEvent } | null,
): boolean {
  return webhook?.type !== "INSERT" || !webhook.record;
}

export function decidePushes(input: {
  event: OrderEvent;
  order: Order;
  business: { name?: string; image?: string | null } | null;
  offer: { image?: string | null } | null;
  ownership: { owner_id?: string | null } | null;
  consumerPrefs: { push_enabled?: boolean | null } | null;
  businessPrefs: {
    push_enabled?: boolean | null;
    new_orders_enabled?: boolean | null;
  } | null;
}): Decision {
  const { event, order, business, offer, ownership } = input;
  const consumerPrefs = input.consumerPrefs;
  const businessPrefs = input.businessPrefs;

  if (isInternalMarker(event)) {
    return { kind: "skip", reason: "Internal marker" };
  }

  const businessOwnerId = ownership?.owner_id ?? null;
  const businessName = business?.name ?? "Negocio";
  const label = labelFor(event.status);
  const image = offer?.image ?? business?.image ?? undefined;

  const baseData: Record<string, string> = {
    type: "order",
    order_id: order.id,
    order_number: order.order_number,
    status: event.status,
    link: `/order/${order.id}`,
    icon: "/icons/Icon-192.png",
    badge: "/icons/Icon-72.png",
    tag: `order-${order.id}-${event.status}`,
    ...(image ? { image } : {}),
  };

  const pushes: PushPlan[] = [];

  // A MISSING preferences row means enabled. `?.push_enabled !== false` treats
  // absent and null as "send", so a consumer who has never opened the
  // notification screen is reachable — and that is the reading the product wants.
  // It is also why this is a `!== false` and not a truthiness check, and it is
  // the single line in this function most likely to be "fixed" by someone who
  // reads it as a typo.
  if (consumerPrefs?.push_enabled !== false) {
    pushes.push({
      audience: "consumer",
      userIds: [order.user_id],
      title: `${businessName} — ${label}`,
      body:
        messages[event.status]?.consumer ?? `Tu pedido cambió a ${label}`,
      data: baseData,
    });
  }

  // The business hears about fewer states than the consumer: a reservation it
  // has not accepted, or the pickup it has already handled, is not news.
  //
  // `new_orders_enabled` gates ONLY `pending`. It is a preference about NEW
  // business, so letting it silence a cancellation would be reading it as
  // "stop telling me about my orders".
  if (BUSINESS_NOTIFIED.includes(event.status) && businessOwnerId) {
    const newOrderAllowed = businessPrefs?.new_orders_enabled !== false;
    if (
      businessPrefs?.push_enabled !== false &&
      (event.status !== "pending" || newOrderAllowed)
    ) {
      pushes.push({
        audience: "business",
        userIds: [businessOwnerId],
        title:
          event.status === "pending"
            ? `Nueva reserva #${order.order_number} — ${businessName}`
            : `Pedido #${order.order_number} — ${label}`,
        body:
          messages[event.status]?.business ??
          `Pedido ${order.order_number} → ${label}`,
        data: {
          ...baseData,
          role: "business",
          link: "/(business)/orders",
          tag: `order-${order.id}-biz-${event.status}`,
        },
      });
    }
  }

  return { kind: "push", pushes };
}
