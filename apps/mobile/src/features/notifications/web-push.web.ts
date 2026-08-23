import { supabase } from "@/core/supabase/client";
import { env } from "@/core/config/env";

/**
 * Web push (PWA) via Firebase Cloud Messaging. Native uses expo-notifications
 * (`syncDeviceToken`); this module only runs on the browser:
 * 1. Requests the browser notification permission (the OS-level prompt).
 * 2. Registers `/firebase-messaging-sw.js` (background messages).
 * 3. Gets an FCM token (VAPID) and upserts it into `device_tokens`.
 * 4. Shows foreground messages with the Notification API.
 */
export async function syncWebPushToken(userId: string): Promise<boolean> {
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!("Notification" in window)
	) {
		return false;
	}

	let permission = Notification.permission;
	if (permission === "default") {
		permission = await Notification.requestPermission();
	}
	if (permission !== "granted") return false;

	const { getApps, initializeApp } = await import("firebase/app");
	const { getMessaging, getToken, onMessage, isSupported } =
		await import("firebase/messaging");

	if (!(await isSupported())) return false;

	const app =
		getApps()[0] ??
		initializeApp({
			apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
			authDomain: `${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
			projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
			messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
			appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
		});
	const messaging = getMessaging(app);

	const registration = await navigator.serviceWorker.register(
		"/firebase-messaging-sw.js",
	);
	const token = await getToken(messaging, {
		vapidKey: env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	if (!token) return false;

	const { error } = await supabase.from("device_tokens").upsert({
		user_id: userId,
		token,
		platform: "web",
		is_active: true,
	});
	if (error) throw new Error("Error al registrar el dispositivo");

	onMessage(messaging, (payload) => {
		const title = payload.notification?.title ?? "Rolé";
		if (Notification.permission === "granted") {
			new Notification(title, { body: payload.notification?.body ?? "" });
		}
	});

	return true;
}
