import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ChevronLeft, LocateFixed, MapPin } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import MapView, { type Region } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/src/core/i18n/strings";
import { composeShortAddress } from "@/src/core/utils/geocode";
import { getMapStyle } from "@/src/core/theme/map-style";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";

export interface MapPickerResult {
	latitude: number;
	longitude: number;
	address: string | null;
}

const DEFAULT_REGION: Region = {
	latitude: -0.22985,
	longitude: -78.52495,
	latitudeDelta: 0.02,
	longitudeDelta: 0.02,
};

export function MapPickerView({
	initialLocation,
	onCancel,
	onConfirm,
}: {
	initialLocation: { latitude: number; longitude: number } | null;
	onCancel: () => void;
	onConfirm: (result: MapPickerResult) => void;
}) {
	const { colors, scheme } = useTheme();
	const insets = useSafeAreaInsets();
	// Uncontrolled map (initialRegion only): a controlled `region` prop fights
	// the user's pan gestures and snaps the camera back mid-drag.
	const mapRef = useRef<MapView>(null);
	const [coords, setCoords] = useState({
		latitude: initialLocation?.latitude ?? DEFAULT_REGION.latitude,
		longitude: initialLocation?.longitude ?? DEFAULT_REGION.longitude,
	});
	const [loading, setLoading] = useState(!initialLocation);
	const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
	const [resolving, setResolving] = useState(false);
	const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// `initialLocation` is a prop object that parents commonly rebuild on every
	// render. The bootstrap effect below must fire exactly once, so it reads the
	// mount-time value from a ref instead of depending on the prop identity.
	const initialLocationRef = useRef(initialLocation);

	// Stable ([]): reads only setters and the module-level address composer.
	const resolveAddress = useCallback(
		async (latitude: number, longitude: number) => {
			setResolving(true);
			try {
				const results = await Location.reverseGeocodeAsync({
					latitude,
					longitude,
				});
				const place = results[0];
				setResolvedAddress(
					composeShortAddress({
						street: place?.street,
						streetNumber: place?.streetNumber,
						city: place?.city,
						postcode: place?.postalCode,
					}) || null,
				);
			} catch {
				setResolvedAddress(null);
			} finally {
				setResolving(false);
			}
		},
		[],
	);

	// Stable ([resolveAddress]): reads only setters, mapRef and the module-level
	// DEFAULT_REGION.
	const determinePosition = useCallback(async () => {
		setLoading(true);
		try {
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				setLoading(false);
				return;
			}
			const position = await Location.getCurrentPositionAsync({
				accuracy: Location.Accuracy.High,
			});
			const next = {
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
			};
			setCoords(next);
			mapRef.current?.animateToRegion({ ...DEFAULT_REGION, ...next }, 400);
			setLoading(false);
			await resolveAddress(next.latitude, next.longitude);
		} catch {
			setLoading(false);
		}
	}, [resolveAddress]);

	// Mount-once bootstrap. Both callbacks are `useCallback`-stable and the
	// initial location comes from a ref, so listing them as dependencies cannot
	// re-trigger the effect on a re-render.
	useEffect(() => {
		const initial = initialLocationRef.current;
		if (initial) {
			void resolveAddress(initial.latitude, initial.longitude);
		} else {
			void determinePosition();
		}
		// El cleanup va FUERA de la rama. Con un `return` temprano en el caso de
		// `initialLocation` guardada, el debounce que dispara
		// `handleRegionChangeComplete` nunca se limpiaba al desmontar: hacer pan
		// con el picker abierto sobre una ubicación guardada dejaba vivo un
		// `setTimeout` que resolvía la dirección contra un componente ya
		// desmontado.
		return () => {
			if (resolveTimer.current) clearTimeout(resolveTimer.current);
		};
	}, [determinePosition, resolveAddress]);

	const handleRegionChangeComplete = (next: Region) => {
		setCoords({ latitude: next.latitude, longitude: next.longitude });
		if (resolveTimer.current) clearTimeout(resolveTimer.current);
		resolveTimer.current = setTimeout(() => {
			void resolveAddress(next.latitude, next.longitude);
		}, 350);
	};

	return (
		<View style={styles.full}>
			<MapView
				ref={mapRef}
				style={StyleSheet.absoluteFill}
				initialRegion={{ ...DEFAULT_REGION, ...coords }}
				onRegionChangeComplete={handleRegionChangeComplete}
				showsUserLocation
				showsMyLocationButton={false}
				loadingEnabled
				customMapStyle={getMapStyle(scheme)}
			/>

			<View style={[styles.centerMarker, { pointerEvents: "none" }]}>
				<MapPin size={48} color={colors.primary} />
			</View>

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

			<View
				style={[
					styles.panel,
					{
						backgroundColor: colors.card,
						paddingBottom: spacing.lg + insets.bottom,
					},
				]}
			>
				{resolving ? (
					<ActivityIndicator color={colors.primary} />
				) : resolvedAddress ? (
					<AppText
						variant="bodyMedium"
						numberOfLines={2}
						style={styles.panelText}
					>
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

			<Button
				variant="ghost"
				size="icon"
				onPress={() => void determinePosition()}
				accessibilityRole="button"
				aria-label={strings.addresses.useMyLocation}
				style={[
					styles.fab,
					{ backgroundColor: colors.card, top: spacing.md + insets.top },
				]}
				icon={<LocateFixed size={22} color={colors.primary} />}
			/>

			{loading ? (
				<View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
					<ActivityIndicator size="large" color={colors.primary} />
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	full: { flex: 1 },
	centerMarker: {
		position: "absolute",
		top: "50%",
		left: "50%",
		marginLeft: -24,
		marginTop: -32,
	},
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
		borderWidth: 1,
		borderColor: "transparent",
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
	panelText: { textAlign: "center", maxWidth: "100%" },
	confirmButton: {
		height: 52,
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	fab: {
		position: "absolute",
		top: spacing.xl,
		right: spacing.md,
		width: 44,
		height: 44,
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: "transparent",
	},
	loadingOverlay: {
		alignItems: "center",
		justifyContent: "center",
	},
});
