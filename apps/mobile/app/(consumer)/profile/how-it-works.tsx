import { useEffect } from "react";
import { router } from "expo-router";
import InfoScreen from "@/src/core/ui/InfoScreen";
import { strings } from "@/src/core/i18n/strings";
import { useAuthStore } from "@/src/features/auth/store";

export default function HowItWorksScreen() {
	const { status, initialized } = useAuthStore();

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	if (!initialized || status === "guest") return null;

	return (
		<InfoScreen
			title={strings.profile.howItWorks}
			body={strings.landing.howItWorksBody}
		/>
	);
}