import { describe, expect, test } from "bun:test";
import {
  decidePushes,
  isInternalMarker,
  isNotAnInsert,
  labelFor,
  type Order,
  type OrderEvent,
  type PushPlan,
} from "./order-event-decisions.ts";

/**
 * `handle-order-event` decides who hears about an order state change. None of
 * that was reachable from `bun test supabase` before the decision module was
 * split out of `index.ts`, because `index.ts` opens with Deno-only specifiers and
 * calls `Deno.serve` at module scope.
 *
 * The cases below are ordered by what breaks silently. A wrong recipient is a
 * missed order; a wrong title is a push a person cannot place; a preference read
 * the wrong way is one of the two ways round, and the default in this function
 * is the surprising one.
 */

const ORDER: Order = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  business_id: "33333333-3333-3333-3333-333333333333",
  order_number: "ROL-1042",
  offer_id: "44444444-4444-4444-4444-444444444444",
};

const OWNER = "55555555-5555-5555-5555-555555555555";

const event = (status: string, metadata?: OrderEvent["metadata"]): OrderEvent => ({
  order_id: ORDER.id,
  status,
  ...(metadata ? { metadata } : {}),
});

/** Everything present and permissive, so one test varies one thing. */
const happy = {
  event: event("confirmed"),
  order: ORDER,
  business: { name: "Panadería Falsa", image: "https://img/b.png" },
  offer: { image: "https://img/o.png" },
  ownership: { owner_id: OWNER },
  consumerPrefs: { push_enabled: true },
  businessPrefs: { push_enabled: true, new_orders_enabled: true },
} as const;

const decide = (over: Partial<Parameters<typeof decidePushes>[0]> = {}) =>
  decidePushes({ ...happy, ...over });

const pushes = (
  over: Partial<Parameters<typeof decidePushes>[0]> = {},
): PushPlan[] => {
  const d = decide(over);
  if (d.kind !== "push") throw new Error(`expected pushes, got skip: ${d.reason}`);
  return d.pushes;
};

const audiences = (over: Partial<Parameters<typeof decidePushes>[0]> = {}) =>
  pushes(over).map((p) => p.audience);

/**
 * Selected BY audience rather than by index.
 *
 * The order the two pushes come back in is an implementation detail, and a test
 * that reaches for `[0]` to mean "the consumer" passes today and starts lying
 * the first time the consumer is decided after the business — which is a change
 * nobody would think to look at here.
 */
const byAudience = (
  audience: PushPlan["audience"],
  over: Partial<Parameters<typeof decidePushes>[0]> = {},
): PushPlan => {
  const found = pushes(over).find((p) => p.audience === audience);
  if (!found) throw new Error(`no ${audience} push in ${JSON.stringify(audiences(over))}`);
  return found;
};

describe("the webhook envelope is not an event until it says it is one", () => {
  test("a DELETE-shaped payload is skipped, not looked up", () => {
    // The trigger sends `{type, table, schema, record}` and nothing else. A
    // function that ignored `type` would try to resolve an order for a payload
    // that describes a deletion, and answer 404 for a reason that has nothing
    // to do with the order.
    expect(isNotAnInsert({ type: "DELETE", record: event("confirmed") })).toBe(true);
    expect(isNotAnInsert({ type: "UPDATE", record: event("confirmed") })).toBe(true);
  });

  test("a payload with the right type but no record is skipped", () => {
    // This is the truncation case: `type` arrives and `record` does not. Reading
    // `record.order_id` first would throw a TypeError and return a 500 for a
    // malformed payload that is not an error at all.
    expect(isNotAnInsert({ type: "INSERT" })).toBe(true);
    expect(isNotAnInsert({ type: "INSERT", record: undefined })).toBe(true);
    expect(isNotAnInsert(null)).toBe(true);
  });

  test("a real INSERT passes", () => {
    expect(isNotAnInsert({ type: "INSERT", record: event("confirmed") })).toBe(
      false,
    );
  });
});

