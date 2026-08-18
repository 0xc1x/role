import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

import { useTheme } from "@/core/theme";
import type { MapCanvasHandle, MapCanvasProps } from "./MapCanvas.types";

const DEFAULT_REGION = {
	latitude: -0.22985,
	longitude: -78.52495,
	latitudeDelta: 0.02,
	longitudeDelta: 0.02,
};

export type { MapCanvasHandle };
export type { MapCanvasProps };

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
	function MapCanvas(
		{ coords, fullscreen = false, onRegionChange },
		ref,
	) {
		const { colors } = useTheme();
		const mapRef = useRef<MapView>(null);

		useImperativeHandle(
			ref,
			() => ({
				animateToRegion: (next, delta = 0.01) => {
					mapRef.current?.animateToRegion(
						{ ...next, latitudeDelta: delta, longitudeDelta: delta },
						500,
					);
				},
			}),
			[],
		);

		return (
			<MapView
				ref={mapRef}
				style={fullscreen ? styles.fullscreenMap : styles.map}
				initialRegion={{
					...DEFAULT_REGION,
					latitude: coords.latitude,
					longitude: coords.longitude,
				}}
				onRegionChangeComplete={(region) =>
					onRegionChange({
						latitude: region.latitude,
						longitude: region.longitude,
					})
				}
				showsUserLocation={!fullscreen}
				showsCompass={false}
			>
				<Marker coordinate={coords} anchor={{ x: 0.5, y: 0.5 }}>
					<View style={styles.pinShadow}>
						<Ionicons
							name="location"
							size={40}
							color={colors.primary}
							style={styles.pin}
						/>
					</View>
				</Marker>
			</MapView>
		);
	},
);

const styles = StyleSheet.create({
	map: { flex: 1 },
	fullscreenMap: { flex: 1 },
	pinShadow: { alignItems: "center", justifyContent: "center" },
	pin: { marginTop: -30, textShadowColor: "rgba(0,0,0,0.2)", textShadowRadius: 3 },
});