import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/src/features/auth/store";
import { useOnboardingState } from "@/src/features/onboarding";
import { LoadingView } from "@/src/core/ui";

/**
 * Gate de arranque: único dueño de la decisión "a dónde va este viewer".
 * El launcher entra por aquí y también el signup (que publica el perfil en el
 * store y luego navega a "/"), de modo que un cliente que se registra pasa por
 * el mismo gate rol-aware que un invitado que abre la app por primera vez.
 */
export default function IndexRedirect() {
	const router = useRouter();
	const { status, profile, initialized } = useAuthStore();
	const { showOnboarding, resolved } = useOnboardingState();

	useEffect(() => {
		if (!initialized || status === "loading") return;

		// Admin: operador de plataforma, sin onboarding de vendedor. Entra
		// directo al panel sin esperar storage (nunca consulta la marca).
		if (profile?.role === "admin") {
			router.replace("/(business)/products");
			return;
		}

		// Gate business: espera `resolved` como consumer, porque su marca
		// vista también vive en AsyncStorage (mismo patrón que `initialized`).
		if (profile?.role === "business") {
			if (!resolved) return;
			router.replace(
				showOnboarding ? "/onboarding" : "/(business)/products",
			);
			return;
		}

		// Gate consumer/guest: esperar a que resuelva AsyncStorage para no
		// flashear el home antes de decidir (mismo patrón que `initialized`).
		if (!resolved) return;

		if (showOnboarding) {
			router.replace("/onboarding");
			return;
		}

		router.replace("/(consumer)");
	}, [status, profile, initialized, resolved, showOnboarding, router]);

	// Gate de redirección, pero la espera es real: la splash raíz tiene un
	// timeout de 6s y, si la sesión o el storage no resuelven, `null` dejaba al
	// usuario en una pantalla completamente vacía y sin navegación.
	return <LoadingView />;
}
