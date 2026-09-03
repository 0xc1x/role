import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { View } from "react-native";
import { PortalHost } from "@rn-primitives/portal";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

import { useAuthStore } from "@/features/auth/store";
import { strings } from "@/core/i18n/strings";
import RoleTabBar from "@/core/ui/RoleTabBar";
import { useTabBarStore, setTabBarProps } from "@/core/ui/tabbar-store";

function TabBarCapture(props: BottomTabBarProps) {
	const barKey = `${props.state.index}:${props.state.routes.map((r) => r.key).join("|")}`;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setTabBarProps(props), [barKey]);
	return null;
}

function OuterBar() {
	const props = useTabBarStore((s) => s.props);
	if (!props) return null;
	return (
		<View style={{ zIndex: 1100 }}>
			<RoleTabBar {...props} />
		</View>
	);
}

export default function ConsumerLayout() {
	const status = useAuthStore((s) => s.status);

	if (status === "loading") return null;

	return (
		<View style={{ flex: 1 }}>
			<View style={{ flex: 1 }}>
				<Tabs
					tabBar={(props) => <TabBarCapture {...props} />}
					screenOptions={{ headerShown: false }}
					/* El botón físico Android en un tab base vuelve al tab
					   previo (historial real) en vez de saltar al primer tab. */
					backBehavior="history"
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
				</Tabs>
			</View>
			<PortalHost name="TAB_SHEET" />
			<OuterBar />
		</View>
	);
}