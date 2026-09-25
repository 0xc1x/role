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

type OfferWebhook = {
	type?: string;
	record?: {
		id: string;
		business_id: string;
		title: string;
		discounted_price: number;
		is_active: boolean;
		image?: string | null;
	};
};

async function sendPush(
	userIds: string[],
	title: string,
	body: string,
	data: Record<string, string>,
) {
	const { error } = await supabase.functions.invoke("send-push-notification", {
		body: {
			user_ids: userIds,
			title,
			body,
			data,
			type: "favorite_alert",
		},
		headers: { Authorization: `Bearer ${serviceRoleKey}` },
	});
	if (error) {
		console.error(
			JSON.stringify({
				event: "offer_created_push_failed",
				...safeErrorFields(error),
			}),
		);
	}
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}
	// Fail closed: if the database cannot verify the shared secret, reject.
	if (!(await isInternalDispatch(req))) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	let webhook: OfferWebhook;
	try {
		webhook = (await req.json()) as OfferWebhook;
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	// The trigger only dispatches INSERT envelopes; anything else is a replay
	// or a misrouted call and must not fan out notifications.
	if (webhook.type !== "INSERT" || !webhook.record) {
		return json({ success: true, skipped: true });
	}

	const offer = webhook.record;
	if (!offer.is_active) {
		return json({ success: true, skipped: true, reason: "Offer inactive" });
	}

	// Fans out to everyone who favorited any offer of this business, so a new
	// listing reaches the audience that already follows the merchant.
	const { data: businessOffers } = await supabase
		.from("offers")
		.select("id")
		.eq("business_id", offer.business_id);
	const offerIds = (businessOffers ?? []).map((o) => o.id as string);
	if (offerIds.length === 0) {
		return json({ success: true, notified: 0 });
	}

	const { data: favs } = await supabase
		.from("favorites")
		.select("user_id")
		.in("offer_id", offerIds);
	const userIds = [
		...new Set((favs ?? []).map((f) => f.user_id as string)),
	].filter((id): id is string => Boolean(id));
	if (userIds.length === 0) {
		return json({ success: true, notified: 0 });
	}

	// Missing preference row means opted in, so only an explicit false opts out.
	const { data: prefs } = await supabase
		.from("consumer_notification_preferences")
		.select("user_id, push_enabled, favorite_alerts_enabled")
		.in("user_id", userIds);
	const targets = userIds.filter((uid) => {
		const p = (prefs ?? []).find((row) => row.user_id === uid);
		return (
			p?.push_enabled !== false && p?.favorite_alerts_enabled !== false
		);
	});
	if (targets.length === 0) {
		return json({ success: true, notified: 0 });
	}

	const { data: business } = await supabase
		.from("businesses")
		.select("name, image")
		.eq("id", offer.business_id)
		.single();
	const image =
		offer.image ?? (business as Record<string, string> | null)?.image ?? undefined;

	const data: Record<string, string> = {
		type: "favorite_alert",
		offer_id: offer.id,
		business_id: offer.business_id,
		link: `/offer/${offer.id}`,
		icon: "/icons/Icon-192.png",
		badge: "/icons/Icon-72.png",
		tag: `offer-${offer.id}`,
	};
	if (image) data.image = image;

	await sendPush(
		targets,
		`${business?.name ?? "Negocio"} publicó una nueva oferta`,
		`${offer.title} por $${offer.discounted_price}. ¡Rescátala antes de que se agote!`,
		data,
	);

	return json({ success: true, notified: targets.length });
});
