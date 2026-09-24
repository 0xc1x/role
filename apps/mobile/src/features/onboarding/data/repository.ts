import AsyncStorage from "@react-native-async-storage/async-storage";

import { onboardingSeenKey } from "../domain/onboarding";

/**
 * Marca "vista" del onboarding para el viewer dado (AsyncStorage local).
 * Nunca lanza: storage roto/inexistente se trata como "no visto", así el
 * gate puede volver a mostrarlo en vez de romper el arranque.
 */
export async function hasSeenOnboarding(
	profileId: string | null | undefined,
): Promise<boolean> {
	try {
		const raw = await AsyncStorage.getItem(onboardingSeenKey(profileId));
		return raw === "true";
	} catch {
		// Storage no disponible — tratar como primera visita.
		return false;
	}
}

/** Escribe la marca "vista". Falla silenciosa (mismo estilo que theme/index). */
export function markOnboardingSeen(
	profileId: string | null | undefined,
): Promise<void> {
	return AsyncStorage.setItem(onboardingSeenKey(profileId), "true").catch(
		() => {},
	);
}
