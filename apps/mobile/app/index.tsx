import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/features/auth/store";

export default function IndexRedirect() {
	const router = useRouter();
	const { status, profile, initialized } = useAuthStore();

	useEffect(() => {
		if (!initialized || status === "loading") return;

		const isBusiness = profile?.role === "business" || profile?.role === "admin";

		if (status === "guest") {
			router.replace("/(consumer)");
			return;
		}

		if (isBusiness) {
			router.replace("/(business)/products");
		} else {
			router.replace("/(consumer)");
		}
	}, [status, profile, initialized, router]);

	return null;
}