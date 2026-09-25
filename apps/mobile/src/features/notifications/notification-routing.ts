export type NotificationData = Record<string, unknown>;

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/** Maps trusted notification payload data to an internal Expo Router path. */
export function resolveNotificationRoute(
	data: NotificationData,
): string | null {
	const role = stringValue(data.role);
	const orderId = stringValue(data.order_id);
	const offerId = stringValue(data.offer_id);

	if (role === "business" && orderId) return "/(business)/orders";
	if (orderId) return `/order/${encodeURIComponent(orderId)}`;
	if (offerId) return `/offer/${encodeURIComponent(offerId)}`;

	const link = stringValue(data.link);
	if (link?.startsWith("/") && !link.startsWith("//")) return link;
	return null;
}
