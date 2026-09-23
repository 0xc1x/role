import { Calendar, ChevronRight, Map, MapPin, Pencil, Phone, Pin, Star, Store, type LucideIcon } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	ErrorState,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatShortDate } from "@/src/core/utils/formatters";
import { useBusinessLocation } from "@/src/features/business/hooks";
import { BusinessLocationMap } from "@/src/features/business/components/BusinessLocationMap";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CardPressable } from "@/components/ui/card-presable";

export default function BusinessLocationDetailScreen() {
	const { colors } = useTheme();
	const { id, locationId } = useLocalSearchParams<{
		id: string;
		locationId: string;
	}>();
	const { data: location, isLoading, isError, error, refetch } =
		useBusinessLocation(locationId ?? "");

	if (isLoading) {
		return (
			<Screen scroll>
				<View style={styles.container}>
					<ScreenHeader title={strings.business.locationDetail} />
					<Skeleton style={styles.skeletonHero} />
					<Skeleton style={styles.skeletonMap} />
					<Skeleton style={styles.skeletonCard} />
					<Skeleton style={styles.skeletonCard} />
				</View>
			</Screen>
		);
	}
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!location) return null;

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader title={strings.business.locationDetail} />

			{/* ── Hero ─────────────────────────────────────────────────── */}
			<Card style={styles.hero}>
				<CardHeader>
					<View style={[styles.icon, { backgroundColor: withAlpha(colors.primary, 0.102) }]}>
						<Store size={26} color={colors.primary} />
					</View>
				</CardHeader>
				
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
									{ backgroundColor: withAlpha(colors.warning, 0.149) },
								]}
							>
								<Star size={11} color={colors.warning} />
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
			{/* Fijo (sin pan/zoom), igual que la geolocalización del perfil
			    público; el toque lleva a editar la sucursal. */}
			<View style={styles.mapSection}>
				<BusinessLocationMap
					latitude={location.latitude}
					longitude={location.longitude}
					onPress={() =>
						router.push(`/business/${id}/locations/${location.id}/edit`)
					}
				/>
			</View>

			{/* ── Información ──────────────────────────────────────────── */}
			<Card style={styles.card}>
				<CardContent>
					<InfoRow
						icon={MapPin}
						label={strings.business.address}
						value={location.address}
					/>
					{location.phone ? (
						<InfoRow
							icon={Phone}
							label={strings.business.phone}
							value={location.phone}
						/>
					) : null}
					{location.zone ? (
						<InfoRow
							icon={Map}
							label={strings.business.zone}
							value={location.zone}
						/>
					) : null}
					<InfoRow
						icon={Pin}
						label={strings.business.coordinates}
						value={`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`}
					/>
					{location.created_at ? (
						<InfoRow
							icon={Calendar}
							label={strings.business.locationCreated}
							value={formatShortDate(location.created_at)}
							last
						/>
					) : null}
				</CardContent>
			</Card>

			{/* ── Acciones ─────────────────────────────────────────────── */}
			<CardPressable
				style={styles.card}
				onPress={() => router.push(`/business/${id}/locations/${location.id}/edit`)}
			>
				<CardContent style={styles.actionRow}>
					<View
						style={[styles.actionIcon, { backgroundColor: withAlpha(colors.primary, 0.102) }]}
					>
						<Pencil
							size={18}
							color={colors.primary}
						/>
					</View>
					<AppText variant="bodyMedium" weight="medium" style={styles.flex1}>
						{strings.business.editInformation}
					</AppText>
					<ChevronRight
						size={18}
						color={colors.mutedForeground}
					/>
				</CardContent>
			</CardPressable>
		</Screen>
	);
}

function InfoRow({
	icon: Icon,
	label,
	value,
	last = false,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	last?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.infoRow, last && { marginBottom: 0 }]}>
			<View style={[styles.infoIcon, { backgroundColor: withAlpha(colors.primary, 0.051) }]}>
				<Icon size={14} color={colors.mutedForeground} />
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
		borderRadius: radii.md,
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
	mapSection: { marginTop: spacing.lg },
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
		borderRadius: radii.sm,
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
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},
	flex1: { flex: 1 },
	skeletonHero: {
		height: 110,
		borderRadius: radii.lg,
		marginTop: spacing.lg,
	},
	skeletonMap: {
		height: 180,
		borderRadius: radii.lg,
		marginTop: spacing.lg,
	},
	skeletonCard: {
		height: 90,
		borderRadius: radii.lg,
		marginTop: spacing.lg,
	},
});
