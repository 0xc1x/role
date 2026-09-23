import { Pressable, StyleSheet, View } from "react-native";

import { env } from "@/src/core/config/env";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
// Static import: this file is web-only (Metro resolves
// BusinessLocationMap.native.tsx on iOS/Android).
import { MapCanvas } from "@/src/core/ui/MapCanvas.web";

/**
 * Business location preview (web): same interactive Google map as the
 * native version, with our center pin. Replaces the old unstyled embed
 * iframe, which accepted no style options. Inherits the shared POI
 * treatment from MapCanvas (non-interactive POIs; full hiding via the
 * cloud map style for this map ID).
 */
export function BusinessLocationMap({
	latitude,
	longitude,
	onPress,
}: {
	latitude: number;
	longitude: number;
	onPress?: () => void;
}) {
	const { colors } = useTheme();

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
				styles.mapWrap,
				{ borderColor: colors.borderSolid },
			]}
		>
			<MapCanvas
				coords={{ latitude, longitude }}
				onRegionChange={() => {}}
			/>
			{onPress ? (
				<Pressable style={StyleSheet.absoluteFill} onPress={onPress} />
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	mapWrap: {
		height: 180,
		borderRadius: radii.lg,
		borderWidth: 1,
		overflow: "hidden",
	},
	fallback: {
		height: 180,
		borderRadius: radii.lg,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: spacing.md,
	},
});
