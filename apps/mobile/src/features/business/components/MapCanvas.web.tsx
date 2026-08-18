import { Ionicons } from "@expo/vector-icons";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View } from "react-native";

import { env } from "@/core/config/env";
import { useTheme } from "@/core/theme";
import type { MapCanvasHandle, MapCanvasProps } from "./MapCanvas.types";

function zoomForDelta(delta: number): number {
	const zoom = Math.round(Math.log2(360 / Math.max(delta, 0.0001)));
	return Math.min(Math.max(zoom, 1), 20);
}

const MapCanvasInner = forwardRef<MapCanvasHandle, MapCanvasProps>(
	function MapCanvasInner({ coords, fullscreen = false, onRegionChange }, ref) {
		const { colors } = useTheme();
		const map = useMap();

		useImperativeHandle(
			ref,
			() => ({
				animateToRegion: (next, delta = 0.01) => {
					map?.panTo({ lat: next.latitude, lng: next.longitude });
					map?.setZoom(zoomForDelta(delta));
				},
			}),
			[map],
		);

		return (
			<View style={fullscreen ? styles.fullscreenMap : styles.map}>
				<Map
					mapId="role-map"
					defaultCenter={{ lat: coords.latitude, lng: coords.longitude }}
					defaultZoom={15}
					gestureHandling="greedy"
					disableDefaultUI
					onCameraChanged={(ev) => {
						const { center } = ev.detail;
						onRegionChange({ latitude: center.lat, longitude: center.lng });
					}}
				/>
				<View pointerEvents="none" style={styles.pinWrap}>
					<Ionicons
						name="location"
						size={40}
						color={colors.primary}
						style={styles.pin}
					/>
				</View>
			</View>
		);
	},
);

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
	function MapCanvas(props, ref) {
		return (
			<APIProvider apiKey={env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}>
				<MapCanvasInner ref={ref} {...props} />
			</APIProvider>
		);
	},
);

const styles = StyleSheet.create({
	map: { flex: 1 },
	fullscreenMap: { flex: 1 },
	pinWrap: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 10,
	},
	pin: {
		marginTop: -30,
		textShadowColor: "rgba(0,0,0,0.2)",
		textShadowRadius: 3,
	},
});