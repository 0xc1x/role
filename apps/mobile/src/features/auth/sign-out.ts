import { router } from "expo-router";

import { queryClient } from "@/src/core/query/client";
import { authRepository } from "./data/repository";
import { useAuthStore } from "./store";
import {
	pendingDeviceTokenRevocationRepository,
	removeDeviceToken,
} from "@/src/features/notifications";

/**
 * Cierre de sesión completo: desvincula el token push de este dispositivo,
 * cierra sesión en Supabase y resetea el store.
 */
export async function performSignOut(): Promise<void> {
	const userId = useAuthStore.getState().profile?.id;
	if (userId) {
		// Write-ahead: la revocación se registra antes de tocar la red. Si el
		// `DELETE` falla, la fila de `device_tokens` sobrevive al cierre de
		// sesión y Supabase sigue entregando push a un dispositivo sin sesión.
		await pendingDeviceTokenRevocationRepository.schedule(userId).catch(() => {
			// Sin registro local no hay reintento posible, pero el logout tampoco
			// puede quedar bloqueado por el almacenamiento del dispositivo.
		});
		await removeDeviceToken(userId)
			.then(() => pendingDeviceTokenRevocationRepository.clear())
			.catch(() => {
				// Si falla la desvinculación, cerramos sesión igual: el registro
				// pendiente reintenta en el próximo arranque autenticado del mismo
				// usuario, el único momento con sesión que RLS acepta.
			});
	}
	await authRepository.signOut();
	useAuthStore.getState().clear();
	// Evita que datos del usuario anterior (órdenes, favoritos, etc.)
	// sobrevivan al logout en la caché de la sesión siguiente.
	queryClient.clear();
	router.replace("/(auth)/login");
}
