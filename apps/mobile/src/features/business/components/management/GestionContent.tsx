import { type Href, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { LocationCard } from "@/features/business/components/LocationCard";
import {
	useBusinessLocations,
	useBusinessProfile,
} from "@/features/business/hooks";
import { QuickActionsGrid } from "./QuickActionsGrid";
import { SettingsSection } from "./SettingsSection";
import { SignOutSection } from "@/features/auth/presentation/SignOutSection";

export function GestionContent({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const {
		data: profile,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessProfile(businessId);
	const {
		data: locations,
		isLoading: locationsLoading,
	} = useBusinessLocations(businessId);

	if (isLoading) return <LoadingView />;
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
				<Card style={styles.businessCard}>
					<AppText variant="h2" weight="bold">
						{business.name}
					</AppText>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, marginTop: 2 }}
					>
						{BUSINESS_TYPE_LABELS[business.type] ?? business.type}
					</AppText>
					<AppText variant="bodyMedium" style={{ marginTop: spacing.md }}>
						{business.description ?? strings.business.noDescription}
					</AppText>
					<Button
						label={strings.business.editProfile}
						variant="primary"
						icon={<Ionicons name="create-outline" size={20} color={colors.primaryForeground} />}
						style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
						onPress={() => router.push("/my-business/edit")}
					/>
				</Card>

				{/* ── Mis Locales ─────────────────────────────────── */}
				<View style={styles.sectionHeader}>
					<AppText variant="h4" weight="bold">
						{strings.business.myLocations}
					</AppText>
					<Button
						label={strings.business.addLocation}
						size="sm"
						icon={<Ionicons name="add" size={16} color={colors.primaryForeground} />}
						onPress={() =>
							router.push(`/business/${businessId}/locations/create` as Href)
						}
					/>
				</View>

				{!locationsLoading && locations && locations.length === 0 ? (
					<Card style={styles.emptyLocations}>
						<EmptyState
							icon={<Ionicons name="pin-outline" size={28} />}
							title={strings.business.noLocationsTitle}
							message={strings.business.noLocationsBody}
							action={
								<Button
									label={strings.business.createLocation}
									onPress={() =>
										router.push(
											`/business/${businessId}/locations/create` as Href,
										)
									}
								/>
							}
						/>
					</Card>
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

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	businessCard: { marginTop: spacing.lg, gap: spacing.xs },
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
});
