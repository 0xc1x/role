import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/src/features/auth/store";
import { useOnboardingState } from "@/src/features/onboarding";

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

	return null;
}
