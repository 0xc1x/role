import { MapPin } from "lucide-react-native";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { env } from "@/src/core/config/env";
import { useTheme } from "@/src/core/theme";
import type { MapCanvasHandle, MapCanvasProps } from "./MapCanvas.types";

// Single Google cloud-styled Map ID carrying BOTH designs: light style on
// Modo claro, dark style on Modo oscuro. Google Maps JS picks the design from
// the map's colorScheme. To change designs, edit them in the Cloud Console —
// no code change needed.
const ROLE_MAP_ID = "23f43f21c46dc36c9fe83380";
function zoomForDelta(delta: number): number {
	const zoom = Math.round(Math.log2(360 / Math.max(delta, 0.0001)));
	return Math.min(Math.max(zoom, 1), 20);
}

const MapCanvasInner = forwardRef<MapCanvasHandle, MapCanvasProps>(
	function MapCanvasInner(
		{
			coords,
			fullscreen = false,
			onRegionChange,
			children,
			centerPin = true,
			fitCoords,
		},
		ref,
	) {
		const { colors, scheme } = useTheme();
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

		// Encuadra los puntos (p. ej. pines filtrados de Explorar): una vez
		// por cada conjunto distinto de coords.
		const fitKey = (fitCoords ?? [])
			.map((c) => `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`)
			.join("|");
		const fittedRef = useRef<string | null>(null);
		useEffect(() => {
			if (!map || !fitCoords || fitCoords.length === 0) return;
			if (fittedRef.current === fitKey) return;
			fittedRef.current = fitKey;
			const lats = fitCoords.map((c) => c.latitude);
			const lngs = fitCoords.map((c) => c.longitude);
			const pad = 0.01;
			map.fitBounds({
				south: Math.min(...lats) - pad,
				west: Math.min(...lngs) - pad,
				north: Math.max(...lats) + pad,
				east: Math.max(...lngs) + pad,
			});
		}, [map, fitCoords, fitKey]);

		return (
			<View style={fullscreen ? styles.fullscreenMap : styles.map}>
				<Map
					mapId={ROLE_MAP_ID}
					colorScheme={scheme === "dark" ? "DARK" : "LIGHT"}
					defaultCenter={{ lat: coords.latitude, lng: coords.longitude }}
					defaultZoom={15}
					gestureHandling="greedy"
					disableDefaultUI
					// POIs stay non-interactive so taps never open Google's
					// place cards over our markers. Full POI hiding is not
					// possible client-side here: the `styles` option is
					// ignored on maps with a `mapId`, and `AdvancedMarker`
					// requires one — hide POIs via a cloud map style for
					// this map ID in the Google Cloud Console instead.
					clickableIcons={false}
					onCameraChanged={(ev) => {
						const { center } = ev.detail;
						onRegionChange({ latitude: center.lat, longitude: center.lng });
					}}
				>
					{children}
				</Map>
				{centerPin ? (
					<View style={[styles.pinWrap, { pointerEvents: "none" }]}>
						<MapPin
							size={40}
							color={colors.primary}
							fill="none"
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
	pin: { marginTop: -30 },
});
