import { Stack } from "expo-router";

import { useTheme } from "@/src/core/theme";

export default function AuthLayout() {
	// contentStyle temático: sin esto la tarjeta del native-stack usa el
	// blanco por defecto y flashea en las transiciones en nativo.
	const { colors } = useTheme();
	return (
		<Stack
			screenOptions={{
			headerShown: false,
				contentStyle: { backgroundColor: colors.background },
			}}
		>
			<Stack.Screen name="login" />
			<Stack.Screen name="signup" />
			<Stack.Screen name="update-password" />
		</Stack>
	);
}
