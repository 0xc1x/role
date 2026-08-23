import { Ionicons } from "@expo/vector-icons";
import { lazy, Suspense } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatShortDate } from "@/core/utils/formatters";
import { env } from "@/core/config/env";
import { useBusinessLocation } from "@/features/business/hooks";

const RMap = lazy(() =>
	(Platform.OS === "web"
		? import("@/features/business/components/MapCanvas.web")
		: import("@/features/business/components/MapCanvas.native")
	).then((m) => ({ default: m.MapCanvas })),
);

export default function BusinessLocationDetailScreen() {
	const { colors } = useTheme();
	const { id, locationId } = useLocalSearchParams<{
		id: string;
		locationId: string;
	}>();
	const { data: location, isLoading, isError, error, refetch } =
		useBusinessLocation(locationId ?? "");

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!location) return null;

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader title={strings.business.locationDetail} />

			{/* ── Hero ─────────────────────────────────────────────────── */}
			<Card style={styles.hero}>
				<View style={[styles.icon, { backgroundColor: colors.primary + "1A" }]}>
					<Ionicons name="storefront" size={26} color={colors.primary} />
				</View>
				<View style={styles.heroText}>
					<AppText variant="h3" weight="bold">
						{location.name}
					</AppText>
					<View style={styles.badgeRow}>
						<StatusBadge
							label={
								location.is_active
									? strings.business.locationActive
									: strings.business.locationInactive
							}
							tone={location.is_active ? "success" : "neutral"}
						/>
						{location.is_headquarter ? (
							<View
								style={[
									styles.hqChip,
									{ backgroundColor: colors.warning + "26" },
								]}
							>
								<Ionicons name="star" size={11} color={colors.warning} />
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{ color: colors.warning }}
								>
									{strings.business.headquarter}
								</AppText>
							</View>
						) : null}
					</View>
				</View>
			</Card>

			{/* ── Mapa ─────────────────────────────────────────────────── */}
			{env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? (
				<Pressable
					onPress={() =>
						router.push(`/business/${id}/locations/${location.id}/edit`)
					}
					style={({ pressed }) => [
						styles.mapWrap,
						{
							borderColor: colors.borderSolid,
							opacity: pressed ? 0.92 : 1,
						},
					]}
					accessibilityRole="button"
					accessibilityLabel={strings.business.editInformation}
				>
					<Suspense fallback={<View style={styles.mapFallback} />}>
						<RMap
							coords={{
								latitude: location.latitude,
								longitude: location.longitude,
							}}
							onRegionChange={() => {}}
						/>
					</Suspense>
					<View pointerEvents="none" style={[styles.mapHint, { backgroundColor: colors.card + "E6" }]}>
						<Ionicons
							name="create-outline"
							size={13}
							color={colors.mutedForeground}
						/>
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
							{strings.business.editInformation}
						</AppText>
					</View>
				</Pressable>
			) : null}

			{/* ── Información ──────────────────────────────────────────── */}
			<Card style={styles.card}>
				<InfoRow
					icon="location-outline"
					label={strings.business.address}
					value={location.address}
				/>
				{location.phone ? (
					<InfoRow
						icon="call-outline"
						label={strings.business.phone}
						value={location.phone}
					/>
				) : null}
				{location.zone ? (
					<InfoRow
						icon="map-outline"
						label={strings.business.zone}
						value={location.zone}
					/>
				) : null}
				<InfoRow
					icon="pin-outline"
					label={strings.business.coordinates}
					value={`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
				/>
				{location.created_at ? (
					<InfoRow
						icon="calendar-outline"
						label={strings.business.locationCreated}
						value={formatShortDate(location.created_at)}
						last
					/>
				) : null}
			</Card>

			{/* ── Acciones ─────────────────────────────────────────────── */}
			<Card
				style={styles.card}
				onPress={() => router.push(`/business/${id}/locations/${location.id}/edit`)}
			>
				<View style={styles.actionRow}>
					<View
						style={[styles.actionIcon, { backgroundColor: colors.primary + "1A" }]}
					>
						<Ionicons
							name="create-outline"
							size={18}
							color={colors.primary}
						/>
					</View>
					<AppText variant="bodyMedium" weight="medium" style={styles.flex1}>
						{strings.business.editInformation}
					</AppText>
					<Ionicons
						name="chevron-forward"
						size={18}
						color={colors.mutedForeground}
					/>
				</View>
			</Card>
		</Screen>
	);
}

function InfoRow({
	icon,
	label,
	value,
	last = false,
}: {
	icon:
		| "location-outline"
		| "call-outline"
		| "map-outline"
		| "pin-outline"
		| "calendar-outline";
	label: string;
	value: string;
	last?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.infoRow, last && { marginBottom: 0 }]}>
			<View style={[styles.infoIcon, { backgroundColor: colors.primary + "0D" }]}>
				<Ionicons name={icon} size={14} color={colors.mutedForeground} />
			</View>
			<View style={styles.infoRowText}>
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground }}
				>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					{value}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	hero: {
		marginTop: spacing.lg,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	icon: {
		width: 52,
		height: 52,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	heroText: { flex: 1, gap: spacing.xs },
	badgeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	hqChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: radii.pill,
	},
	mapWrap: {
		height: 160,
		borderRadius: radii.lg,
		borderWidth: 1,
		overflow: "hidden",
		marginTop: spacing.lg,
	},
	mapFallback: { flex: 1 },
	mapHint: {
		position: "absolute",
		right: spacing.sm,
		bottom: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: spacing.sm,
		paddingVertical: 5,
		borderRadius: radii.pill,
	},
	card: { marginTop: spacing.lg },
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		marginBottom: spacing.md,
	},
	infoIcon: {
		width: 30,
		height: 30,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	infoRowText: { flex: 1, gap: 2 },
	actionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	actionIcon: {
		width: 38,
		height: 38,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	flex1: { flex: 1 },
});
