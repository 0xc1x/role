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
let foregroundListenerRegistered = false;

export async function syncWebPushToken(
	userId: string,
	opts: { request?: boolean } = {},
): Promise<boolean> {
	const { request = true } = opts;
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!("Notification" in window)
	) {
		return false;
	}

	let permission = Notification.permission;
	// Con permiso "denied" el navegador jamás vuelve a mostrar el prompt;
	// solo lo pedimos si está en "default" y hay gesto de usuario.
	if (permission === "default" && request) {
		permission = await Notification.requestPermission();
	}
	if (permission !== "granted") return false;

	const firebaseConfig = {
		apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
		authDomain: `${env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
		projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
		messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
		appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
	};
	if (
		!firebaseConfig.apiKey ||
		!firebaseConfig.projectId ||
		!firebaseConfig.messagingSenderId ||
		!firebaseConfig.appId
	) {
		// Sin esto, @firebase/installations lanza el criptico
		// "installations/missing-app-config-values".
		throw new Error(
			"Push web no configurado: faltan EXPO_PUBLIC_FIREBASE_* en .env",
		);
	}

	const { getApps, initializeApp } = await import("firebase/app");
	const { getMessaging, getToken, onMessage, isSupported, deleteToken } =
		await import("firebase/messaging");

	if (!(await isSupported())) return false;

	const app =
		getApps()[0] ??
		initializeApp({
			...firebaseConfig,
		});
	const messaging = getMessaging(app);

	const registration = await navigator.serviceWorker.register(
		"/firebase-messaging-sw.js",
	);
	if (request) {
		// El token cacheado en IndexedDB puede apuntar a una suscripción push
		// ya muerta (site data borrado, SW actualizado, ventana cerrada): al
		// activar desde Ajustes forzamos suscripción nueva en vez de
		// re-registrar un token que FCM responderá UNREGISTERED.
		await deleteToken(messaging).catch(() => undefined);
	}
	const token = await getToken(messaging, {
		vapidKey: env.EXPO_PUBLIC_FIREBASE_VAPID_KEY,
		serviceWorkerRegistration: registration,
	});
	if (!token) return false;

	const { error } = await supabase
		.from("device_tokens")
		.upsert(
			{
				user_id: userId,
				token,
				platform: "web",
				is_active: true,
			},
			{ onConflict: "token" },
		);
	if (error) {
		// 23505 = token duplicado: ya está registrado, es éxito para el flujo.
		if (error.code === "23505") return true;
		throw Object.assign(new Error("Error al registrar el dispositivo"), {
			code: error.code,
		});
	}

	if (!foregroundListenerRegistered) {
		foregroundListenerRegistered = true;
		onMessage(messaging, (payload) => {
			const title = payload.notification?.title ?? "Rolé";
			if (Notification.permission === "granted") {
				const data = (payload.data ?? {}) as Record<string, string>;
				new Notification(title, {
					body: payload.notification?.body ?? "",
					icon: data.icon ?? "/icons/Icon-192.png",
					badge: data.badge ?? "/icons/Icon-72.png",
					tag: data.tag ?? data.type ?? "role",
					image: data.image,
					data,
				} as NotificationOptions & { image?: string; badge?: string });
			}
		});
	}

	return true;
}
