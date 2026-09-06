import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import * as Notifications from "expo-notifications";

import { strings } from "@/core/i18n/strings";
import { syncDeviceToken } from "./";

/**
 * Estado real del permiso, pidiéndolo solo si está en "default".
 * "denied" es pegajoso (el navegador/SO nunca vuelven a preguntar).
 */
async function ensurePushPermission(): Promise<"granted" | "denied"> {
	if (Platform.OS === "web") {
		if (typeof window === "undefined" || !("Notification" in window)) {
			return "denied";
		}
		if (Notification.permission === "default") {
			await Notification.requestPermission();
		}
		return Notification.permission === "granted" ? "granted" : "denied";
	}
	const current = await Notifications.getPermissionsAsync();
	if (current.status === "granted") return "granted";
	const requested = await Notifications.requestPermissionsAsync();
	return requested.status === "granted" ? "granted" : "denied";
}

/**
 * Activa push desde las pantallas de preferencias: permiso → registro del
 * token → preferencia del usuario (`setPushEnabled`). Con lock anti
 * doble-tap: mientras el registro corre, `registering` deshabilita el
 * switch y las llamadas repetidas a `enablePush` se ignoran.
 */
export function usePushToggle(
	userId: string,
	setPushEnabled: () => Promise<unknown>,
) {
	const [registering, setRegistering] = useState(false);
	const registeringRef = useRef(false);

	const enablePush = useCallback(async () => {
		if (registeringRef.current) return;
		registeringRef.current = true;
		setRegistering(true);
		try {
			const permission = await ensurePushPermission();
			if (permission === "denied") {
				// Permiso pegajoso: ni el navegador ni el SO volverán a
				// preguntar; guiamos al usuario a desbloquearlo manualmente.
				toast.error(
					Platform.OS === "web"
						? strings.notificationsSettings.blockedBrowser
						: strings.notificationsSettings.blockedDevice,
					{ duration: 8000 },
				);
				return;
			}
			try {
				const registered = await syncDeviceToken(userId);
				if (!registered) return; // Permiso denegado — sin toast.
				toast.success(strings.notificationsSettings.pushEnabled);
			} catch (e) {
				// 23505 = el token ya estaba registrado: igual de válido.
				const code = (e as { code?: string }).code;
				if (code !== "23505") {
					toast.error(
						e instanceof Error
							? e.message
							: strings.notificationsSettings.registerFailed,
					);
					return;
				}
			}
			await setPushEnabled().catch(() => {});
		} finally {
			registeringRef.current = false;
			setRegistering(false);
		}
	}, [userId, setPushEnabled]);

	return { registering, enablePush };
}
