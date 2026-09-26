import { router } from "expo-router";

import { queryClient } from "@/src/core/query/client";
import { authRepository } from "./data/repository";
import { useAuthStore } from "./store";
import { revokeDeviceTokensWithRetry } from "@/src/features/notifications";

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
		// El logout nunca se bloquea por eso: el registro reintenta en el
		// próximo arranque autenticado del mismo usuario.
		await revokeDeviceTokensWithRetry(userId);
	}
	await authRepository.signOut();
	useAuthStore.getState().clear();
	// Evita que datos del usuario anterior (órdenes, favoritos, etc.)
	// sobrevivan al logout en la caché de la sesión siguiente.
	queryClient.clear();
	router.replace("/(auth)/login");
}
