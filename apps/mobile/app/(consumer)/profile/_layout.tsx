import { Stack } from "expo-router";

import { useTheme } from "@/src/core/theme";

/** Profile sub-navigation (tab content + nested screens). */
export default function ProfileLayout() {
	// contentStyle temático: sin esto la tarjeta del native-stack usa el
	// blanco por defecto y flashea al volver atrás en nativo.
	const { colors } = useTheme();
	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: colors.background },
			}}
		>
			<Stack.Screen name="index" />
			<Stack.Screen name="favorites" />
			<Stack.Screen name="reviews" />
			<Stack.Screen name="edit" />
			<Stack.Screen name="addresses" />
			<Stack.Screen name="payment-methods" />
			<Stack.Screen name="notifications" />
			<Stack.Screen name="settings" />
			<Stack.Screen name="help" />
			<Stack.Screen name="help/[section]" />
			<Stack.Screen name="how-it-works" />
			<Stack.Screen name="about" />
			<Stack.Screen name="terms" />
			<Stack.Screen name="privacy" />
		</Stack>
	);
}