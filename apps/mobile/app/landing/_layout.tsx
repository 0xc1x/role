import { Stack } from "expo-router";

import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";

/** In-app marketing landing group (shown to guests before auth). */
export default function LandingLayout() {
	// contentStyle temático: sin esto la tarjeta del native-stack usa el
	// blanco por defecto y flashea en las transiciones en nativo (en web no
	// se nota porque pinta el DOM).
	const { colors } = useTheme();
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: colors.background },
			}}
		>
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