describe("the pickup reminder does not dispatch itself", () => {
  test("a row marked as the internal dedupe marker is skipped", () => {
    // `handle_order_event_push` writes its own `order_events` row to mark the
    // reminder sent, and that row is an INSERT on the table this function
    // listens to. Without the marker check the reminder fires forever, and it
    // looks completely normal in the logs — one event, one push, no error.
    expect(isInternalMarker(event("ready_for_pickup", { dedupe: "pickup_reminder" }))).toBe(
      true,
    );
    const decision = decide({
      event: event("ready_for_pickup", { dedupe: "pickup_reminder" }),
    });
    expect(decision).toEqual({ kind: "skip", reason: "Internal marker" });
  });

  test("a real order event with metadata is not mistaken for one", () => {
    // The marker lives in `metadata`, so ordinary metadata must not trip it.
    expect(isInternalMarker(event("confirmed", { source: "app" }))).toBe(false);
    expect(isInternalMarker(event("confirmed"))).toBe(false);
  });
});

describe("a status the build does not know is still a status the user is looking at", () => {
  test("an unknown status falls back to its raw value rather than undefined", () => {
    // The enum grows. A consumer staring at a screen showing a state this build
    // has never heard of should get a push with that value in it, not one with
    // the word `undefined` in the title.
    expect(labelFor("picked_up")).toBe("Recogido");
    expect(labelFor("brand_new_state")).toBe("brand_new_state");
  });

  test("an unknown status reaches the consumer with a readable body", () => {
    const [consumer] = pushes({ event: event("brand_new_state") });
    expect(consumer.title).toBe("Panadería Falsa — brand_new_state");
    expect(consumer.body).toBe("Tu pedido cambió a brand_new_state");
  });
});

describe("a missing preferences row means ENABLED, and that is the whole point", () => {
  test("the consumer with no preferences row at all is reached", () => {
    // `?.push_enabled !== false` treats absent, null and undefined as "send". A
    // consumer who has never opened the notification screen has no row, and
    // writing this as a truthiness check would silently make every first-time
    // user unreachable — the most common state there is.
    expect(audiences({ consumerPrefs: null })).toContain("consumer");
    expect(audiences({ consumerPrefs: { push_enabled: null } })).toContain("consumer");
  });

  test("an explicit false is the only thing that silences them", () => {
    const only = pushes({ consumerPrefs: { push_enabled: false } });
    expect(only.map((p) => p.audience)).toEqual(["business"]);
  });

  test("the business with no preferences row at all is reached", () => {
    expect(audiences({ businessPrefs: null })).toContain("business");
  });

  test("an explicit false silences the business too", () => {
    const only = pushes({ businessPrefs: { push_enabled: false } });
    expect(only.map((p) => p.audience)).toEqual(["consumer"]);
  });
});

describe("new_orders_enabled is about NEW business, not about all business", () => {
  test("turning it off silences the reservation and nothing else", () => {
    // This is the asymmetry worth a test of its own. It reads naturally as "stop
    // telling me about my orders", and used that way a business owner who muted
    // new reservations would stop hearing about cancellations too.
    const off = { push_enabled: true, new_orders_enabled: false };
    expect(audiences({ event: event("pending"), businessPrefs: off })).toEqual([
      "consumer",
    ]);
    expect(audiences({ event: event("cancelled"), businessPrefs: off })).toEqual([
      "consumer",
      "business",
    ]);
  });

  test("it does not apply to the other three states the business hears about", () => {
    const off = { push_enabled: true, new_orders_enabled: false };
    for (const status of ["confirmed", "cancelled", "expired"]) {
      expect(audiences({ event: event(status), businessPrefs: off })).toContain(
        "business",
      );
    }
  });
});

describe("the business hears about fewer states than the consumer", () => {
  test("a reservation, a confirmation, a cancellation and an expiry reach it", () => {
    for (const status of ["pending", "confirmed", "cancelled", "expired"]) {
      expect(audiences({ event: event(status) })).toContain("business");
    }
  });

  test("a pickup it has already handled is not news", () => {
    // `ready_for_pickup` and `picked_up` are the business's own actions. Telling
    // it about them is a notification about a notification.
    for (const status of ["ready_for_pickup", "picked_up"]) {
      expect(audiences({ event: event(status) })).toEqual(["consumer"]);
    }
  });

  test("the consumer hears about every state there is", () => {
    for (const status of Object.keys({
      pending: 1, confirmed: 1, ready_for_pickup: 1, picked_up: 1,
      completed: 1, cancelled: 1, expired: 1,
    })) {
      expect(audiences({ event: event(status) })).toContain("consumer");
    }
  });

  test("a business with no ownership row is not notified at all", () => {
    // Ownership moved to `business_ownership` and `maybeSingle` tolerates a
    // missing row. Tolerating it must not turn into guessing an owner, and
    // `user_id` is the consumer's, never a substitute.
    const only = pushes({ ownership: null });
    expect(only.map((p) => p.audience)).toEqual(["consumer"]);
    expect(only[0].userIds).toEqual([ORDER.user_id]);
  });
});

