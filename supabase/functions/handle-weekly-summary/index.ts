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

async function sendPush(
	userIds: string[],
	title: string,
	body: string,
	data: Record<string, string>,
) {
	const { error } = await supabase.functions.invoke("send-push-notification", {
		body: { user_ids: userIds, title, body, data, type: "weekly_summary" },
		headers: { Authorization: `Bearer ${serviceRoleKey}` },
	});

	if (error) {
		console.error(
			JSON.stringify({
				event: "weekly_summary_push_failed",
				...safeErrorFields(error),
			}),
		);
	}
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return json({ error: "Method not allowed" }, { status: 405 });
	}

	// Only the cron job (with the shared secret) triggers this job.
	if (!(await isInternalDispatch(req))) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	// Users with the weekly summary allowed (no row = allowed).
	const { data: prefs, error: prefsError } = await supabase
		.from("consumer_notification_preferences")
		.select("user_id")
		.neq("push_enabled", false)
		.neq("weekly_summary_enabled", false);

	if (prefsError) {
		console.error(
			JSON.stringify({
				event: "weekly_summary_prefs_query_failed",
				...safeErrorFields(prefsError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}

	const targets = (prefs ?? []).map((p) => p.user_id);
	if (targets.length === 0) {
		return json({ success: true, notified: 0 });
	}

	// Orders completed in the last 7 days for those users.
	const { data: orders, error: ordersError } = await supabase
		.from("orders")
		.select("id, user_id, price, original_price")
		.in("user_id", targets)
		.eq("status", "completed")
		.gte("created_at", weekAgo.toISOString());

	if (ordersError) {
		console.error(
			JSON.stringify({
				event: "weekly_summary_orders_query_failed",
				...safeErrorFields(ordersError),
			}),
		);
		return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
	}

	if (!orders?.length) {
		return json({ success: true, notified: 0 });
	}

	let notified = 0;
	for (const userId of targets) {
		const userOrders = orders.filter((o) => o.user_id === userId);
		if (userOrders.length === 0) continue;

		const saved = userOrders.reduce(
			(sum, o) => sum + Math.max(0, (o.original_price ?? 0) - (o.price ?? 0)),
			0,
		);

		await sendPush(
			[userId],
			"Tu resumen semanal en Rolé",
			`Rescataste ${userOrders.length} ${userOrders.length === 1 ? "pedido" : "pedidos"} esta semana y ahorraste $${saved.toFixed(2)}.`,
			{
				type: "weekly_summary",
				link: "/(consumer)/profile/orders",
			},
		);
		notified++;
	}

	return json({ success: true, notified });
});
