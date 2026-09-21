import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ChevronLeft, LocateFixed } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { env } from "@/src/core/config/env";
import { reverseGeocode } from "@/src/core/utils/geocode";
// Static import: this file is web-only, so the Google Maps canvas loads with it.
import { MapCanvas } from "@/src/core/ui/MapCanvas.web";
import type { MapCanvasHandle } from "@/src/core/ui/MapCanvas.types";
import type { MapPickerResult } from "./MapPickerView";
import { Button } from "@/components/ui/button";

export function MapPickerView({
	initialLocation,
	onCancel,
	onConfirm,
}: {
	initialLocation: { latitude: number; longitude: number } | null;
	onCancel: () => void;
	onConfirm: (result: MapPickerResult) => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const [coords, setCoords] = useState({
		latitude: initialLocation?.latitude ?? -0.22985,
		longitude: initialLocation?.longitude ?? -78.52495,
	});
	const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
	const [resolving, setResolving] = useState(false);
	const [locating, setLocating] = useState(false);
	const mapRef = useRef<MapCanvasHandle>(null);
	const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestKey = useRef<string>("");

	useEffect(() => {
		return () => {
			if (debounce.current) clearTimeout(debounce.current);
		};
	}, []);

	useEffect(() => {
		if (initialLocation) resolve(initialLocation);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (!initialLocation) void useMyLocation();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const resolve = (next: { latitude: number; longitude: number }) => {
		const key = `${next.latitude.toFixed(4)},${next.longitude.toFixed(4)}`;
		latestKey.current = key;
		setResolving(true);
		void reverseGeocode(next).then((result) => {
			if (latestKey.current !== key) return;
			setResolvedAddress(result.displayName || null);
			setResolving(false);
		});
	};

	const handleRegionChange = (next: { latitude: number; longitude: number }) => {
		setCoords(next);
		if (debounce.current) clearTimeout(debounce.current);
		debounce.current = setTimeout(() => resolve(next), 800);
	};

	const useMyLocation = () => {
		if (typeof navigator === "undefined" || !navigator.geolocation) return;
		setLocating(true);
		// Direct Geolocation API: expo-location on web serves a cached fix;
		// maximumAge 0 forces a fresh one.
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const next = {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				};
				setCoords(next);
				mapRef.current?.animateToRegion(next, 0.01);
				resolve(next);
				setLocating(false);
			},
			() => setLocating(false),
			{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
		);
	};

	if (!env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
		return (
			<View style={[styles.full, { backgroundColor: colors.background }]}>
				<View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
					<Button
						variant="outline"
						size="icon"
						onPress={onCancel}
						hitSlop={8}
						accessibilityRole="button"
						aria-label={strings.common.back}
						icon={<ChevronLeft size={22} color={colors.foreground} />}
					/>
					<AppText variant="h4" weight="bold" numberOfLines={1} style={styles.headerTitle}>
						{strings.addresses.pickLocationTitle}
					</AppText>
					<View style={styles.headerSpacer} />
				</View>
				<View style={styles.body}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, textAlign: "center" }}
					>
						{strings.business.mapUnavailable}
					</AppText>
				</View>
			</View>
		);
	}

	return (
		<View style={styles.full}>
			<MapCanvas ref={mapRef} coords={coords} fullscreen onRegionChange={handleRegionChange} />

			<View style={styles.header}>
				<Button
					variant="outline"
					size="icon"
					onPress={onCancel}
					hitSlop={8}
					accessibilityRole="button"
					aria-label={strings.common.back}
					style={{ marginTop: insets.top }}
					icon={<ChevronLeft size={22} color={colors.foreground} />}
				/>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={1}
					style={[styles.headerTitle, { marginTop: insets.top }]}
				>
					{strings.addresses.pickLocationTitle}
				</AppText>
				<View style={[styles.headerSpacer, { marginTop: insets.top }]} />
			</View>

			<Button
				variant="ghost"
				size="icon"
				onPress={() => void useMyLocation()}
				loading={locating}
				accessibilityRole="button"
				aria-label={strings.addresses.useMyLocation}
				style={[styles.fab, { backgroundColor: colors.card, top: spacing.md + insets.top }]}
				icon={<LocateFixed size={22} color={colors.primary} />}
			/>

			<View
				style={[
					styles.panel,
					{ backgroundColor: colors.card, paddingBottom: spacing.lg + insets.bottom },
				]}
			>
				{resolving ? (
					<ActivityIndicator color={colors.primary} />
				) : resolvedAddress ? (
					<AppText variant="bodyMedium" numberOfLines={2} style={styles.panelText}>
						{resolvedAddress}
					</AppText>
				) : (
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, textAlign: "center" }}
					>
						{strings.addresses.moveMapToSelect}
					</AppText>
				)}
				<Button
					onPress={() =>
						onConfirm({
							latitude: coords.latitude,
							longitude: coords.longitude,
							address: resolvedAddress,
						})
					}
					fullWidth
					size="lg"
				>
					{strings.addresses.confirmLocation}
				</Button>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	full: { flex: 1 },
	center: { alignItems: "center", justifyContent: "center" },
	header: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
	},
	headerTitle: {
		flex: 1,
		textAlign: "center",
		paddingHorizontal: spacing.xs,
		paddingTop: spacing.sm,
	},
	headerSpacer: { width: 36 },
	roundButton: {
		width: 36,
		height: 36,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	fab: {
		position: "absolute",
		right: spacing.md,
		width: 44,
		height: 44,
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	panel: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		padding: spacing.lg,
		borderTopLeftRadius: radii.xl,
		borderTopRightRadius: radii.xl,
		gap: spacing.md,
	},
	panelText: { textAlign: "center" },
	body: {
		flex: 1,
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
	},
});
