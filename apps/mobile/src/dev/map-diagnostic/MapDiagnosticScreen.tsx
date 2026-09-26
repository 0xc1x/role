import { router } from "expo-router";
import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
import { Button } from "@/components/ui/button";

/**
 * Sonda temporal de Google Maps (Ciudad de México).
 *
 * NO es una ruta de la app: vive en `src/dev/` y no en `app/`, así que
 * expo-router no la publica y no puede aparecer en un build de producción.
 * Antes era `app/map-diagnostic.tsx`, alcanzable en `/map-diagnostic` desde
 * cualquier build — con tres hex inline y un string en inglés.
 *
 * Para volver a usarla: muévela a `app/map-diagnostic.tsx` temporalmente
 * (el router se regenera solo en el siguiente `expo start` / `expo export`)
 * y bórrala de aquí al terminar.
 */

// Static import crashes web (react-native-maps has no web implementation),
// so load it lazily on native only.
const MapLib =
	Platform.OS === "web"
		? null
		: (require("react-native-maps") as typeof import("react-native-maps"));
const MapView = MapLib?.default;
const PROVIDER_GOOGLE = MapLib?.PROVIDER_GOOGLE;

export function MapDiagnosticScreen() {
	const { colors } = useTheme();
	const [mapReady, setMapReady] = useState(false);
	const [mapLoaded, setMapLoaded] = useState(false);
	const copy = strings.dev.mapDiagnostic;

	return (
		<SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
			<Button
				variant="outline"
				onPress={() => router.back()}
				accessibilityLabel={copy.back}
			>
				{strings.common.back}
			</Button>
			<AppText variant="h3" weight="bold">
				{copy.title}
			</AppText>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{copy.callbackState
					.replace("{ready}", String(mapReady))
					.replace("{loaded}", String(mapLoaded))}
			</AppText>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{copy.callbackNote}
			</AppText>
			{Platform.OS === "web" || MapView == null || PROVIDER_GOOGLE == null ? (
				<AppText variant="bodyMedium">{copy.nativeOnly}</AppText>
			) : (
				<MapView
					style={styles.map}
					provider={PROVIDER_GOOGLE}
					mapType="standard"
					initialRegion={{
						latitude: 19.4326,
						longitude: -99.1332,
						latitudeDelta: 0.05,
						longitudeDelta: 0.05,
					}}
					onMapReady={() => setMapReady(true)}
					onMapLoaded={() => setMapLoaded(true)}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, padding: spacing.xl, gap: spacing.md },
	map: { flex: 1, width: "100%", borderRadius: radii.md },
});
