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
			{/* Sin dueño mapeado (deep link) cae en fallbackTabName. */}
			<RoleTabBar {...props} fallbackTabName="management" />
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
					/* El botón físico Android en un tab base vuelve al tab
					   previo (historial real) en vez de saltar al primer tab. */
					backBehavior="history"
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
		</Tabs>
			</View>
			<PortalHost name="TAB_SHEET" />
			<OuterBar />
		</View>
	);
}