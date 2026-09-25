import { type Href, router } from "expo-router";
import { Pencil, Pin, Plus, Store } from "lucide-react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { Skeleton } from "@/components/ui/skeleton";
import { AppText, EmptyState, ErrorState, Screen } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { BUSINESS_TYPE_LABELS } from "@/src/features/business/domain/business";
import {
	LocationCard,
	LocationCardSkeleton,
} from "@/src/features/business/components/LocationCard";
import {
	useBusinessLocations,
	useBusinessProfile,
} from "@/src/features/business/hooks";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { SettingsSection } from "./SettingsSection";
import { SignOutSection } from "@/src/features/auth/presentation/SignOutSection";
import { Button } from "@/components/ui/button";

export function GestionContent({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const {
		data: profile,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessProfile(businessId);
	const { data: locations, isLoading: locationsLoading } =
		useBusinessLocations(businessId);

	if (isLoading) return <GestionContentSkeleton />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!profile) return null;

	const { business } = profile;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.business.gestionTitle}
				</AppText>

				{/* ── Info del negocio ─────────────────────────────── */}
				<View
					style={[
						styles.heroCard,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							borderWidth: 1,
							borderRadius: radii.lg,
						},
					]}
				>
					<View style={styles.coverWrap}>
						{(business.cover_image ?? business.image) ? (
							<Image
								source={{
									uri: (business.cover_image ?? business.image) as string,
								}}
								style={StyleSheet.absoluteFill}
								contentFit="cover"
							/>
						) : (
							<View
								style={[
									StyleSheet.absoluteFill,
									{ backgroundColor: colors.primary },
								]}
							/>
						)}
						<LinearGradient
							colors={[
								"transparent",
								withAlpha(colors.scrim, 0.55),
								colors.card,
							]}
							locations={[0.35, 0.75, 1]}
							style={StyleSheet.absoluteFill}
						/>
					</View>
					<View style={styles.heroBody}>
						<View style={styles.heroIdentity}>
							{business.image ? (
								<Image
									source={{ uri: business.image }}
									style={styles.logo}
									contentFit="cover"
								/>
							) : (
								<View
									style={[
										styles.logo,
										styles.logoPlaceholder,
										{ backgroundColor: colors.primary },
									]}
								>
									<Store size={28} color={colors.primaryForeground} />
								</View>
							)}
							<View style={{ flex: 1, gap: 4 }}>
								<View
									style={[
										styles.typeBadge,
										{ backgroundColor: withAlpha(colors.destructive, 0.16) },
									]}
								>
									<AppText
										variant="labelSmall"
										weight="bold"
										style={{ color: colors.destructive }}
									>
										{(
											BUSINESS_TYPE_LABELS[business.type] ?? business.type
										).toUpperCase()}
									</AppText>
								</View>
								<AppText variant="h2" weight="bold">
									{business.name}
								</AppText>
							</View>
						</View>
						<AppText variant="bodyMedium" style={{ marginTop: spacing.md }}>
							{business.description ?? strings.business.noDescription}
						</AppText>
						{profile.hours.length > 0 ? (
							<View style={{ marginTop: spacing.md, gap: spacing.xs }}>
								{profile.hours.map((h) => (
									<View key={h.dayRange} style={styles.hoursRow}>
										<AppText variant="bodySmall">{h.dayRange}</AppText>
										<AppText
											variant="bodySmall"
											style={{ color: colors.mutedForeground }}
										>
											{h.hoursDisplay}
										</AppText>
									</View>
								))}
							</View>
						) : null}
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
						>
							{profile.address ?? strings.business.ordersNoAddress}
						</AppText>
						<Button
							icon={<Pencil size={20} color={colors.primaryForeground} />}
							style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
							onPress={() => router.push("/business/profile/edit" as Href)}
						>
							{strings.business.editProfile}
						</Button>
					</View>
				</View>

				{/* ── Mis Locales ─────────────────────────────────── */}
				<View style={styles.sectionHeader}>
					<AppText variant="h4" weight="bold">
						{strings.business.myLocations}
					</AppText>
					<Button
						size="sm"
						icon={<Plus size={16} color={colors.primaryForeground} />}
						onPress={() =>
							router.push(`/business/${businessId}/locations/create` as Href)
						}
						style={{ borderRadius: radii.pill }}
					>
						{strings.business.addLocation}
					</Button>
				</View>

				{locationsLoading ? (
					<View style={styles.locations}>
						{[0, 1].map((i) => (
							<LocationCardSkeleton key={`location-skeleton-${i}`} />
						))}
					</View>
				) : !locations || locations.length === 0 ? (
					<View
						style={[
							styles.emptyLocations,
							{
								backgroundColor: colors.card,
								borderColor: colors.borderSolid,
								borderWidth: 1,
								borderRadius: radii.lg,
							},
						]}
					>
						<EmptyState
							icon={<Pin size={28} />}
							title={strings.business.noLocationsTitle}
							message={strings.business.noLocationsBody}
							action={
								<Button
									onPress={() =>
										router.push(
											`/business/${businessId}/locations/create` as Href,
										)
									}
								>
									{strings.business.createLocation}
								</Button>
							}
						/>
					</View>
				) : (
					<View style={styles.locations}>
						{(locations ?? []).map((location) => (
							<LocationCard
								key={location.id}
								name={location.name}
								address={location.address}
								phone={location.phone}
								isActive={location.is_active}
								imageUrl={business?.image ?? null}
								onPress={() =>
									router.push(
										`/business/${businessId}/locations/${location.id}` as Href,
									)
								}
							/>
						))}
					</View>
				)}

				{/* ── Accesos rápidos ─────────────────────────────── */}
				<View style={styles.sectionTitle}>
					<AppText variant="h4" weight="bold">
						{strings.business.quickActions}
					</AppText>
				</View>
				<QuickActionsGrid businessId={businessId} />

				{/* ── Configuración ────────────────────────────────── */}
				<View style={styles.sectionTitle}>
					<AppText variant="h4" weight="bold">
						{strings.business.settingsSection}
					</AppText>
				</View>
				<SettingsSection businessId={businessId} />

				<SignOutSection style={{ marginTop: spacing.xl }} />
				<View style={{ height: 40 }} />
			</View>
		</Screen>
	);
}

