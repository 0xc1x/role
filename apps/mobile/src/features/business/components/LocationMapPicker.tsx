import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { env } from "@/core/config/env";
import { reverseGeocode } from "@/core/utils/geocode";
import type { MapCanvasHandle } from "./MapCanvas.types";

const RMap = lazy(() =>
	(Platform.OS === "web"
		? import("./MapCanvas.web")
		: import("./MapCanvas.native")
	).then((m) => ({ default: m.MapCanvas })),
);

export interface MapRegion {
	latitude: number;
	longitude: number;
	address: string;
	zone: string | null;
}

const DEFAULT_REGION = {
	latitude: -0.22985,
	longitude: -78.52495,
	latitudeDelta: 0.02,
	longitudeDelta: 0.02,
};

/**
 * Map picker for the location forms: draggable map with a centered pin,
 * "use my location" shortcut and a fullscreen expand. Reverse geocodes on
 * region changes (debounced) to prefill address/zone — same UX as v1.
 */
export function LocationMapPicker({
	latitude,
	longitude,
	onRegionChange,
}: {
	latitude: number;
	longitude: number;
	onRegionChange: (region: MapRegion) => void;
}) {
	const { colors } = useTheme();
	const hasInitial =
		latitude !== 0 || longitude !== 0;
	const [coords, setCoords] = useState(
		hasInitial
			? { latitude, longitude }
			: {
					latitude: DEFAULT_REGION.latitude,
					longitude: DEFAULT_REGION.longitude,
				},
	);
	const [fullscreen, setFullscreen] = useState(false);
	const [locating, setLocating] = useState(false);
	const mapRef = useRef<MapCanvasHandle>(null);
	const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (hasInitial) {
			setCoords({ latitude, longitude });
		}
	}, [latitude, longitude, hasInitial]);

	useEffect(() => {
		return () => {
			if (debounce.current) clearTimeout(debounce.current);
		};
	}, []);

	const emitRegion = (next: { latitude: number; longitude: number }) => {
		setCoords(next);
		if (debounce.current) clearTimeout(debounce.current);
		debounce.current = setTimeout(() => {
			void reverseGeocode(next).then((result) =>
				onRegionChange({
					...next,
					address: result.displayName,
					zone: result.zone,
				}),
			);
		}, 600);
	};

	const useMyLocation = async () => {
		setLocating(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") return;
			const position = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});
			const next = {
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
			};
			setCoords(next);
			mapRef.current?.animateToRegion(next, 0.01);
			void reverseGeocode(next).then((result) =>
				onRegionChange({
					...next,
					address: result.displayName,
					zone: result.zone,
				}),
			);
		} finally {
			setLocating(false);
		}
	};

	const confirmFullscreen = (region: { latitude: number; longitude: number }) => {
		emitRegion(region);
		setFullscreen(false);
	};

	if (!env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
		return (
			<View
				style={[
					styles.fallback,
					{
						backgroundColor: colors.surfaceMuted,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<Ionicons name="map-outline" size={28} color={colors.mutedForeground} />
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, textAlign: "center" }}
				>
					{strings.business.mapUnavailable}
				</AppText>
			</View>
		);
	}

	return (
		<View
			style={[
				styles.wrapper,
				{ borderColor: colors.borderSolid },
			]}
		>
			<Suspense
				fallback={
					<View
						style={[styles.map, { backgroundColor: colors.surfaceMuted }]}
					/>
				}
			>
				<RMap
					ref={mapRef}
					coords={coords}
					onRegionChange={(region) => emitRegion(region)}
				/>
			</Suspense>
			<View style={styles.actions}>
				<Pressable
					onPress={() => void useMyLocation()}
					style={({ pressed }) => [
						styles.actionButton,
						{ backgroundColor: colors.card },
						pressed && { opacity: 0.85 },
					]}
					accessibilityRole="button"
					accessibilityLabel={strings.business.useMyLocation}
				>
					{locating ? (
						<Ionicons name="locate" size={18} color={colors.primary} />
					) : (
						<Ionicons name="navigate" size={18} color={colors.primary} />
					)}
				</Pressable>
				<Pressable
					onPress={() => setFullscreen(true)}
					style={({ pressed }) => [
						styles.actionButton,
						{ backgroundColor: colors.card },
						pressed && { opacity: 0.85 },
					]}
					accessibilityRole="button"
					accessibilityLabel={strings.business.expandMap}
				>
					<Ionicons name="expand" size={18} color={colors.primary} />
				</Pressable>
			</View>

			<Modal
				visible={fullscreen}
				animationType="slide"
				onRequestClose={() => setFullscreen(false)}
			>
				<FullscreenMap
					latitude={coords.latitude}
					longitude={coords.longitude}
					onClose={() => setFullscreen(false)}
					onConfirm={confirmFullscreen}
				/>
			</Modal>
		</View>
	);
}

function FullscreenMap({
	latitude,
	longitude,
	onClose,
	onConfirm,
}: {
	latitude: number;
	longitude: number;
	onClose: () => void;
	onConfirm: (region: { latitude: number; longitude: number }) => void;
}) {
	const { colors } = useTheme();
	const [coords, setCoords] = useState({ latitude, longitude });

	return (
		<View style={[styles.fullscreen, { backgroundColor: colors.background }]}>
			<Suspense
				fallback={
					<View
						style={[styles.map, { backgroundColor: colors.surfaceMuted }]}
					/>
				}
			>
				<RMap
					coords={coords}
					fullscreen
					onRegionChange={(region) => setCoords(region)}
				/>
			</Suspense>
			<View style={[styles.fullscreenBar, { borderTopColor: colors.borderSolid }]}>
				<Button
					label={strings.business.cancel}
					variant="outline"
					onPress={onClose}
				/>
				<Button
					label={strings.business.confirmMapPin}
					onPress={() => onConfirm(coords)}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		height: 220,
		borderRadius: radii.md,
		borderWidth: 1,
		overflow: "hidden",
	},
	map: { flex: 1 },
	fallback: {
		height: 140,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		padding: spacing.md,
	},
	actions: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		gap: spacing.sm,
	},
	actionButton: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		elevation: 2,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.15,
		shadowRadius: 4,
	},
	fullscreen: { flex: 1 },
	fullscreenBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: spacing.md,
		padding: spacing.lg,
		borderTopWidth: 1,
	},
});