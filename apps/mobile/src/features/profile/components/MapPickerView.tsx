import { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { type Region } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";

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
	const { colors } = useTheme();
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

	useEffect(() => {
		if (initialLocation) {
			void resolveAddress(initialLocation.latitude, initialLocation.longitude);
			return;
		}
		void determinePosition();
		return () => {
			if (resolveTimer.current) clearTimeout(resolveTimer.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function determinePosition() {
		setLoading(true);
		try {
			const { status } =
				await Location.requestForegroundPermissionsAsync();
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
	}

	async function resolveAddress(latitude: number, longitude: number) {
		setResolving(true);
		try {
			const results = await Location.reverseGeocodeAsync({
				latitude,
				longitude,
			});
			const place = results[0];
			const parts = [
				place?.street,
				place?.streetNumber,
				place?.district,
				place?.city,
				place?.region,
			]
				.map((part) => part?.trim())
				.filter((part): part is string => typeof part === "string" && part.length > 0);
			setResolvedAddress(parts.join(", ") || null);
		} catch {
			setResolvedAddress(null);
		} finally {
			setResolving(false);
		}
	}

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
			/>

			<View style={[styles.centerMarker, { pointerEvents: "none" }]}>
				<Ionicons name="location" size={48} color={colors.primary} />
			</View>

			<View style={styles.header}>
				<Pressable
					onPress={onCancel}
					hitSlop={8}
					style={[
						styles.roundButton,
						{ backgroundColor: colors.card, marginTop: insets.top },
					]}
				>
					<Ionicons name="chevron-back" size={20} color={colors.foreground} />
				</Pressable>
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
					{ backgroundColor: colors.card, paddingBottom: spacing.lg + insets.bottom },
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
			<Pressable
				onPress={() =>
					onConfirm({
						latitude: coords.latitude,
						longitude: coords.longitude,
						address: resolvedAddress,
					})
				}
					style={[styles.confirmButton, { backgroundColor: colors.primary }]}
				>
					<AppText
						weight="bold"
						style={{ color: colors.primaryForeground }}
					>
						{strings.addresses.confirmLocation}
					</AppText>
				</Pressable>
			</View>

			<Pressable
				onPress={() => void determinePosition()}
				style={[styles.fab, { backgroundColor: colors.card, top: spacing.md + insets.top }]}
			>
				<Ionicons name="locate" size={22} color={colors.primary} />
			</Pressable>

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
		borderRadius: 18,
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
		borderRadius: 22,
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
