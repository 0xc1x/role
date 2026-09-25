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

async function sendPush(userId: string, orderId: string, orderNumber: string) {
	const { error } = await supabase.functions.invoke("send-push-notification", {
		body: {
			user_ids: [userId],
			title: "Tu ventana de recogida cierra pronto",
			body: `Recoge tu pedido #${orderNumber} pronto.`,
			type: "pickup_reminder",
			data: {
				type: "pickup_reminder",
				order_id: orderId,
				order_number: orderNumber,
				link: `/order/${orderId}`,
			},
		},
		headers: { Authorization: `Bearer ${serviceRoleKey}` },
	});
	if (error) {
		console.error(JSON.stringify({ event: "pickup_reminder_push_failed", ...safeErrorFields(error) }));
	}
}

Deno.serve(async (request) => {
	if (request.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}
	if (!(await isInternalDispatch(request))) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const now = new Date();
	const horizon = new Date(now.getTime() + 2 * 60 * 60 * 1000);
	const { data: orders, error: ordersError } = await supabase
		.from("orders")
		.select("id, user_id, order_number, offer_id")
		.in("status", ["confirmed", "ready_for_pickup"])
		.limit(500);
	if (ordersError) {
		console.error(JSON.stringify({ event: "pickup_orders_query_failed", ...safeErrorFields(ordersError) }));
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}
	if (!orders?.length) return json({ success: true, notified: 0 });

	const offerIds = [...new Set(orders.map((order) => order.offer_id))];
	const { data: offers, error: offersError } = await supabase
		.from("offers")
		.select("id, pickup_end")
		.in("id", offerIds)
		.gte("pickup_end", now.toISOString())
		.lte("pickup_end", horizon.toISOString());
	if (offersError) {
		console.error(JSON.stringify({ event: "pickup_offers_query_failed", ...safeErrorFields(offersError) }));
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}
	const offerWindows = new Map(
		(offers ?? []).map((offer) => [offer.id, new Date(offer.pickup_end)]),
	);
	const candidates = orders.filter((order) => offerWindows.has(order.offer_id));
	if (!candidates.length) return json({ success: true, notified: 0 });

	const { data: existing, error: existingError } = await supabase
		.from("order_events")
		.select("order_id")
		.in(
			"order_id",
			candidates.map((order) => order.id),
		)
		.eq("metadata->>dedupe", "pickup_reminder");
	if (existingError) {
		console.error(JSON.stringify({ event: "pickup_existing_events_query_failed", ...safeErrorFields(existingError) }));
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}
	const reminded = new Set((existing ?? []).map((event) => event.order_id));

	let notified = 0;
	for (const order of candidates) {
		if (reminded.has(order.id)) continue;
		const { data: prefs } = await supabase
			.from("consumer_notification_preferences")
			.select("push_enabled, pickup_reminders_enabled")
			.eq("user_id", order.user_id)
			.maybeSingle();
		if (prefs?.push_enabled === false || prefs?.pickup_reminders_enabled === false) {
			continue;
		}

		await sendPush(order.user_id, order.id, order.order_number);
		const { error: markerError } = await supabase.from("order_events").insert({
			order_id: order.id,
			status: "pending",
			previous_status: null,
			changed_by: order.user_id,
			reason: "pickup reminder dedupe",
			metadata: { dedupe: "pickup_reminder" },
		});
		if (markerError) {
			console.error(JSON.stringify({ event: "pickup_reminder_marker_failed", ...safeErrorFields(markerError) }));
			continue;
		}
		notified += 1;
	}

	return json({ success: true, notified });
});
