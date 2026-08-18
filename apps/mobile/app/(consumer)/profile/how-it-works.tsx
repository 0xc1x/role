import { useEffect } from "react";
import { router } from "expo-router";
import InfoScreen from "@/core/ui/InfoScreen";
import { strings } from "@/core/i18n/strings";
import { useAuthStore } from "@/features/auth/store";

export default function HowItWorksScreen() {
	const { status, initialized } = useAuthStore();

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	return (
		<InfoScreen
			title={strings.profile.howItWorks}
			body={strings.landing.howItWorksBody}
		/>
	);
}