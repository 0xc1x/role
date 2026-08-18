import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

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
import { spacing } from "@/core/theme/spacing";
import { useBusinessLocation } from "@/features/business/hooks";

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
			<Card style={styles.card}>
				<View style={styles.infoHeader}>
					<View style={styles.icon}>
						<Ionicons name="storefront" size={26} color={colors.primary} />
					</View>
					<View style={styles.infoHeaderText}>
						<AppText variant="h3" weight="bold">
							{location.name}
						</AppText>
						<StatusBadge
							label={
								location.is_active
									? strings.business.locationActive
									: strings.business.locationInactive
							}
							tone={location.is_active ? "success" : "neutral"}
						/>
					</View>
				</View>

				<View style={[styles.divider, { borderTopColor: colors.borderSolid }]} />
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
				{location.is_headquarter ? (
					<View style={styles.headquarter}>
						<Ionicons name="star" size={16} color={colors.warning} />
						<AppText
							variant="bodySmall"
							weight="semiBold"
							style={{ color: colors.warning }}
						>
							{strings.business.headquarter}
						</AppText>
					</View>
				) : null}
			</Card>

			<Card
				style={styles.card}
				onPress={() =>
					router.push(
						`/business/${id}/locations/${location.id}/edit`,
					)
				}
			>
				<AppText
					variant="labelSmall"
					weight="bold"
					style={{ color: colors.mutedForeground }}
				>
					{strings.business.actions}
				</AppText>
				<View style={styles.actionRow}>
					<View style={[styles.actionIcon, { backgroundColor: colors.secondary }]}>
						<Ionicons
							name="create-outline"
							size={20}
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
}: {
	icon: "location-outline" | "call-outline" | "map-outline" | "pin-outline";
	label: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={16} color={colors.mutedForeground} />
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
	card: { marginTop: spacing.lg },
	infoHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	icon: {
		width: 52,
		height: 52,
		borderRadius: 16,
		backgroundColor: "rgba(191,28,25,0.1)",
		alignItems: "center",
		justifyContent: "center",
	},
	infoHeaderText: {
		flex: 1,
		gap: 6,
		alignItems: "flex-start",
	},
	divider: { borderTopWidth: 1, marginVertical: spacing.lg },
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		marginBottom: spacing.md,
	},
	infoRowText: { flex: 1, gap: 2 },
	headquarter: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: spacing.sm,
	},
	actionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginTop: spacing.md,
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