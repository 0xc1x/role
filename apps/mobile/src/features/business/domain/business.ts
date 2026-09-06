import type {
	Business,
	BusinessHours,
	BusinessLocation,
	BusinessNotificationPreferences,
	Payout,
	PayoutStatus,
} from "@0xc1x/role-commons";

export type {
	Business,
	BusinessHours,
	BusinessLocation,
	BusinessNotificationPreferences,
	Payout,
	PayoutStatus,
};

export const DEFAULT_BUSINESS_NOTIFICATION_PREFS: BusinessNotificationPreferences =
	{
		business_id: "",
		push_enabled: true,
		email_enabled: true,
		sms_enabled: false,
		whatsapp_enabled: false,
		new_orders_enabled: true,
		pickup_ready_enabled: true,
		reviews_enabled: true,
		low_stock_enabled: false,
		daily_summary_enabled: true,
		quiet_hours_from: null,
		quiet_hours_to: null,
		created_at: "",
		updated_at: "",
	};

/** Human display for a business type. */
export const BUSINESS_TYPE_LABELS: Record<string, string> = {
	restaurant: "Restaurante",
	bakery: "Panadería",
	cafe: "Cafetería",
	grocery: "Tienda de comestibles",
	other: "Otro",
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
	pending: "Pendiente",
	processing: "Procesando",
	paid: "Pagado",
	failed: "Fallido",
};

/** Consecutive business_hours entries grouped into display ranges. */
export interface HoursRange {
	dayRange: string;
	hoursDisplay: string;
}

/** Consumer-facing review (user name resolved from profiles). */
export interface BusinessReviewView {
	id: string;
	userName: string;
	productRating: number;
	businessRating: number;
	date: string;
	comment: string | null;
}

/** Orderings for the full reviews screen. */
export type ReviewFilter = "recent" | "recommended";

/** Minimum Pack+Atención average for a review to count as a recommendation. */
export const RECOMMENDED_REVIEW_MIN_RATING = 4;

export function reviewAverageRating(
	review: Pick<BusinessReviewView, "productRating" | "businessRating">,
): number {
	return (review.productRating + review.businessRating) / 2;
}

/** Más recientes primero; en "recommended" solo reseñas con promedio ≥ 4, mejor puntuadas primero. */
export function filterBusinessReviews(
	reviews: BusinessReviewView[],
	filter: ReviewFilter,
): BusinessReviewView[] {
	const byDateDesc = (a: BusinessReviewView, b: BusinessReviewView) =>
		reviewTime(b) - reviewTime(a);
	if (filter === "recent") {
		return [...reviews].sort(byDateDesc);
	}
	return reviews
		.filter((r) => reviewAverageRating(r) >= RECOMMENDED_REVIEW_MIN_RATING)
		.sort(
			(a, b) =>
				reviewAverageRating(b) - reviewAverageRating(a) || byDateDesc(a, b),
		);
}

function reviewTime(review: BusinessReviewView): number {
	const time = new Date(review.date).getTime();
	return Number.isNaN(time) ? 0 : time;
}

/** Business profile composed with hours, reviews and rescue stats. */
export interface BusinessProfileDetail {
	business: Business;
	address: string | null;
	businessLocationId: string | null;
	latitude: number | null;
	longitude: number | null;
	zone: string | null;
	memberSince: string | null;
	totalRescued: number;
	hours: HoursRange[];
	reviews: BusinessReviewView[];
}

export interface TopProductStat {
	name: string;
	sold: number;
	revenue: number;
}

export interface DailyStat {
	day: string;
	orders: number;
	revenue: number;
}

export interface BusinessStats {
	revenue: number;
	ordersCount: number;
	rescuedCount: number;
	avgRating: number;
	revenueChange: number;
	ordersChange: number;
	rescuedChange: number;
	topProducts: TopProductStat[];
	dailyStats: DailyStat[];
}

export const PAYOUT_FIELDS =
	"id,business_id,period_start,period_end,gross_amount,platform_fee,net_amount,status,gateway_payout_id,paid_at,created_at,updated_at";
