import { Platform } from "react-native";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";

type NotificationsModule = typeof import("expo-notifications");

// ponytail: import perezoso — expo-notifications emite warnings en web al
// importarse y ahí no se usa (la PWA hace push vía FCM service worker).
// Si algún día hay push web vía expo, volver a import estático.
async function loadNotifications(): Promise<NotificationsModule | null> {
	if (Platform.OS === "web") return null;
	return import("expo-notifications");
}

// ─── Device token sync ──────────────────────────────────────────────
/** Saves/updates this device's push token for the current user. */
export async function syncDeviceToken(userId: string): Promise<boolean> {
	if (Platform.OS === "web") {
		// PWA: FCM via service worker + VAPID (expo-notifications has no
		// remote push on web). Platform-split import keeps firebase out of
		// the native bundle.
		const mod = await import("./web-push.web");
		return mod.syncWebPushToken(userId);
	}

	const Notifications = await loadNotifications();
	if (!Notifications) return false;

	let token: string | null = null;
	try {
		const { status: existing } = await Notifications.getPermissionsAsync();
		let status = existing;
		if (status !== "granted") {
			status = (await Notifications.requestPermissionsAsync()).status;
		}
		if (status !== "granted") return false;

		const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? null;
		const ticket = await Notifications.getExpoPushTokenAsync({
			projectId: projectId ?? undefined,
		});
		token = ticket.data;
	} catch {
		return false; // Permission/token unavailable — not fatal.
	}
	if (!token) return false;

	const { error } = await supabase.from("device_tokens").upsert({
		user_id: userId,
		token,
		platform: Platform.OS,
		is_active: true,
	});
	if (error) throw toAppError(error, "Error al registrar el dispositivo");
	return true;
}

export async function removeDeviceToken(userId: string): Promise<void> {
	const { data } = await supabase
		.from("device_tokens")
		.select("token")
		.eq("user_id", userId);
	await Promise.all(
		(data ?? []).map((row) =>
			supabase
				.from("device_tokens")
				.update({ user_id: null })
				.eq("token", String(row.token)),
		),
	).catch(() => {});
}

// ─── In-app notification handler (solo nativo) ──────────────────────
export async function initNotificationHandler(): Promise<void> {
	const Notifications = await loadNotifications();
	if (!Notifications) return;
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: false,
			shouldSetBadge: false,
		}),
	});
}
