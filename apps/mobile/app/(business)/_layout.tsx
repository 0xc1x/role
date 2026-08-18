import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuthStore } from "@/features/auth/store";
import { strings } from "@/core/i18n/strings";
import { RoleTabBar } from "@/core/ui";

/** Barra de pestañas del modo negocio (misma interacción que el modo consumidor). */
export default function BusinessLayout() {
	const { status, profile, initialized } = useAuthStore();

	if (status === "loading" || !initialized) return null;
	const isBusiness = profile?.role === "business" || profile?.role === "admin";

	if (!isBusiness) {
		return <Redirect href="/" />;
	}

	return (
		<Tabs
			tabBar={(props) => <RoleTabBar {...props} />}
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
		</Tabs>
	);
}