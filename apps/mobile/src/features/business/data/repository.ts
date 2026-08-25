import { Platform } from "react-native";
import type {
	Business,
	BusinessLocation,
	BusinessType,
	Coupon,
	Payout,
} from "@0xc1x/role-commons";
import { File } from "expo-file-system";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";
import { Errors } from "@/core/error/app-error";

import type { OfferDetail } from "@/features/offers/domain/offer";
import { isOfferOutOfStock } from "@/features/offers/domain/offer";

import type {
	BusinessProfileDetail,
	BusinessReviewView,
	BusinessStats,
	DailyStat,
	HoursRange,
	TopProductStat,
} from "../domain/business";
import { PAYOUT_FIELDS } from "../domain/business";
import { notificationRepository } from "./notifications";

export { isOfferOutOfStock };

const OFFER_SELECT = `
  id, business_id, business_location_id, title, description, image,
  original_price, discounted_price, stock, initial_stock,
  pickup_start, pickup_end, is_active, includes, allergens, rating, review_count,
  businesses:business_id (id, name, type, image, rating, review_count),
  business_locations:business_location_id (id, name, address, latitude, longitude, zone),
  offer_categories (
    categories:categories!offer_categories_category_id_fkey (id, name, slug, emoji, image_url, active)
  )
`;

const DAY_LABELS: Record<string, string> = {
	monday: "Lunes",
	tuesday: "Martes",
	wednesday: "Miércoles",
	thursday: "Jueves",
	friday: "Viernes",
	saturday: "Sábado",
	sunday: "Domingo",
};

const DAY_TO_DB: Record<string, string> = {
	lunes: "monday",
	martes: "tuesday",
	miércoles: "wednesday",
	miercoles: "wednesday",
	jueves: "thursday",
	viernes: "friday",
	sábado: "saturday",
	sabado: "saturday",
	domingo: "sunday",
};

const MONTHS_SHORT = [
	"ene",
	"feb",
	"mar",
	"abr",
	"may",
	"jun",
	"jul",
	"ago",
	"sep",
	"oct",
	"nov",
	"dic",
];
const MONTHS_FULL = [
	"Enero",
	"Febrero",
	"Marzo",
	"Abril",
	"Mayo",
	"Junio",
	"Julio",
	"Agosto",
	"Septiembre",
	"Octubre",
	"Noviembre",
	"Diciembre",
];

type Row = Record<string, unknown>;

