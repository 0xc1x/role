import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useFonts } from "expo-font";
import {
	Outfit_600SemiBold,
	Outfit_700Bold,
	Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
	DMSans_400Regular,
	DMSans_500Medium,
	DMSans_600SemiBold,
	DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import * as SplashScreen from "expo-splash-screen";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalHost } from "@rn-primitives/portal";
import { Platform } from "react-native";

// Polyfill for Reanimated 3 on web: mirror DEFAULT_LOGGER_CONFIG so that
// `logger.warn/error` find a `logFunction` (plain `{ level }` crashes with
// "config.logFunction is not a function").
if (Platform.OS === "web") {
	// @ts-ignore - needed for Reanimated 3 web
	global.__reanimatedLoggerConfig = {
		level: 1, // warn
		strict: false,
		logFunction: (data: { level: string; message: { content: string } }) => {
			if (data.level === "warn") console.warn(data.message.content);
			else console.error(data.message.content);
		},
	};
}

import { ThemeProvider, light } from "@/core/theme";
import { queryClient } from "@/core/query/client";
import { analytics } from "@/core/analytics";
import { appConfigQueryOptions } from "@/features/config";
import { useAuthStore, watchAuthState } from "@/features/auth/store";
import { initNotificationHandler, syncDeviceToken } from "@/features/notifications";
import { Toaster } from "sonner-native";
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const [fontsLoaded] = useFonts({
		Outfit_600SemiBold,
		Outfit_700Bold,
		Outfit_800ExtraBold,
		DMSans_400Regular,
		DMSans_500Medium,
		DMSans_600SemiBold,
		DMSans_700Bold,
	});
	const initialize = useAuthStore((s) => s.initialize);
	const [configReady, setConfigReady] = useState(false);

	useEffect(() => {
		analytics.init();
		watchAuthState();
		void initialize();
		void initNotificationHandler();
		return () => {
			// watcher is store-bound; nothing to clean here
		};
	}, [initialize]);

	// Primera consulta de la app: config dinámica desde Supabase mientras
	// la splash screen sigue visible. Con guard de timeout para no bloquear
	// el arranque si la red falla (los hooks usan fallbacks).
	useEffect(() => {
		let cancelled = false;
		const timeout = setTimeout(() => {
			if (!cancelled) setConfigReady(true);
		}, 2500);
		queryClient
			.prefetchQuery(appConfigQueryOptions)
			.finally(() => {
				if (!cancelled) setConfigReady(true);
			});
		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, []);

	useEffect(() => {
		if (fontsLoaded && configReady) {
			void SplashScreen.hideAsync();
		}
	}, [fontsLoaded, configReady]);

	// Registro automático de push post-login (una vez por usuario).
	const authStatus = useAuthStore((s) => s.status);
	const authProfileId = useAuthStore((s) => s.profile?.id);
	const syncedFor = useRef<string | null>(null);
	useEffect(() => {
		if (authStatus !== "authenticated" || !authProfileId) return;
		if (syncedFor.current === authProfileId) return;
		syncedFor.current = authProfileId;
		syncDeviceToken(authProfileId).catch(() => {
			// Sin permiso/token: no es fatal; se puede activar desde Ajustes.
			syncedFor.current = null;
		});
	}, [authStatus, authProfileId]);

	// Link de recovery aterrizó en cualquier ruta: mandar a actualizar
	// contraseña antes de que el redirect por rol se lo lleve a home.
	const pendingRecovery = useAuthStore((s) => s.pendingPasswordRecovery);
	const router = useRouter();
	useEffect(() => {
		if (pendingRecovery) {
			useAuthStore.setState({ pendingPasswordRecovery: false });
			router.replace("/(auth)/update-password");
		}
	}, [pendingRecovery, router]);

	if (!fontsLoaded || !configReady) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<Stack
						screenOptions={{
							headerShown: false,
							contentStyle: { backgroundColor: light.background },
						}}
					>
						<Stack.Screen name="(auth)" />
						<Stack.Screen name="(consumer)" />
						<Stack.Screen name="(business)" />
						<Stack.Screen name="landing" />
					</Stack>
          <Toaster/>
					<PortalHost />
				</QueryClientProvider>
        
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}
