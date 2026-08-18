import { Pressable, StyleSheet, View } from "react-native";
import { createElement } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { OfferDetail } from "@/features/offers/domain/offer";
import {
	exploreFilterSummary,
	type ExploreFilterState,
} from "@/features/explore/exploreTypes";
import { useCategories } from "@/features/hooks";

const FALLBACK_COORD = { latitude: -1.8312, longitude: -78.1834 };

/**
 * Fallback web del mapa de Explorar: embebe Google Maps centrado en el usuario
 * o en la primera oferta. En nativo se usa react-native-maps (archivo .native.tsx).
 */
export function ExploreMapView({
	offers,
	filters,
	userLocation,
	onBack,
	onFilterTap,
}: {
	offers: OfferDetail[];
	filters: ExploreFilterState;
	userLocation: { latitude: number; longitude: number } | null;
	onBack: () => void;
	onFilterTap: () => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { data: categories } = useCategories();

	const firstLocated = offers.find((o) => o.location != null);
	const center =
		userLocation ??
		(firstLocated?.location
			? {
					latitude: firstLocated.location.latitude,
					longitude: firstLocated.location.longitude,
				}
			: FALLBACK_COORD);

	const hasOffers = offers.some((o) => o.location != null);
	const filterParts = exploreFilterSummary(
		filters,
		filters.category != null
			? categories?.find((c) => c.id === filters.category)?.name ??
				filters.category
			: undefined,
	);

	return (
		<View style={styles.flex}>
			{createElement("iframe", {
				title: strings.explore.mapOfOffers,
				src: `https://maps.google.com/maps?q=${center.latitude},${center.longitude}&z=13&output=embed`,
				style: styles.map,
				allowFullScreen: true,
			})}

			<View style={[styles.header, { top: insets.top + spacing.sm }]}>
				<View
					style={[styles.headerCard, { backgroundColor: colors.card, shadowColor: colors.shadow }]}
				>
					<Pressable
						onPress={onBack}
						accessibilityRole="button"
						accessibilityLabel={strings.common.back}
						style={[styles.headerButton, { backgroundColor: colors.surfaceMuted }]}
					>
						<Ionicons name="chevron-back" size={22} color={colors.foreground} />
					</Pressable>
					<View style={styles.headerTitle}>
						<AppText variant="labelSmall" weight="semiBold">
							{strings.explore.mapOfOffers}
						</AppText>
						{filterParts.length > 0 ? (
							<AppText variant="bodySmall" numberOfLines={1} style={{ color: colors.mutedForeground }}>
								{filterParts.join(" · ")}
							</AppText>
						) : null}
					</View>
					<Pressable
						onPress={onFilterTap}
						accessibilityRole="button"
						accessibilityLabel={strings.explore.filters}
						style={[styles.headerButton, { backgroundColor: colors.surfaceMuted }]}
					>
						<Ionicons name="options-outline" size={20} color={colors.mutedForeground} />
					</Pressable>
				</View>
			</View>

			{!hasOffers ? (
				<View style={[styles.noOffers, { top: 116 }]}>
					<View style={[styles.noOffersCard, { backgroundColor: colors.card }]}>
						<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
							{strings.explore.noOffersInZone}
						</AppText>
					</View>
				</View>
			) : null}

			<View style={[styles.legend, { bottom: 24, backgroundColor: colors.card }]}>
				<View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
				<AppText variant="bodySmall">{strings.explore.offersAvailable}</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
		backgroundColor: "#e5e5e5",
	},
	map: {
		width: "100%",
		height: "100%",
		borderWidth: 0,
	},
	header: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
	},
	headerCard: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.lg,
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 8,
		elevation: 3,
	},
	headerButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		flex: 1,
		paddingHorizontal: spacing.md,
	},
	noOffers: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		alignItems: "center",
	},
	noOffersCard: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
	},
	legend: {
		position: "absolute",
		left: spacing.lg,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.md,
		paddingVertical: 10,
		borderRadius: radii.lg,
	},
	legendDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
	},
});