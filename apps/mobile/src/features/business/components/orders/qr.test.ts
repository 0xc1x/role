import { describe, expect, it } from "bun:test";

import { parsePickupQr } from "./qr";

const ORDER_ID = "order-abc-123";

describe("parsePickupQr", () => {
	it("parses the current role://order scheme", () => {
		expect(parsePickupQr(`role://order/${ORDER_ID}/284731`, ORDER_ID)).toEqual({
			orderId: ORDER_ID,
			pickupCode: "284731",
		});
	});

	it("parses the legacy fudi://pickup scheme", () => {
		expect(parsePickupQr(`fudi://pickup/${ORDER_ID}/123456`, ORDER_ID)).toEqual({
			orderId: ORDER_ID,
			pickupCode: "123456",
		});
	});

	it("is case-insensitive on scheme and host", () => {
		expect(parsePickupQr(`ROLE://ORDER/${ORDER_ID}/111222`, ORDER_ID)).toEqual({
			orderId: ORDER_ID,
			pickupCode: "111222",
		});
	});

	it("rejects a QR that belongs to another order", () => {
		expect(parsePickupQr(`role://order/other-order/284731`, ORDER_ID)).toBeNull();
	});

	it("rejects a QR with a wrong host or scheme", () => {
		expect(parsePickupQr(`role://fake/${ORDER_ID}/284731`, ORDER_ID)).toBeNull();
		expect(parsePickupQr(`https://order/${ORDER_ID}/284731`, ORDER_ID)).toBeNull();
	});

	it("rejects malformed payloads", () => {
		expect(parsePickupQr("", ORDER_ID)).toBeNull();
		expect(parsePickupQr("role://order/", ORDER_ID)).toBeNull();
		expect(parsePickupQr("not a qr", ORDER_ID)).toBeNull();
	});

	it("tolerates a bare 6-digit pickup code", () => {
		expect(parsePickupQr("284731", ORDER_ID)).toEqual({
			orderId: ORDER_ID,
			pickupCode: "284731",
		});
	});

	it("rejects bare codes that are not 6 digits", () => {
		expect(parsePickupQr("28473", ORDER_ID)).toBeNull();
		expect(parsePickupQr("2847310", ORDER_ID)).toBeNull();
	});
});