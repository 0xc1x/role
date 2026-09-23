import { Tabs, useSegments } from "expo-router";
import { House, Receipt, Search, User } from "lucide-react-native";
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
	// Write-through síncrono en cada commit del navegador de tabs: el
	// snapshot post-paint con useEffect/barKey dejaba a OuterBar un frame
	// (o más) por detrás de la ruta real y el tab resaltado no la seguía.
	// Sin deps: TabBarCapture solo re-renderiza cuando Tabs lo invoca.
	useLayoutEffect(() => setTabBarProps(props));
	return null;
}

function OuterBar() {
	const props = useTabBarStore((s) => s.props);
	const segments = useSegments();
	// `state.index` del snapshot llega un commit tarde (el layout-effect de
	// TabBarCapture escribe post-commit): se re-deriva del segmento actual,
	// que sí va en el mismo commit que la ruta. Misma ref si no hay cambio.
	const synced = props ? withSyncedTabIndex(props, segments) : null;
	if (!synced) return null;
	return (
		<View style={{ zIndex: 1100 }}>
			{/* Deep links a rutas ocultas caen en el home (paridad con
			    fallbackTabName="management" del layout business). */}
			<Navbar {...synced} fallbackTabName="index" />
		</View>
	);
}

export default function ConsumerLayout() {
	const status = useAuthStore((s) => s.status);
	const { colors } = useTheme();

	if (status === "loading") return null;

	return (
		<View style={{ flex: 1 }}>
		{/* OuterBar va en flujo bajo los tabs (no es overlay) y es el
		    único dueño del aire inferior: el padding de diseño lo pone el
		    contenido de cada pantalla y el inset del gesto lo pone Navbar.
		    Sin padding aquí: apilaba spacing.lg sobre ambos y se leía
		    como franja en todas las pantallas con tabs. El fondo temático
		    funde la zona con Screen (sin costuras en light/dark). */}
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
						name="index"
						options={{
							title: strings.home.title,
							tabBarLabel: strings.home.title,
					tabBarIcon: ({ color, size }) => (
						<House size={size} color={color} />
					),
						}}
					/>
					<Tabs.Screen
						name="explore"
						options={{
							title: strings.explore.title,
							tabBarLabel: strings.explore.title,
					tabBarIcon: ({ color, size }) => (
						<Search size={size} color={color} />
					),
						}}
					/>
					<Tabs.Screen
						name="orders"
						options={{
							title: strings.orders.tabTitle,
							tabBarLabel: strings.orders.tabTitle,
					tabBarIcon: ({ color, size }) => (
						<Receipt size={size} color={color} />
					),
						}}
					/>
					<Tabs.Screen
						name="profile"
						options={{
							title: strings.profile.title,
							tabBarLabel: strings.profile.title,
					tabBarIcon: ({ color, size }) => (
						<User size={size} color={color} />
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