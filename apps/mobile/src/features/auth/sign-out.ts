import { router } from "expo-router";

import { authRepository } from "./data/repository";
import { useAuthStore } from "./store";
import { removeDeviceToken } from "@/features/notifications";

/**
 * Cierre de sesión completo: desvincula el token push de este dispositivo,
 * cierra sesión en Supabase y resetea el store.
 */
export async function performSignOut(): Promise<void> {
	const userId = useAuthStore.getState().profile?.id;
	if (userId) {
		await removeDeviceToken(userId).catch(() => {
			// Si falla la desvinculación, cerramos sesión igual.
		});
	}
	await authRepository.signOut();
	useAuthStore.getState().clear();
	router.replace("/(auth)/login");
}
