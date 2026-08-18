import { Stack } from "expo-router";

/** Profile sub-navigation (tab content + nested screens). */
export default function ProfileLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen name="favorites" />
			<Stack.Screen name="orders" />
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