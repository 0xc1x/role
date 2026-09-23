import { router } from "expo-router";
import { useState } from "react";
import { Button, Platform, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Static import crashes web (react-native-maps has no web implementation),
// so load it lazily on native only.
const MapLib =
	Platform.OS === "web"
		? null
		: (require("react-native-maps") as typeof import("react-native-maps"));
const MapView = MapLib?.default;
const PROVIDER_GOOGLE = MapLib?.PROVIDER_GOOGLE;

// Temporary probe: deliberately independent of product UI, theme, and data hooks.
export default function MapDiagnosticScreen() {
	const [mapReady, setMapReady] = useState(false);
	const [mapLoaded, setMapLoaded] = useState(false);

	return (
		<SafeAreaView style={{ flex: 1, padding: 16, gap: 12, backgroundColor: "white" }}>
			<Button
				title="Volver"
				accessibilityLabel="Volver a la pantalla anterior"
				onPress={() => router.back()}
			/>
			<Text accessibilityRole="header" style={{ color: "black" }}>
				Diagnóstico de Google Maps — Ciudad de México
			</Text>
			<Text style={{ color: "black" }}>
				onMapReady: {String(mapReady)} · onMapLoaded: {String(mapLoaded)}
			</Text>
			<Text style={{ color: "black" }}>
				Son señales de callbacks; no prueban que se hayan descargado los mosaicos del mapa.
			</Text>
			{Platform.OS === "web" || MapView == null || PROVIDER_GOOGLE == null ? (
				<Text style={{ color: "black" }}>
					Maps are native-only (iOS/Android).
				</Text>
			) : (
				<MapView
					style={{ flex: 1, width: "100%" }}
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
