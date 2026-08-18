import type {
	AddressType,
	ConsumerNotificationPreferences,
	SavedAddress,
	UserPreferences,
} from "@0xc1x/role-commons";

export type {
	AddressType,
	ConsumerNotificationPreferences,
	SavedAddress,
	UserPreferences,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
	id: "",
	user_id: "",
	notification_radius_km: 5,
	favorite_categories: [],
	language: "es",
	theme_mode: "system",
	created_at: "",
	updated_at: "",
};

export const DEFAULT_NOTIFICATION_PREFS: ConsumerNotificationPreferences = {
	user_id: "",
	push_enabled: true,
	email_enabled: true,
	sms_enabled: false,
	whatsapp_enabled: false,
	favorite_alerts_enabled: true,
	pickup_reminders_enabled: true,
	last_minute_deals_enabled: false,
	weekly_summary_enabled: true,
	quiet_hours_from: null,
	quiet_hours_to: null,
	created_at: "",
	updated_at: "",
};

/** User eco/savings stats derived from orders. */
export interface UserStats {
	total_saved_cents: number;
	total_orders: number;
	co2_saved_kg: number;
}

/** Light order row for the profile history list. */
export interface UserOrderSummary {
	id: string;
	orderNumber: string;
	businessName: string;
	status: string;
	price: number;
	originalPrice: number;
	pickupTime: string | null;
	createdAt: string;
	offerImageUrl: string | null;
}

/**
 * Payment method stored on-device (expo-secure-store). There is no DB
 * table for consumer cards in phase 1 — payment happens at pickup —
 * so this contract is intentionally mobile-only.
 */
export interface PaymentMethodModel {
	id: string;
	brand: string;
	last4: string;
	cardHolder: string;
	expiryMonth: string;
	expiryYear: string;
	isDefault: boolean;
	createdAt: string;
}
