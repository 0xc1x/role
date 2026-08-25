import { Ionicons } from "@expo/vector-icons";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { env } from "@/core/config/env";
import { useTheme } from "@/core/theme";
import type { MapCanvasHandle, MapCanvasProps } from "./MapCanvas.types";
function zoomForDelta(delta: number): number {
	const zoom = Math.round(Math.log2(360 / Math.max(delta, 0.0001)));
	return Math.min(Math.max(zoom, 1), 20);
}

const MapCanvasInner = forwardRef<MapCanvasHandle, MapCanvasProps>(
	function MapCanvasInner(
		{ coords, fullscreen = false, onRegionChange, children, centerPin = true },
		ref,
	) {
		const { colors } = useTheme();
		const map = useMap();
		// Camera target requested before the Google map instance is ready.
		const pending = useRef<{
			next: { latitude: number; longitude: number };
			delta?: number;
		} | null>(null);

		useImperativeHandle(
			ref,
			() => ({
				animateToRegion: (next, delta = 0.01) => {
					if (!map) {
						pending.current = { next, delta };
						return;
					}
					map.panTo({ lat: next.latitude, lng: next.longitude });
					map.setZoom(zoomForDelta(delta));
				},
			}),
			[map],
		);

		// Apply a target that arrived while the map was still initializing.
		useEffect(() => {
			if (map && pending.current) {
				map.panTo({
					lat: pending.current.next.latitude,
					lng: pending.current.next.longitude,
				});
				map.setZoom(zoomForDelta(pending.current.delta ?? 0.01));
				pending.current = null;
			}
		}, [map]);

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
				>
					{children}
				</Map>
				{centerPin ? (
					<View style={[styles.pinWrap, { pointerEvents: "none" }]}>
						<Ionicons
							name="location"
							size={40}
							color={colors.primary}
							style={styles.pin}
						/>
					</View>
				) : null}
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
		// @ts-ignore — RN types aún no exponen textShadow unificado
		textShadow: "0px 0px 3px rgba(0,0,0,0.2)",
	},
});