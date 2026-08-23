import { Redirect, Tabs } from "expo-router";
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

/** Barra de pestañas del modo negocio (misma interacción que el modo consumidor). */
export default function BusinessLayout() {
	const { status, profile, initialized } = useAuthStore();

	if (status === "loading" || !initialized) return null;
	const isBusiness = profile?.role === "business" || profile?.role === "admin";

	if (!isBusiness) {
		return <Redirect href="/" />;
	}

	return (
		<View style={{ flex: 1 }}>
			<View style={{ flex: 1 }}>
				<Tabs
					tabBar={(props) => <TabBarCapture {...props} />}
					screenOptions={{ headerShown: false }}
				>
			<Tabs.Screen
				name="products"
				options={{
					title: strings.business.products,
					tabBarLabel: strings.business.products,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="cube-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="orders"
				options={{
					title: strings.business.orders,
					tabBarLabel: strings.business.orders,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="bag-handle-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="management"
				options={{
					title: strings.business.title,
					tabBarLabel: strings.business.title,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="storefront-outline" size={size} color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: strings.business.profile,
					tabBarLabel: strings.business.profile,
					href: null,
					tabBarIcon: ({ color, size }) => (
						<Ionicons name="person-outline" size={size} color={color} />
					),
				}}
			/>
			{/* Sub-secciones de un negocio concreto (payouts, cupones, ayuda…):
			    navegan dentro del grupo para conservar la navbar. */}
			<Tabs.Screen name="business/[id]" options={{ href: null }} />
				</Tabs>
			</View>
			<PortalHost name="TAB_SHEET" />
			<OuterBar />
		</View>
	);
}