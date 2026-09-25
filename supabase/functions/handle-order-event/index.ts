import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { badRequest, json } from "../_shared/http.ts";
import { isInternalDispatch } from "../_shared/internal-auth.ts";
import { safeErrorFields } from "../_shared/logging.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

type OrderEvent = {
	order_id: string;
	status: string;
	metadata?: Record<string, unknown> | null;
};

const labels: Record<string, string> = {
	pending: "Pendiente",
	confirmed: "Confirmado",
	ready_for_pickup: "Listo para recoger",
	picked_up: "Recogido",
	completed: "Completado",
	cancelled: "Cancelado",
	expired: "Expirado",
};

const messages: Record<string, { consumer: string; business: string }> = {
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
	if (webhook.type !== "INSERT" || !webhook.record) {
		return json({ success: true, skipped: true });
	}
	const event = webhook.record;
	if (event.metadata?.dedupe === "pickup_reminder") {
		return json({ success: true, skipped: true, reason: "Internal marker" });
	}

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

	const [{ data: business }, { data: offer }] = await Promise.all([
		supabase.from("businesses").select("name, image, owner_id").eq("id", order.business_id).single(),
		supabase.from("offers").select("image").eq("id", order.offer_id).single(),
	]);
	const businessName = business?.name ?? "Negocio";
	const label = labels[event.status] ?? event.status;
	const image = offer?.image ?? business?.image ?? undefined;
	const baseData: Record<string, string> = {
		type: "order",
		order_id: order.id,
		order_number: order.order_number,
		status: event.status,
		link: `/order/${order.id}`,
		icon: "/icons/Icon-192.png",
		badge: "/icons/Icon-72.png",
		tag: `order-${order.id}-${event.status}`,
		...(image ? { image } : {}),
	};

	const { data: consumerPrefs } = await supabase
		.from("consumer_notification_preferences")
		.select("push_enabled")
		.eq("user_id", order.user_id)
		.maybeSingle();
	if (consumerPrefs?.push_enabled !== false) {
		await sendPush(
			[order.user_id],
			`${businessName} — ${label}`,
			messages[event.status]?.consumer ?? `Tu pedido cambió a ${label}`,
			baseData,
		);
	}

	if (["pending", "confirmed", "cancelled", "expired"].includes(event.status) && business?.owner_id) {
		const { data: businessPrefs } = await supabase
			.from("business_notification_preferences")
			.select("push_enabled, new_orders_enabled")
			.eq("business_id", order.business_id)
			.maybeSingle();
		const newOrderAllowed = businessPrefs?.new_orders_enabled !== false;
		if (businessPrefs?.push_enabled !== false && (event.status !== "pending" || newOrderAllowed)) {
			await sendPush(
				[business.owner_id],
				event.status === "pending"
					? `Nueva reserva #${order.order_number} — ${businessName}`
					: `Pedido #${order.order_number} — ${label}`,
				messages[event.status]?.business ?? `Pedido ${order.order_number} → ${label}`,
				{
					...baseData,
					role: "business",
					link: "/(business)/orders",
					tag: `order-${order.id}-biz-${event.status}`,
				},
			);
		}
	}

	return json({ success: true });
});
