import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/features/auth/store";
import { strings } from "@/core/i18n/strings";
import { RoleTabBar } from "@/core/ui";

export default function ConsumerLayout() {
	const status = useAuthStore((s) => s.status);

	if (status === "loading") return null;

	return (
		<Tabs
			tabBar={(props) => <RoleTabBar {...props} />}
			screenOptions={{ headerShown: false }}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: strings.home.title,
					tabBarLabel: strings.home.title,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="home-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="explore"
				options={{
					title: strings.explore.title,
					tabBarLabel: strings.explore.title,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="search-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: strings.profile.title,
					tabBarLabel: strings.profile.title,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="person-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen name="_" options={{ href: null }} />
		</Tabs>
	);
}