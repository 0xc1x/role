import type {
	AddressType,
	ConsumerNotificationPreferences,
	SavedAddress,
	UserPreferences,
} from "@0xc1x/role-commons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";
import { Errors } from "@/core/error/app-error";

import type {
	PaymentMethodModel,
	UserOrderSummary,
	UserStats,
} from "../domain/profile";
import {
	DEFAULT_NOTIFICATION_PREFS,
	DEFAULT_PREFERENCES,
} from "../domain/profile";

const CO2_KG_PER_ORDER = 1.2;

function paymentMethodsKey(userId: string): string {
	return `role.paymentMethods.${userId}`;
}

export const profileRepository = {
	// ─── Saved addresses ──────────────────────────────────────────────
	async getSavedAddresses(userId: string): Promise<SavedAddress[]> {
		const { data, error } = await supabase
			.from("saved_addresses")
			.select("*")
			.eq("user_id", userId)
			.order("is_default", { ascending: false })
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar direcciones");
		return (data ?? []) as unknown as SavedAddress[];
	},

	async saveAddress(input: {
		userId: string;
		label: string;
		address: string;
		latitude: number;
		longitude: number;
		type: AddressType;
		references?: string | null;
		housingType?: string | null;
	}): Promise<void> {
		const { data: current } = await supabase
			.from("saved_addresses")
			.select("id")
			.eq("user_id", input.userId)
			.limit(1);
		const { error } = await supabase.from("saved_addresses").insert({
			user_id: input.userId,
			label: input.label,
			address: input.address,
			latitude: input.latitude,
			longitude: input.longitude,
			is_default: !current || current.length === 0,
			type: input.type,
			references: input.references ?? null,
			housing_type: input.housingType ?? null,
		});
		if (error) throw toAppError(error, "Error al guardar la dirección");
	},

	async deleteAddress(id: string): Promise<void> {
		const { error } = await supabase
			.from("saved_addresses")
			.delete()
			.eq("id", id);
		if (error) throw toAppError(error, "Error al eliminar la dirección");
	},

	async updateAddress(input: {
		id: string;
		userId: string;
		label: string;
		address: string;
		latitude: number;
		longitude: number;
		type: AddressType;
		references?: string | null;
		housingType?: string | null;
		isDefault: boolean;
	}): Promise<void> {
		if (input.isDefault) {
			await supabase
				.from("saved_addresses")
				.update({ is_default: false })
				.eq("user_id", input.userId);
		}
		const { error } = await supabase
			.from("saved_addresses")
			.update({
				label: input.label,
				address: input.address,
				latitude: input.latitude,
				longitude: input.longitude,
				is_default: input.isDefault,
				type: input.type,
				references: input.references ?? null,
				housing_type: input.housingType ?? null,
			})
			.eq("id", input.id);
		if (error) throw toAppError(error, "Error al actualizar la dirección");
	},

	async setDefaultAddress(id: string, userId: string): Promise<void> {
		await supabase
			.from("saved_addresses")
			.update({ is_default: false })
			.eq("user_id", userId);
		const { error } = await supabase
			.from("saved_addresses")
			.update({ is_default: true })
			.eq("id", id);
		if (error) throw toAppError(error, "Error al actualizar la dirección");
	},

	// ─── User preferences ─────────────────────────────────────────────
	async getPreferences(userId: string): Promise<UserPreferences> {
		const { data, error } = await supabase
			.from("user_preferences")
			.select("*")
			.eq("user_id", userId)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar preferencias");
		if (!data) return { ...DEFAULT_PREFERENCES, user_id: userId };
		return { ...DEFAULT_PREFERENCES, ...(data as unknown as UserPreferences) };
	},

	async updatePreferences(
		userId: string,
		prefs: Partial<UserPreferences>,
	): Promise<void> {
		const { error } = await supabase
			.from("user_preferences")
			.upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
		if (error) throw toAppError(error, "Error al guardar preferencias");
	},

	// ─── Marketing preferences ────────────────────────────────────────
	async getMarketingPreferences(userId: string): Promise<{
		is_subscribed: boolean;
	}> {
		const { data, error } = await supabase
			.from("marketing_preferences")
			.select("is_subscribed")
			.eq("user_id", userId)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar preferencias");
		return { is_subscribed: data?.is_subscribed ?? true };
	},

	async setMarketingSubscribed(userId: string, isSubscribed: boolean): Promise<void> {
		const { error } = await supabase
			.from("marketing_preferences")
			.upsert(
				{
					user_id: userId,
					is_subscribed: isSubscribed,
					unsubscribed_at: isSubscribed ? null : new Date().toISOString(),
					source: "app",
				},
				{ onConflict: "user_id" },
			);
		if (error) throw toAppError(error, "Error al guardar preferencias");
	},

	// ─── Consumer notification preferences ────────────────────────────
	async getNotificationPreferences(
		userId: string,
	): Promise<ConsumerNotificationPreferences> {
		const { data, error } = await supabase
			.from("consumer_notification_preferences")
			.select("*")
			.eq("user_id", userId)
			.maybeSingle();
		if (error)
			throw toAppError(error, "Error al cargar preferencias de notificación");
		if (!data) return { ...DEFAULT_NOTIFICATION_PREFS, user_id: userId };
		return {
			...DEFAULT_NOTIFICATION_PREFS,
			...(data as unknown as ConsumerNotificationPreferences),
		};
	},

	async updateNotificationPreferences(
		userId: string,
		prefs: Partial<ConsumerNotificationPreferences>,
	): Promise<void> {
		const { error } = await supabase
			.from("consumer_notification_preferences")
			.upsert({ user_id: userId, ...prefs }, { onConflict: "user_id" });
		if (error)
			throw toAppError(error, "Error al guardar preferencias de notificación");
	},

	// ─── Profile ──────────────────────────────────────────────────────
	async updateProfile(
		userId: string,
		patch: {
			full_name?: string;
			email?: string;
			phone?: string | null;
			city?: string | null;
		},
	): Promise<void> {
		const { error } = await supabase
			.from("profiles")
			.update(patch)
			.eq("id", userId);
		if (error) throw toAppError(error, "Error al actualizar el perfil");
	},

	// ─── Stats & order history ────────────────────────────────────────
	async getUserStats(userId: string): Promise<UserStats> {
		const { data, error } = await supabase
			.from("orders")
			.select("price, original_price")
			.eq("user_id", userId)
			.neq("status", "cancelled");
		if (error) throw toAppError(error, "Error al calcular estadísticas");
		let totalSaved = 0;
		for (const row of data ?? []) {
			const original = num(row.original_price) ?? 0;
			const paid = num(row.price) ?? 0;
			totalSaved += original - paid;
		}
		const count = (data ?? []).length;
		return {
			total_saved_cents: totalSaved,
			total_orders: count,
			co2_saved_kg: count * CO2_KG_PER_ORDER,
		};
	},

	async getUserOrders(userId: string): Promise<UserOrderSummary[]> {
		const { data, error } = await supabase
			.from("orders")
			.select(
				`
        id, order_number, status, price, original_price,
        pickup_time, created_at,
        businesses:business_id (name),
        offers:offer_id (image)
        `,
			)
			.eq("user_id", userId)
			.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al cargar pedidos");
		return (data ?? []).map((r) => {
			const row = r as unknown as Record<string, unknown>;
			const business = (row.businesses ?? {}) as Record<string, unknown>;
			const offer = (row.offers ?? {}) as Record<string, unknown>;
			return {
				id: String(row.id),
				orderNumber: String(row.order_number ?? ""),
				businessName: String(business.name ?? ""),
				status: String(row.status ?? "pending"),
				price: num(row.price) ?? 0,
				originalPrice: num(row.original_price) ?? 0,
				pickupTime: (row.pickup_time as string | null) ?? null,
				createdAt: String(row.created_at ?? ""),
				offerImageUrl: (offer.image as string | null) ?? null,
			};
		});
	},

	// ─── Payment methods (device-local, secure storage) ───────────────
	async getPaymentMethods(userId: string): Promise<PaymentMethodModel[]> {
		const raw = await AsyncStorage.getItem(paymentMethodsKey(userId));
		if (!raw) return [];
		try {
			return JSON.parse(raw) as PaymentMethodModel[];
		} catch {
			await AsyncStorage.removeItem(paymentMethodsKey(userId)).catch(() => {});
			return [];
		}
	},

	async savePaymentMethod(
		userId: string,
		method: PaymentMethodModel,
	): Promise<void> {
		const current = await this.getPaymentMethods(userId);
		const updated = [
			...current.map((m) =>
				method.isDefault ? { ...m, isDefault: false } : m,
			),
			method,
		];
		await AsyncStorage.setItem(
			paymentMethodsKey(userId),
			JSON.stringify(updated),
		);
	},

	async deletePaymentMethod(userId: string, id: string): Promise<void> {
		const current = await this.getPaymentMethods(userId);
		let updated = current.filter((m) => m.id !== id);
		if (updated.length > 0 && !updated.some((m) => m.isDefault)) {
			updated = [{ ...updated[0]!, isDefault: true }, ...updated.slice(1)];
		}
		await AsyncStorage.setItem(
			paymentMethodsKey(userId),
			JSON.stringify(updated),
		);
	},

	async setDefaultPaymentMethod(userId: string, id: string): Promise<void> {
		const current = await this.getPaymentMethods(userId);
		const updated = current.map((m) => ({ ...m, isDefault: m.id === id }));
		await AsyncStorage.setItem(
			paymentMethodsKey(userId),
			JSON.stringify(updated),
		);
	},
};

function num(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}

export { SecureStore, Errors };