export const businessRepository = {
	// ─── Catalog (offers CRUD + images) ───────────────────────────────
	async getBusinessOffers(businessId: string): Promise<OfferDetail[]> {
		const { data, error } = await supabase
			.from("offers")
			.select(OFFER_SELECT)
			.eq("business_id", businessId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar el catálogo");
		return toRows(data).map(mapOfferDetail);
	},

	// ─── Business profile ─────────────────────────────────────────────
	async getBusinessProfile(businessId: string): Promise<BusinessProfileDetail> {
		const [
			businessResult,
			hoursResult,
			reviewResult,
			locationResult,
			ordersResult,
		] = await Promise.all([
			supabase
				.from("businesses")
				.select("*")
				.eq("id", businessId)
				.maybeSingle(),
			supabase
				.from("business_hours")
				.select("day, open_time, close_time, is_closed")
				.eq("business_id", businessId)
				.order("day", { ascending: true }),
			supabase
				.from("reviews")
				.select(
					`id, user_id, business_id, order_id, rating, comment, product_rating, business_rating, created_at,
            profiles!reviews_user_id_fkey (full_name)`,
				)
				.eq("business_id", businessId)
				.order("created_at", { ascending: false })
				.limit(5),
			supabase
				.from("business_locations")
				.select("id, address, latitude, longitude, zone")
				.eq("business_id", businessId)
				.eq("is_headquarter", true)
				.maybeSingle(),
			supabase
				.from("orders")
				.select("id")
				.eq("business_id", businessId)
				.eq("status", "completed"),
		]);

		if (businessResult.error || !businessResult.data) {
			throw Errors.notFound("Negocio no encontrado");
		}
		const business = businessResult.data as unknown as Business;
		const headquarter = locationResult.data as unknown as
			| (Row & { address?: string })
			| null;

		const hourEntries = toRows(hoursResult.data).map((r) => ({
			day: String(r.day),
			open_time: String(r.open_time ?? "00:00:00"),
			close_time: String(r.close_time ?? "00:00:00"),
			is_closed: Boolean(r.is_closed),
		}));

		return {
			business,
			address: headquarter?.address ?? null,
			businessLocationId: headquarter?.id ? String(headquarter.id) : null,
			latitude: headquarter ? num(headquarter.latitude) : null,
			longitude: headquarter ? num(headquarter.longitude) : null,
			zone: (headquarter?.zone as string | null) ?? null,
			memberSince: formatMemberSince(business.created_at),
			totalRescued: Array.isArray(ordersResult.data)
				? ordersResult.data.length
				: 0,
			hours: groupHours(hourEntries),
			reviews: toReviewViews(reviewResult.data),
		};
	},

	/** Horarios crudos por día (para el formulario de edición). */
	async getBusinessHours(
		businessId: string,
	): Promise<
		Array<{ day: string; open: string; close: string; closed: boolean }>
	> {
		const { data, error } = await supabase
			.from("business_hours")
			.select("day, open_time, close_time, is_closed")
			.eq("business_id", businessId)
			.order("day", { ascending: true });
		if (error) throw toAppError(error, "Error al cargar horarios");
		return toRows(data).map((r) => ({
			day: DAY_LABELS[String(r.day)] ?? String(r.day),
			open: formatTime(String(r.open_time ?? "00:00:00")),
			close: formatTime(String(r.close_time ?? "00:00:00")),
			closed: Boolean(r.is_closed),
		}));
	},

	async getBusinessesByOwnerId(ownerId: string): Promise<Business[]> {		const { data, error } = await supabase
			.from("businesses")
			.select("*")
			.eq("owner_id", ownerId)
			.order("name");
		if (error) throw toAppError(error, "Error al cargar negocios");
		return (data ?? []) as unknown as Business[];
	},

	async createBusiness(input: {
		ownerId: string;
		name: string;
		type: BusinessType;
		phone: string | null;
		email: string | null;
		description: string | null;
		website: string | null;
		logoUri: string | null;
		coverUri: string | null;
		hours: Array<{ day: string; hours: string }>;
		address?: string | null;
		latitude?: number | null;
		longitude?: number | null;
		zone?: string | null;
	}): Promise<void> {
		let logoUrl: string | null = null;
		let coverUrl: string | null = null;
		if (input.logoUri)
			logoUrl = await uploadImage(
				input.logoUri,
				`logos/${input.ownerId}_${Date.now()}.jpg`,
			);
		if (input.coverUri)
			coverUrl = await uploadImage(
				input.coverUri,
				`covers/${input.ownerId}_${Date.now()}.jpg`,
			);

		const slugBase = input.name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		const slug = `${slugBase}-${Math.floor(Math.random() * 10000)}`;

		const businessResult = await supabase
			.from("businesses")
			.insert({
				owner_id: input.ownerId,
				name: input.name,
				slug,
				type: input.type,
				phone: input.phone,
				email: input.email,
				description: input.description,
				image: logoUrl,
				cover_image: coverUrl,
				website: input.website,
				rating: 0,
				review_count: 0,
			})
			.select("id")
			.single();
		if (businessResult.error || !businessResult.data) {
			throw toAppError(businessResult.error, "Error al crear el negocio");
		}
		const businessId = String(businessResult.data.id);

		if (input.hours.length > 0) {
			await insertBusinessHours(businessId, input.hours);
		}

		if (input.address && input.latitude != null && input.longitude != null) {
			await supabase.from("business_locations").insert({
				business_id: businessId,
				name: input.name,
				address: input.address,
				phone: input.phone,
				latitude: input.latitude,
				longitude: input.longitude,
				zone: input.zone ?? null,
				is_headquarter: true,
			});
		}
	},

	async updateBusiness(
		businessId: string,
		patch: {
			name?: string;
			description?: string | null;
			phone?: string | null;
			email?: string | null;
			website?: string | null;
			type?: BusinessType;
			logoUri?: string | null;
			coverUri?: string | null;
			hours?: Array<{ day: string; hours: string }>;
			address?: string | null;
			latitude?: number | null;
			longitude?: number | null;
			zone?: string | null;
		},
	): Promise<void> {
		const businessUpdate: Record<string, unknown> = {
			updated_at: new Date().toISOString(),
		};
		if (patch.name != null) businessUpdate.name = patch.name;
		if (patch.description !== undefined)
			businessUpdate.description = patch.description;
		if (patch.phone !== undefined) businessUpdate.phone = patch.phone;
		if (patch.email !== undefined) businessUpdate.email = patch.email;
		if (patch.website !== undefined) businessUpdate.website = patch.website;
		if (patch.type) businessUpdate.type = patch.type;
		if (patch.logoUri) {
			businessUpdate.image = await uploadImage(
				patch.logoUri,
				`logos/${businessId}_${Date.now()}.jpg`,
			);
		}
		if (patch.coverUri) {
			businessUpdate.cover_image = await uploadImage(
				patch.coverUri,
				`covers/${businessId}_${Date.now()}.jpg`,
			);
		}

		const { error } = await supabase
			.from("businesses")
			.update(businessUpdate)
			.eq("id", businessId);
		if (error) throw toAppError(error, "Error al actualizar el negocio");

		if (patch.hours) {
			// ponytail: replace-all de horarios — simple y suficiente para un
			// solo editor por negocio; concurrencia optimista si hace falta.
			await supabase
				.from("business_hours")
				.delete()
				.eq("business_id", businessId);
			if (patch.hours.length > 0) {
				await insertBusinessHours(businessId, patch.hours);
			}
		}

		if (patch.latitude != null && patch.longitude != null) {
			const { data: hqRow } = await supabase
				.from("business_locations")
				.select("id, name")
				.eq("business_id", businessId)
				.eq("is_headquarter", true)
				.maybeSingle();
			const hq = (hqRow ?? null) as { id?: string; name?: string } | null;
			const locationId = hq?.id ? String(hq.id) : undefined;
			await this.upsertLocation({
				...(locationId ? { id: locationId } : {}),
				business_id: businessId,
				name: hq?.name ?? patch.name ?? "Local principal",
				address: patch.address ?? "",
				latitude: patch.latitude,
				longitude: patch.longitude,
				zone: patch.zone ?? null,
				phone: patch.phone ?? null,
				is_headquarter: true,
			});
		}
	},

	// ─── Locations ────────────────────────────────────────────────────
	async getLocations(businessId: string): Promise<BusinessLocation[]> {
		const { data, error } = await supabase
			.from("business_locations")
			.select("*")
			.eq("business_id", businessId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar locales");
		return (data ?? []) as unknown as BusinessLocation[];
	},

	async upsertLocation(
		location: Partial<BusinessLocation> & { business_id: string },
	): Promise<BusinessLocation> {
		const { data, error } = await supabase
			.from("business_locations")
			.upsert(location)
			.select("*")
			.single();
		if (error || !data) throw toAppError(error, "Error al guardar el local");
		return data as unknown as BusinessLocation;
	},

	async toggleLocationStatus(id: string, isActive: boolean): Promise<void> {
		const { error } = await supabase
			.from("business_locations")
			.update({ is_active: isActive })
			.eq("id", id);
		if (error) throw toAppError(error, "Error al cambiar el estado del local");
	},

	async getLocation(locationId: string): Promise<BusinessLocation | null> {
		const { data, error } = await supabase
			.from("business_locations")
			.select("*")
			.eq("id", locationId)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar el local");
		return (data ?? null) as unknown as BusinessLocation | null;
	},

	// ─── Coupons ──────────────────────────────────────────────────────
	async getCoupons(businessId: string): Promise<Coupon[]> {
		const { data, error } = await supabase
			.from("coupons")
			.select("*")
			.eq("business_id", businessId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar cupones");
		return (data ?? []) as unknown as Coupon[];
	},

	async upsertCoupon(
		coupon: Partial<Coupon> & {
			business_id: string;
			code: string;
			name: string;
			type: Coupon["type"];
			value: number;
		},
	): Promise<Coupon> {
		const { data, error } = await supabase
			.from("coupons")
			.upsert({ ...coupon, code: coupon.code.toUpperCase() })
			.select()
			.single();
		if (error || !data) throw toAppError(error, "Error al guardar cupón");
		return data as unknown as Coupon;
	},

	async toggleCouponStatus(id: string, isActive: boolean): Promise<void> {
		const { error } = await supabase
			.from("coupons")
			.update({ is_active: isActive })
			.eq("id", id);
		if (error) throw toAppError(error, "Error al cambiar el estado del cupón");
	},

	async getCoupon(couponId: string): Promise<Coupon | null> {
		const { data, error } = await supabase
			.from("coupons")
			.select("*")
			.eq("id", couponId)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar el cupón");
		return (data ?? null) as unknown as Coupon | null;
	},

	async toggleOfferStatus(id: string, isActive: boolean): Promise<void> {
		const { error } = await supabase
			.from("offers")
			.update({ is_active: isActive, updated_at: new Date().toISOString() })
			.eq("id", id);
		if (error)
			throw toAppError(error, "Error al cambiar el estado del producto");
	},

	async deleteCoupon(id: string): Promise<void> {
		const { error } = await supabase.from("coupons").delete().eq("id", id);
		if (error) throw toAppError(error, "Error al eliminar cupón");
	},

	// ─── Payouts ──────────────────────────────────────────────────────
	async getPayouts(businessId: string): Promise<Payout[]> {
		const { data, error } = await supabase
			.from("payouts")
			.select(PAYOUT_FIELDS)
			.eq("business_id", businessId)
			.order("period_end", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar pagos");
		return (data ?? []) as unknown as Payout[];
	},

	// ─── Stats ────────────────────────────────────────────────────────
	async getBusinessStats(
		businessId: string,
		startDate: string,
		endDate: string,
	): Promise<BusinessStats> {
		const start = new Date(startDate);
		const end = new Date(endDate);
		const durationMs = end.getTime() - start.getTime();
		const prevStart = new Date(start.getTime() - durationMs);
		const prevEnd = start;

		const [currentOrders, previousOrders, businessResult] = await Promise.all([
			fetchCompletedOrders(businessId, start, end),
			fetchCompletedOrders(businessId, prevStart, prevEnd),
			supabase
				.from("businesses")
				.select("rating")
				.eq("id", businessId)
				.single(),
		]);

		const current = periodStats(currentOrders);
		const previous = periodStats(previousOrders);
		const rating = businessResult.error
			? 0
			: (num(businessResult.data?.rating) ?? 0);

		return {
			revenue: current.revenue,
			ordersCount: current.count,
			rescuedCount: current.count,
			avgRating: rating,
			revenueChange: change(current.revenue, previous.revenue),
			ordersChange: change(current.count, previous.count),
			rescuedChange: change(current.count, previous.count),
			topProducts: topProducts(currentOrders),
			dailyStats: dailyStats(currentOrders, start, end),
		};
	},
};

// ─── Offer save/delete (catalog mutations) ───────────────────────────
export async function saveOffer(
	input: {
		id?: string;
		businessId: string;
		businessLocationId: string;
		title: string;
		description: string | null;
		includes: string | null;
		allergens: string | null;
		originalPrice: number;
		discountedPrice: number;
		stock: number;
		initialStock: number;
		pickupStart: string;
		pickupEnd: string;
		isActive: boolean;
		categories: string[];
		imageUri: string | null;
	},
	requireImage = false,
): Promise<OfferDetail> {
	let imageUrl: string | null = null;
	if (input.imageUri) {
		imageUrl = await uploadImage(
			input.imageUri,
			`products/${input.businessId}_${Date.now()}.jpg`,
		);
	}

	const payload: Row = {
		business_id: input.businessId,
		business_location_id: input.businessLocationId || undefined,
		title: input.title,
		description: input.description,
		includes: input.includes,
		allergens: input.allergens,
		original_price: input.originalPrice,
		discounted_price: input.discountedPrice,
		stock: input.stock,
		initial_stock: input.initialStock,
		pickup_start: input.pickupStart,
		pickup_end: input.pickupEnd,
		is_active: input.isActive,
	};
	if (imageUrl) payload.image = imageUrl;

	let inserted: unknown;
	if (input.id) {
		const result = await supabase
			.from("offers")
			.update(payload)
			.eq("id", input.id)
			.select(OFFER_SELECT)
			.single();
		inserted = result.data;
		if (result.error)
			throw toAppError(result.error, "Error al actualizar la oferta");
	} else {
		if (requireImage && !imageUrl) {
			throw Errors.validation("Sube una foto del producto");
		}
		const result = await supabase
			.from("offers")
			.insert(payload)
			.select(OFFER_SELECT)
			.single();
		inserted = result.data;
		if (result.error)
			throw toAppError(result.error, "Error al crear la oferta");
	}
	if (!inserted) throw Errors.unknown("No se pudo guardar la oferta");

	const saved = mapOfferDetail(inserted as unknown as Row);
	await syncCategories(saved.offer.id, input.categories);
	return saved;
}

export async function deleteOffer(offerId: string): Promise<void> {
	const { error } = await supabase.from("offers").delete().eq("id", offerId);
	if (error) throw toAppError(error, "Error al eliminar la oferta");
}

// ─── Notifications (business) ────────────────────────────────────────
export async function getBusinessNotificationPreferences(
	businessId: string,
): ReturnType<typeof notificationRepository.getPreferences> {
	return notificationRepository.getPreferences(businessId);
}

// ─── Helpers (not exported) ──────────────────────────────────────────
async function syncCategories(
	offerId: string,
	categoryIds: string[],
): Promise<void> {
	await supabase.from("offer_categories").delete().eq("offer_id", offerId);
	if (categoryIds.length === 0) return;
	const { error } = await supabase
		.from("offer_categories")
		.insert(
			categoryIds.map((category_id) => ({ offer_id: offerId, category_id })),
		);
	if (error) throw toAppError(error, "Error al guardar categorías");
}

async function uploadImage(
	uri: string,
	remotePath: string,
): Promise<string | null> {
	try {
		let bytes: ArrayBuffer;
		if (Platform.OS === "web") {
			// expo-image-picker devuelve blob:/data: URIs — hay que fetchearlos.
			bytes = await (await fetch(uri)).arrayBuffer();
		} else {
			bytes = await new File(uri).arrayBuffer();
		}
		const { error } = await supabase.storage
			.from("product_images")
			.upload(remotePath, bytes, { contentType: "image/jpeg", upsert: true });
		if (error) throw error;
		const { data } = supabase.storage
			.from("product_images")
			.getPublicUrl(remotePath);
		return data.publicUrl;
	} catch {
		// Upload fallido: null mantiene la imagen anterior en la oferta
		// (nunca persistir una URI local, muere al recargar).
		return null;
	}
}

async function fetchCompletedOrders(
	businessId: string,
	start: Date,
	end: Date,
): Promise<Row[]> {
	const { data, error } = await supabase
		.from("orders")
		.select("id, price, created_at, offers(title)")
		.eq("business_id", businessId)
		.eq("status", "completed")
		.gte("created_at", start.toISOString())
		.lte("created_at", end.toISOString());
	if (error) throw toAppError(error, "Error al calcular estadísticas");
	return toRows(data);
}

function periodStats(orders: Row[]): { revenue: number; count: number } {
	let revenue = 0;
	for (const order of orders) revenue += num(order.price) ?? 0;
	return { revenue, count: orders.length };
}

function change(current: number, previous: number): number {
	if (previous === 0) return current > 0 ? 100 : 0;
	return ((current - previous) / previous) * 100;
}

function topProducts(orders: Row[]): TopProductStat[] {
	const map = new Map<string, { sold: number; revenue: number }>();
	for (const order of orders) {
		const offer = order.offers as Row | null;
		const title = String(offer?.title ?? "Desconocido");
		const price = num(order.price) ?? 0;
		const current = map.get(title) ?? { sold: 0, revenue: 0 };
		map.set(title, {
			sold: current.sold + 1,
			revenue: current.revenue + price,
		});
	}
	return [...map.entries()]
		.map(([name, v]) => ({ name, sold: v.sold, revenue: v.revenue }))
		.sort((a, b) => b.sold - a.sold)
		.slice(0, 5);
}

type Aggregation = "day" | "week" | "month";

function resolveAggregation(totalDays: number): Aggregation {
	if (totalDays <= 14) return "day";
	if (totalDays <= 60) return "week";
	return "month";
}

function bucketKey(d: Date, agg: Aggregation): string {
	if (agg === "day")
		return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
	if (agg === "week") {
		const monday = new Date(d);
		monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		const jan1 = new Date(monday.getFullYear(), 0, 1);
		const weekNum =
			Math.floor((monday.getTime() - jan1.getTime()) / (7 * 86400000)) + 1;
		return `${monday.getFullYear()}-W${weekNum}`;
	}
	return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

function bucketLabel(key: string, agg: Aggregation): string {
	if (agg === "day") {
		const [y, m, d] = key.split("-").map(Number);
		const names = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
		return names[new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getDay()] ?? key;
	}
	if (agg === "week") {
		const [yearPart, weekPart] = key.split("-W");
		const y = Number(yearPart);
		const weekNum = Number(weekPart);
		const jan1 = new Date(y, 0, 1);
		const monday = new Date(jan1.getTime() + (weekNum - 1) * 7 * 86400000);
		const saturday = new Date(monday.getTime() + 6 * 86400000);
		if (monday.getFullYear() !== y) return `Sem ${weekNum}`;
		if (monday.getMonth() === saturday.getMonth()) {
			return `${monday.getDate()}–${saturday.getDate()} ${MONTHS_SHORT[monday.getMonth()]}`;
		}
		return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${saturday.getDate()} ${MONTHS_SHORT[saturday.getMonth()]}`;
	}
	const [, m] = key.split("-");
	return MONTHS_FULL[Number(m) - 1] ?? key;
}

function dailyStats(
	orders: Row[],
	startDate: Date,
	endDate: Date,
): DailyStat[] {
	const totalDays = Math.floor(
		(endDate.getTime() - startDate.getTime()) / 86400000,
	);
	const agg = resolveAggregation(Math.max(totalDays, 1));
	const dataMap = new Map<string, { count: number; revenue: number }>();
	const seen = new Set<string>();
	for (let i = 0; i <= totalDays; i++) {
		const date = new Date(startDate.getTime() + i * 86400000);
		const key = bucketKey(date, agg);
		if (!seen.has(key)) {
			seen.add(key);
			dataMap.set(key, { count: 0, revenue: 0 });
		}
	}
	for (const order of orders) {
		const date = new Date(String(order.created_at));
		const key = bucketKey(date, agg);
		const current = dataMap.get(key);
		if (current) {
			dataMap.set(key, {
				count: current.count + 1,
				revenue: current.revenue + (num(order.price) ?? 0),
			});
		}
	}
	return [...dataMap.entries()].map(([key, v]) => ({
		day: bucketLabel(key, agg),
		orders: v.count,
		revenue: v.revenue,
	}));
}

function groupHours(
	entries: Array<{
		day: string;
		open_time: string;
		close_time: string;
		is_closed: boolean;
	}>,
): HoursRange[] {
	if (entries.length === 0) return [];
	const result: HoursRange[] = [];
	let start = entries[0]!;
	let end = entries[0]!;
	for (let i = 1; i < entries.length; i++) {
		const entry = entries[i]!;
		if (
			entry.open_time === end.open_time &&
			entry.close_time === end.close_time &&
			entry.is_closed === end.is_closed
		) {
			end = entry;
		} else {
			result.push(buildRange(start, end));
			start = entry;
			end = entry;
		}
	}
	result.push(buildRange(start, end));
	return result;
}

function buildRange(
	start: {
		day: string;
		open_time: string;
		close_time: string;
		is_closed: boolean;
	},
	end: {
		day: string;
		open_time: string;
		close_time: string;
		is_closed: boolean;
	},
): HoursRange {
	const startLabel = DAY_LABELS[start.day] ?? start.day;
	const endLabel = DAY_LABELS[end.day] ?? end.day;
	const dayRange =
		start.day === end.day ? startLabel : `${startLabel} - ${endLabel}`;
	const hoursDisplay = start.is_closed
		? "Cerrado"
		: `${formatTime(start.open_time)} - ${formatTime(end.close_time)}`;
	return { dayRange, hoursDisplay };
}

function formatTime(time: string): string {
	const [h, m] = time.split(":");
	return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

async function insertBusinessHours(
	businessId: string,
	hours: Array<{ day: string; hours: string }>,
): Promise<void> {
	const hourRows = hours.map((h) => {
		const lower = h.hours.toLowerCase();
		const isClosed = lower.includes("cerrado");
		let open = "00:00:00";
		let close = "00:00:00";
		if (!isClosed) {
			const parts = h.hours.split("-").map((s) => s.trim());
			if (parts.length === 2) {
				open = toDbTime(parts[0]);
				close = toDbTime(parts[1]);
			}
		}
		return {
			business_id: businessId,
			day: DAY_TO_DB[h.day.toLowerCase()] ?? h.day.toLowerCase(),
			open_time: open,
			close_time: close,
			is_closed: isClosed,
		};
	});
	await supabase.from("business_hours").insert(hourRows);
}

function toDbTime(time: string): string {
	const parts = time.split(":");
	if (parts.length === 2) {
		return `${parts[0]!.padStart(2, "0")}:${parts[1]!.padStart(2, "0")}:00`;
	}
	return "00:00:00";
}

function formatMemberSince(createdAt: string | null): string | null {
	if (!createdAt) return null;
	const date = new Date(createdAt);
	if (Number.isNaN(date.getTime())) return null;
	return `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

function toRows(data: unknown): Row[] {
	return Array.isArray(data) ? (data as Row[]) : [];
}

function num(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}

function toReviewViews(data: unknown): BusinessReviewView[] {
	if (!Array.isArray(data)) return [];
	return data.map((entry) => {
		const row = entry as Row;
		const profile = row.profiles as Row | null;
		return {
			id: String(row.id ?? ""),
			userName: String(profile?.full_name ?? "Cliente"),
			productRating: num(row.product_rating) ?? 0,
			businessRating: num(row.business_rating) ?? 0,
			date: String(row.created_at ?? ""),
			comment: (row.comment as string | null) ?? null,
		};
	});
}

function mapOfferDetail(row: Row): OfferDetail {
	const businessRow = (row.businesses ?? {}) as Row;
	const locationRow = row.business_locations as Row | null;
	const categories = (
		Array.isArray(row.offer_categories) ? row.offer_categories : []
	).flatMap((entry) => {
		const item = entry as Row;
		const cat = item.categories as Row | null;
		return cat
			? [
					{
						id: String(cat.id),
						name: String(cat.name),
						slug: (cat.slug as string | null) ?? null,
						emoji: (cat.emoji as string | null) ?? null,
						image_url: (cat.image_url as string | null) ?? null,
						active: (cat.active as boolean | null) ?? true,
					},
				]
			: [];
	});

	return {
		offer: {
			id: String(row.id),
			business_id: String(row.business_id),
			business_location_id: String(row.business_location_id ?? ""),
			title: String(row.title),
			description: (row.description as string | null) ?? null,
			image: (row.image as string | null) ?? null,
			category_ids: categories.map((c) => c.id),
			original_price: num(row.original_price) ?? 0,
			discounted_price: num(row.discounted_price) ?? 0,
			discount_percentage: null,
			stock: (row.stock as number | null) ?? 0,
			initial_stock: (row.initial_stock as number | null) ?? 0,
			pickup_start: String(row.pickup_start),
			pickup_end: String(row.pickup_end),
			is_active: (row.is_active as boolean | null) ?? false,
			includes: (row.includes as string | null) ?? null,
			allergens: (row.allergens as string | null) ?? null,
			rating: num(row.rating) ?? 0,
			review_count: (row.review_count as number | null) ?? 0,
			created_at: String(row.created_at ?? ""),
			updated_at: String(row.updated_at ?? ""),
		},
		business: {
			id: String(businessRow.id ?? row.business_id),
			name: String(businessRow.name ?? ""),
			type: (businessRow.type as BusinessType | null) ?? "other",
			image: (businessRow.image as string | null) ?? null,
			rating: num(businessRow.rating) ?? 0,
			review_count: (businessRow.review_count as number | null) ?? 0,
		},
		location: locationRow
			? {
					id: String(locationRow.id ?? ""),
					name: (locationRow.name as string | null) ?? "",
					address: (locationRow.address as string | null) ?? "",
					latitude: num(locationRow.latitude) ?? 0,
					longitude: num(locationRow.longitude) ?? 0,
					zone: (locationRow.zone as string | null) ?? null,
				}
			: null,
		categories,
	};
}
