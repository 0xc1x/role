import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/http.ts";
import { isInternalDispatch } from "../_shared/internal-auth.ts";
import { safeErrorFields } from "../_shared/logging.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const EARTH_RADIUS_KM = 6371;

function haversineDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface BusinessLocation {
	id: string;
	business_id: string;
	latitude: number;
	longitude: number;
}

interface Offer {
	id: string;
	business_id: string;
	title: string;
	category: string | null;
	discounted_price: number;
	original_price: number;
	stock: number;
	pickup_end: string;
}

interface UserPref {
	user_id: string;
	notification_radius_km: number;
	favorite_categories: string[];
}

interface Business {
	id: string;
	name: string;
	slug: string;
}

async function sendPush(
	userIds: string[],
	title: string,
	body: string,
	data: Record<string, string>,
) {
	// functions.invoke does not send Authorization by default — set it explicitly.
	const { error } = await supabase.functions.invoke("send-push-notification", {
		body: { user_ids: userIds, title, body, data, type: "nearby_offer" },
		headers: { Authorization: `Bearer ${serviceRoleKey}` },
	});

	if (error) {
		console.error(
			JSON.stringify({
				event: "nearby_offer_push_failed",
				...safeErrorFields(error),
			}),
		);
	}
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}
	// Only the cron job (with the shared secret) triggers this job; this blocks
	// external invocations. Fail closed when the database cannot verify it.
	if (!(await isInternalDispatch(req))) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const now = new Date().toISOString();
	const { data: offers, error: offersError } = await supabase
		.from("offers")
		.select("id, business_id, title, category, discounted_price, original_price, stock, pickup_end")
		.eq("is_active", true)
		.gt("stock", 0)
		.lt("pickup_start", now)
		.gt("pickup_end", now);

	if (offersError) {
		console.error(
			JSON.stringify({
				event: "nearby_offers_query_failed",
				...safeErrorFields(offersError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}
	if (!offers?.length) {
		return json({ success: true, notified: 0 });
	}

	const businessIds = [...new Set(offers.map((o: Offer) => o.business_id))];

	const { data: businesses, error: businessesError } = await supabase
		.from("businesses")
		.select("id, name, slug")
		.in("id", businessIds);

	if (businessesError) {
		console.error(
			JSON.stringify({
				event: "nearby_businesses_query_failed",
				...safeErrorFields(businessesError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}

	const businessMap = new Map<string, Business>();
	for (const b of businesses ?? []) {
		businessMap.set(b.id, b as Business);
	}

	const { data: locations, error: locationsError } = await supabase
		.from("business_locations")
		.select("id, business_id, latitude, longitude")
		.in("business_id", businessIds)
		.eq("is_active", true);

	if (locationsError) {
		console.error(
			JSON.stringify({
				event: "nearby_locations_query_failed",
				...safeErrorFields(locationsError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}

	const { data: users, error: usersError } = await supabase
		.from("user_preferences")
		.select("user_id, notification_radius_km, favorite_categories")
		.eq("push_notifications_enabled", true);

	if (usersError) {
		console.error(
			JSON.stringify({
				event: "nearby_user_prefs_query_failed",
				...safeErrorFields(usersError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}

	if (!users?.length) {
		return json({ success: true, notified: 0 });
	}

	// Respect the "Last-minute deals" setting. No row = allowed.
	const userIds = users.map((u: UserPref) => u.user_id);
	const { data: consumerPrefs } = await supabase
		.from("consumer_notification_preferences")
		.select("user_id, last_minute_deals_enabled")
		.in("user_id", userIds);
	const lastMinuteOff = new Set(
		(consumerPrefs ?? [])
			.filter((p) => p.last_minute_deals_enabled === false)
			.map((p) => p.user_id),
	);

	const { data: addresses } = await supabase
		.from("saved_addresses")
		.select("user_id, latitude, longitude")
		.in("user_id", userIds)
		.eq("is_default", true);

	const userAddressMap = new Map<string, { lat: number; lon: number }>();
	for (const addr of addresses ?? []) {
		userAddressMap.set(addr.user_id, {
			lat: Number(addr.latitude),
			lon: Number(addr.longitude),
		});
	}

	let totalNotified = 0;

	for (const user of users as UserPref[]) {
		if (lastMinuteOff.has(user.user_id)) continue;

		const userAddr = userAddressMap.get(user.user_id);
		if (!userAddr) continue;

		const radiusKm = user.notification_radius_km;
		const favCategories = new Set(
			(user.favorite_categories ?? []).map((c: string) => c.toLowerCase()),
		);

		const matchingOffers: Array<{ offer: Offer; business: Business; distance: number }> = [];

		for (const offer of offers as Offer[]) {
			if (
				favCategories.size > 0 &&
				offer.category &&
				!favCategories.has(offer.category.toLowerCase())
			) {
				continue;
			}

			const business = businessMap.get(offer.business_id);
			if (!business) continue;

			const businessLocations = (locations ?? []).filter(
				(l: BusinessLocation) => l.business_id === offer.business_id,
			);

			if (businessLocations.length === 0) continue;

			let minDistance = Infinity;
			for (const loc of businessLocations as BusinessLocation[]) {
				const dist = haversineDistance(
					userAddr.lat,
					userAddr.lon,
					Number(loc.latitude),
					Number(loc.longitude),
				);
				if (dist < minDistance) minDistance = dist;
			}

			if (minDistance <= radiusKm) {
				matchingOffers.push({ offer, business, distance: Math.round(minDistance) });
			}
		}

		if (matchingOffers.length === 0) continue;

		const best = matchingOffers.sort((a, b) => a.distance - b.distance)[0];

		const discount = Math.round(
			((best.offer.original_price - best.offer.discounted_price) /
				best.offer.original_price) *
				100,
		);

		await sendPush(
			[user.user_id],
			`${best.business.name} — ¡${discount}% OFF!`,
			`${best.offer.title} a ${best.offer.discounted_price} — A ${best.distance}km de ti.`,
			{
				type: "nearby_offer",
				offer_id: best.offer.id,
				business_id: best.business.id,
				business_slug: best.business.slug,
				link: `/offer/${best.offer.id}`,
			},
		);

		totalNotified++;
	}

	return json({
		success: true,
		notified: totalNotified,
		total_offers: offers.length,
		total_users: users.length,
	});
});
