export interface ParsedPickupQr {
	orderId: string;
	pickupCode: string;
}

/**
 * Parses the consumer pickup QR payload and checks it targets the expected
 * order. Accepts both the current scheme (`role://order/{id}/{code}`) and
 * the legacy Rolé v1 one (`fudi://pickup/{id}/{code}`). Also tolerates a
 * bare 6-digit pickup code.
 */
export function parsePickupQr(
	raw: string,
	expectedOrderId: string,
): ParsedPickupQr | null {
	const value = raw.trim();

	const uri = value.match(/^([a-z]+):\/\/([^/]+)\/([^/]+)\/([^/]+)$/i);
	if (uri) {
		const scheme = uri[1].toLowerCase();
		const host = uri[2].toLowerCase();
		const orderId = uri[3];
		const pickupCode = uri[4];
		const isRole = scheme === "role" && host === "order";
		const isFudi = scheme === "fudi" && host === "pickup";
		if ((isRole || isFudi) && orderId === expectedOrderId && pickupCode.length > 0) {
			return { orderId, pickupCode };
		}
		return null;
	}

	if (/^\d{6}$/.test(value)) {
		return { orderId: expectedOrderId, pickupCode: value };
	}

	return null;
}