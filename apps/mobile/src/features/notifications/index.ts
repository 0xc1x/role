import Constants from "expo-constants";
import type { NotificationResponse } from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";

import { resolveNotificationRoute } from "./notification-routing";

import { toAppError } from "@/src/core/error/mapper";
import { env } from "@/src/core/config/env";
import {
	upsertDeviceToken,
	deleteDeviceTokens,
	type DeviceTokenPlatform,
} from "./data/repository";
import { pendingDeviceTokenRevocationRepository } from "./data/pending-revocation";

export { pendingDeviceTokenRevocationRepository };

export type NotificationsModule = typeof import("expo-notifications");

// ponytail: import perezoso — expo-notifications emite warnings en web al
// importarse y ahí no se usa (la PWA hace push vía FCM service worker).
// Si algún día hay push web vía expo, volver a import estático.
export async function loadNotifications(): Promise<NotificationsModule | null> {
	if (Platform.OS === "web") return null;
	// Push remoto eliminado de Expo Go (SDK 53+): evaluar el módulo ahí
	// lanza en Android (warnOfExpoGoPushUsage). Solo dev builds reales.
	if (Constants.appOwnership === "expo") return null;
	return import("expo-notifications");
}

// ─── Device token sync ──────────────────────────────────────────────
/**
 * Saves/updates this device's push token for the current user.
 * `request: false` solo sincroniza si el permiso ya está concedido
 * (registro automático post-login, sin prompt del SO).
 */
export async function syncDeviceToken(
	userId: string,
	opts: { request?: boolean } = {},
): Promise<boolean> {
	const { request = true } = opts;
	if (Platform.OS === "web") {
		// PWA: FCM via service worker + VAPID (expo-notifications has no
		// remote push on web). Platform-split import keeps firebase out of
		// the native bundle.
		const mod = await import("./web-push.web");
		return mod.syncWebPushToken(userId, { request });
	}

	const Notifications = await loadNotifications();
	if (!Notifications) return false;

	let token: string | null = null;
	try {
		const { status } = await Notifications.getPermissionsAsync();
		if (status !== "granted") {
			if (!request) return false;
			const requested = await Notifications.requestPermissionsAsync();
			if (requested.status !== "granted") return false;
		}

		const projectId = env.EXPO_PUBLIC_EAS_PROJECT_ID || null;
		if (!projectId) {
			// ponytail: sin proyecto EAS no hay token de Expo push (el error
			// crudo de expo-installations llegaba hasta el toast). Solución
			// real: `eas init` para generar extra.eas.projectId en app.json.
			console.warn(
				"[notifications] EXPO_PUBLIC_EAS_PROJECT_ID no configurado — push nativo deshabilitado en este build",
			);
			return false;
		}
		const ticket = await Notifications.getExpoPushTokenAsync({
			projectId,
		});
		token = ticket.data;
	} catch {
		return false; // Permission/token unavailable — not fatal.
	}
	if (!token) return false;

	try {
		// En builds soportados Platform.OS es ios|android|web; el cast solo
		// satisface la union completa de react-native (macos/windows).
		await upsertDeviceToken(userId, token, Platform.OS as DeviceTokenPlatform);
	} catch (error) {
		throw toAppError(error, "Error al registrar el dispositivo");
	}
	return true;
}

export async function removeDeviceToken(userId: string): Promise<void> {
	await deleteDeviceTokens(userId);
}

/**
 * Revoca los tokens push del usuario con write-ahead: registra la intención
 * ANTES de tocar la red y solo borra el registro cuando la API confirma.
 *
 * POR QUÉ ES UNA FUNCIÓN COMPARTIDA y no dos call sites con la misma secuencia:
 * los dos caminos que dejan un token huérfano son el logout y el toggle de push
 * en "off", y ninguno puede bloquearse ni abandonar la revocación a medias. Un
 * `DELETE` fallido con la preferencia ya guardada deja al usuario recibiendo
 * push con su preferencia en "off". Un segundo mecanismo sería una segunda
 * oportunidad de olvidarse del registro.
 *
 * Nunca lanza: el logout no puede quedar bloqueado por la red, y apagar el
 * toggle tampoco. El reintento ocurre en el próximo arranque autenticado del
 * mismo usuario (`app/_layout.tsx`), el único momento con sesión que RLS acepta
 * para borrar tokens.
 */
export async function revokeDeviceTokensWithRetry(
	userId: string,
): Promise<void> {
	await pendingDeviceTokenRevocationRepository.schedule(userId).catch(() => {
		// Sin registro local no hay reintento posible, pero ni el logout ni el
		// toggle pueden quedar bloqueados por el almacenamiento del dispositivo.
	});
	await removeDeviceToken(userId)
		.then(() => pendingDeviceTokenRevocationRepository.clear())
		.catch(() => {
			// El registro pendiente conserva la revocación para el próximo
			// arranque autenticado.
		});
}

// ─── In-app notification handler (solo nativo) ──────────────────────
let responseListenerRegistered = false;

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

	const redirectFromResponse = (response: NotificationResponse) => {
		const route = resolveNotificationRoute(
			response.notification.request.content.data ?? {},
		);
		if (route) router.push(route as Parameters<typeof router.push>[0]);
	};

	const lastResponse = Notifications.getLastNotificationResponse();
	if (lastResponse) redirectFromResponse(lastResponse);
	if (!responseListenerRegistered) {
		Notifications.addNotificationResponseReceivedListener(redirectFromResponse);
		responseListenerRegistered = true;
	}
}
