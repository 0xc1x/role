import { Redirect, Tabs, useSegments } from "expo-router";
import { Package, ShoppingBag, Store } from "lucide-react-native";
import { useLayoutEffect } from "react";
import { View } from "react-native";
import { PortalHost } from "@rn-primitives/portal";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";

import { useAuthStore } from "@/src/features/auth/store";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import Navbar from "@/src/core/ui/Navbar";
import {
	useTabBarStore,
	setTabBarProps,
	withSyncedTabIndex,
} from "@/src/core/ui/tabbar-store";

function TabBarCapture(props: BottomTabBarProps) {
	// Write-through síncrono en cada commit (ver ConsumerLayout): evita que
	// el tab resaltado laguee la ruta real.
	useLayoutEffect(() => setTabBarProps(props));
	return null;
}

function OuterBar() {
	const props = useTabBarStore((s) => s.props);
	const segments = useSegments();
	// Igual que el layout consumer: el índice se re-deriva del segmento
	// actual para no laguear la ruta en nativo (ver tabbar-store).
	const synced = props ? withSyncedTabIndex(props, segments) : null;
	if (!synced) return null;
	return (
		<View style={{ zIndex: 1100 }}>
			{/* Sin dueño mapeado (deep link) cae en fallbackTabName. */}
			<Navbar {...synced} fallbackTabName="management" />
		</View>
	);
}

/** Barra de pestañas del modo negocio (misma interacción que el modo consumidor). */
export default function BusinessLayout() {
	const { status, profile, initialized } = useAuthStore();
	const { colors } = useTheme();

	if (status === "loading" || !initialized) return null;
	const isBusiness = profile?.role === "business" || profile?.role === "admin";

	if (!isBusiness) {
		return <Redirect href="/" />;
	}

	return (
		<View style={{ flex: 1 }}>
		{/* Igual que el layout consumer: OuterBar en flujo (no overlay)
		    y único dueño del aire inferior (ver comentario allí). Sin
		    padding duplicado: se leía como franja en todas las tabs. */}
			<View
				style={{
					flex: 1,
					backgroundColor: colors.background,
				}}
			>
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
					<Package size={size} color={color} />
				),
				}}
			/>
			<Tabs.Screen
				name="orders"
				options={{
					title: strings.business.orders,
					tabBarLabel: strings.business.orders,
				tabBarIcon: ({ color, size }) => (
					<ShoppingBag size={size} color={color} />
				),
				}}
			/>
			<Tabs.Screen
				name="management"
				options={{
					title: strings.business.title,
					tabBarLabel: strings.business.title,
				tabBarIcon: ({ color, size }) => (
					<Store size={size} color={color} />
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