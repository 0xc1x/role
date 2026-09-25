import { describe, expect, test } from "bun:test";

import { resolveNotificationRoute } from "./notification-routing";

describe("notification routing", () => {
  test("routes consumer order notifications to the order screen", () => {
    expect(resolveNotificationRoute({ order_id: "order-1" })).toBe(
      "/order/order-1",
    );
  });

  test("routes business order notifications to the business orders screen", () => {
    expect(
      resolveNotificationRoute({ role: "business", order_id: "order-1" }),
    ).toBe("/(business)/orders");
  });

  test("routes offer notifications to the offer screen", () => {
    expect(resolveNotificationRoute({ offer_id: "offer-1" })).toBe(
      "/offer/offer-1",
    );
  });

  test("accepts internal links and rejects external or empty targets", () => {
    expect(resolveNotificationRoute({ link: "/orders" })).toBe("/orders");
    expect(
      resolveNotificationRoute({ link: "https://example.com" }),
    ).toBeNull();
    expect(resolveNotificationRoute({})).toBeNull();
  });
});