/**
 * Skeleton con las dimensiones aproximadas de la pantalla de gestión
 * (hero con cover 170 + logo 64, locales, accesos rápidos).
 * Mismo patrón que ExploreCategoryGrid / ProductCardSkeleton.
 */
export function GestionContentSkeleton() {
	const { colors } = useTheme();
	return (
		<Screen scroll>
			<View style={styles.container}>
				<Skeleton style={styles.skeletonTitle} />
				<View
					style={[
						styles.heroCard,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							borderWidth: 1,
							borderRadius: radii.lg,
						},
					]}
				>
					<Skeleton style={styles.skeletonCover} />
					<View style={styles.heroBody}>
						<View style={styles.heroIdentity}>
							<Skeleton style={styles.skeletonLogo} />
							<View style={styles.skeletonHeroText}>
								<Skeleton style={styles.skeletonBadge} />
								<Skeleton style={styles.skeletonName} />
							</View>
						</View>
						<Skeleton style={styles.skeletonDescription} />
						<Skeleton style={styles.skeletonDescriptionShort} />
						<Skeleton style={styles.skeletonButton} />
					</View>
				</View>
				<View style={styles.sectionHeader}>
					<Skeleton style={styles.skeletonSectionTitle} />
					<Skeleton style={styles.skeletonAddButton} />
				</View>
				<View style={styles.locations}>
					{[0, 1].map((i) => (
						<LocationCardSkeleton key={`gestion-location-skeleton-${i}`} />
					))}
				</View>
				<View style={styles.sectionTitle}>
					<Skeleton style={styles.skeletonSectionTitle} />
				</View>
				<View style={styles.skeletonQuickGrid}>
					<Skeleton style={styles.skeletonQuickLarge} />
					{[0, 1].map((row) => (
						<View
							key={`gestion-quick-skeleton-row-${row}`}
							style={styles.skeletonQuickRow}
						>
							{[0, 1].map((i) => (
								<Skeleton
									key={`gestion-quick-skeleton-${row}-${i}`}
									style={styles.skeletonQuickTile}
								/>
							))}
						</View>
					))}
				</View>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	heroCard: {
		marginTop: spacing.lg,
		padding: 0,
		overflow: "hidden",
	},
	coverWrap: {
		width: "100%",
		height: 170,
	},
	heroBody: {
		padding: spacing.lg,
		marginTop: -44,
		gap: spacing.xs,
	},
	heroIdentity: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: spacing.md,
	},
	logo: {
		width: 64,
		height: 64,
		borderRadius: radii.lg,
	},
	logoPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	typeBadge: {
		alignSelf: "flex-start",
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radii.sm,
	},
	hoursRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: spacing.xl,
		marginBottom: spacing.md,
	},
	sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
	locations: { gap: spacing.md },
	emptyLocations: { paddingVertical: spacing.xl + 8 },
	skeletonTitle: {
		height: 28,
		width: "40%",
		borderRadius: radii.sm,
	},
	skeletonCover: {
		width: "100%",
		height: 170,
		borderRadius: 0,
	},
	skeletonLogo: {
		width: 64,
		height: 64,
		borderRadius: radii.lg,
	},
	skeletonHeroText: {
		flex: 1,
		gap: spacing.xs,
	},
	skeletonBadge: {
		height: 14,
		width: 80,
		borderRadius: radii.sm,
	},
	skeletonName: {
		height: 22,
		width: "70%",
		borderRadius: radii.sm,
	},
	skeletonDescription: {
		height: 12,
		width: "90%",
		borderRadius: radii.sm,
		marginTop: spacing.md,
	},
	skeletonDescriptionShort: {
		height: 12,
		width: "60%",
		borderRadius: radii.sm,
	},
	skeletonButton: {
		height: 40,
		width: 140,
		borderRadius: radii.md,
		marginTop: spacing.md,
	},
	skeletonSectionTitle: {
		height: 20,
		width: "35%",
		borderRadius: radii.sm,
	},
	skeletonAddButton: {
		height: 32,
		width: 110,
		borderRadius: radii.pill,
	},
	skeletonQuickGrid: {
		gap: spacing.sm,
	},
	skeletonQuickRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	skeletonQuickLarge: {
		height: 66,
		width: "100%",
		borderRadius: radii.lg,
	},
	skeletonQuickTile: {
		height: 66,
		flex: 1,
		borderRadius: radii.lg,
	},
});
