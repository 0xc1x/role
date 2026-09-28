import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { badRequest, json } from "../_shared/http.ts";
import { isInternalDispatch } from "../_shared/internal-auth.ts";
import { safeErrorFields } from "../_shared/logging.ts";
import {
  decidePushes,
  isNotAnInsert,
  type OrderEvent,
} from "../_shared/order-event-decisions.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

async function sendPush(
	userIds: string[],
	title: string,
	body: string,
	data: Record<string, string>,
) {
	const { error } = await supabase.functions.invoke("send-push-notification", {
		body: { user_ids: userIds, title, body, data, type: data.type ?? "order" },
		headers: { Authorization: `Bearer ${serviceRoleKey}` },
	});
	if (error) {
		console.error(JSON.stringify({ event: "order_push_failed", ...safeErrorFields(error) }));
	}
}

Deno.serve(async (request) => {
	if (request.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}
	if (!(await isInternalDispatch(request))) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	let webhook: { type?: string; record?: OrderEvent };
	try {
		webhook = (await request.json()) as { type?: string; record?: OrderEvent };
	} catch {
		return badRequest("Invalid JSON body");
	}
	if (isNotAnInsert(webhook)) {
		return json({ success: true, skipped: true });
	}
	const event = webhook.record!;

	const { data: order, error: orderError } = await supabase
		.from("orders")
		.select("id, user_id, business_id, order_number, offer_id")
		.eq("id", event.order_id)
		.single();
	if (orderError || !order) {
		if (orderError) {
			console.error(JSON.stringify({ event: "order_lookup_failed", ...safeErrorFields(orderError) }));
		}
		return json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
	}

	// Ownership lives in `business_ownership`: the `businesses.owner_id` column is
	// dropped when the sensitive columns move to the companion tables, and a
	// business is expected to have exactly one owner row, so `maybeSingle` keeps a
	// missing owner from failing the whole lookup.
	const [{ data: business }, { data: offer }, { data: ownership }] = await Promise.all([
		supabase.from("businesses").select("name, image").eq("id", order.business_id).single(),
		supabase.from("offers").select("image").eq("id", order.offer_id).single(),
		supabase.from("business_ownership").select("owner_id").eq("business_id", order.business_id).maybeSingle(),
	]);

	const { data: consumerPrefs } = await supabase
		.from("consumer_notification_preferences")
		.select("push_enabled")
		.eq("user_id", order.user_id)
		.maybeSingle();

	// Read only when the business would be notified anyway, exactly as before the
	// split. The decision module takes the rows as given; deciding WHICH rows to
	// fetch stays here, because that is I/O and not a rule.
	const businessOwnerId = ownership?.owner_id ?? null;
	const businessWouldBeNotified =
		["pending", "confirmed", "cancelled", "expired"].includes(event.status) &&
		!!businessOwnerId;
	const { data: businessPrefs } = businessWouldBeNotified
		? await supabase
				.from("business_notification_preferences")
				.select("push_enabled, new_orders_enabled")
				.eq("business_id", order.business_id)
				.maybeSingle()
		: { data: null };

	const decision = decidePushes({
		event,
		order,
		business,
		offer,
		ownership,
		consumerPrefs,
		businessPrefs,
	});

	if (decision.kind === "skip") {
		return json({ success: true, skipped: true, reason: decision.reason });
	}

	for (const plan of decision.pushes) {
		await sendPush(plan.userIds, plan.title, plan.body, plan.data);
	}

	return json({ success: true });
});
