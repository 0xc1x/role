import { Stack } from "expo-router";

import { strings } from "@/core/i18n/strings";

/** In-app marketing landing group (shown to guests before auth). */
export default function LandingLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="how-it-works"
				options={{ title: strings.landing.howItWorks }}
			/>
			<Stack.Screen
				name="for-business"
				options={{ title: strings.landing.forBusiness }}
			/>
		</Stack>
	);
}
