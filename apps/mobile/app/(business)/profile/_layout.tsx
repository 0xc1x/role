import { Stack } from "expo-router";

/** Business profile sub-navigation (tab content + nested screens). */
export default function BusinessProfileLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen name="edit" />
			<Stack.Screen name="dashboard" />
			<Stack.Screen name="stats" />
		</Stack>
	);
}