describe("a recipient and a link that place the push", () => {
  test("the reservation goes to the owner and not to the consumer", () => {
    const biz = byAudience("business", { event: event("pending") });
    expect(biz.userIds).toEqual([OWNER]);
    expect(biz.title).toBe("Nueva reserva #ROL-1042 — Panadería Falsa");
    expect(biz.data.link).toBe("/(business)/orders");
    expect(biz.data.role).toBe("business");
  });

  test("every other business notification is worded as an order, not a reservation", () => {
    expect(byAudience("business", { event: event("confirmed") }).title).toBe(
      "Pedido #ROL-1042 — Confirmado",
    );
  });

  test("the consumer push links into the consumer's order screen", () => {
    const consumer = byAudience("consumer");
    expect(consumer.userIds).toEqual([ORDER.user_id]);
    expect(consumer.data.link).toBe(`/order/${ORDER.id}`);
    expect(consumer.data.role).toBeUndefined();
  });

  test("the two audiences never collapse onto the same tag", () => {
    // The tag is the deduplication key the push provider uses. If the consumer
    // and the business shared one, the second send would be swallowed as a
    // duplicate of the first and the business would hear nothing.
    const both = pushes({ event: event("pending") });
    const tags = both.map((p) => p.data.tag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags).toContain(`order-${ORDER.id}-pending`);
    expect(tags).toContain(`order-${ORDER.id}-biz-pending`);
  });
});

describe("names and images fall back rather than rendering empty", () => {
  test("a business with no name still produces a title", () => {
    const [consumer] = pushes({ business: null });
    expect(consumer.title).toBe("Negocio — Confirmado");
  });

  test("the offer's image wins over the business's", () => {
    const [consumer] = pushes();
    expect(consumer.data.image).toBe("https://img/o.png");
  });

  test("the business's image is the fallback", () => {
    const [consumer] = pushes({ offer: { image: null } });
    expect(consumer.data.image).toBe("https://img/b.png");
  });

  test("with no image at all the key is absent, not empty", () => {
    // An empty `image` string is not the same as none: the mobile client decides
    // whether to render a placeholder on the presence of the key.
    const [consumer] = pushes({ offer: { image: null }, business: null });
    expect("image" in consumer.data).toBe(false);
  });
});

describe("copy is a contract, not a draft", () => {
  // These strings are what a person reads on a lock screen, and they moved
  // verbatim from `index.ts`. While splitting the decision module out, six of
  // them were rewritten in passing — a refactor that announced it changed
  // nothing had changed what the product says to its users, and nothing in the
  // suite would have said so.
  //
  // Asserting the whole table, rather than the one case each test happens to
  // use, is what makes the next "harmless" edit fail.
  test("every status keeps the copy it shipped with", () => {
    const expected: Record<string, { consumer: string; business: string }> = {
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

    for (const [status, copy] of Object.entries(expected)) {
      const event_ = event(status);
      // Only the states the business hears about produce a business push, so
      // the business half is read off the one that does and the other three are
      // covered by the consumer assertions.
      const consumer = byAudience("consumer", { event: event_ }).body;
      expect({ status, consumer }).toEqual({ status, consumer: copy.consumer });
      if (["pending", "confirmed", "cancelled", "expired"].includes(status)) {
        expect(byAudience("business", { event: event_ }).body).toBe(copy.business);
      }
    }
  });
});

describe("the payload the trigger sends is what the decision reads", () => {
  test("the base data carries everything the mobile client needs to route", () => {
    const [consumer] = pushes();
    expect(consumer.data).toEqual({
      type: "order",
      order_id: ORDER.id,
      order_number: "ROL-1042",
      status: "confirmed",
      link: `/order/${ORDER.id}`,
      icon: "/icons/Icon-192.png",
      badge: "/icons/Icon-72.png",
      tag: `order-${ORDER.id}-confirmed`,
      image: "https://img/o.png",
    });
  });

  test("a status the table does not have still flows through the base data", () => {
    const [consumer] = pushes({ event: event("brand_new_state") });
    expect(consumer.data.status).toBe("brand_new_state");
    expect(consumer.data.tag).toBe(`order-${ORDER.id}-brand_new_state`);
  });
});
