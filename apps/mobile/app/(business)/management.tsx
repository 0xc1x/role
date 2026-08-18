import { type Href, router } from "expo-router";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/text";
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
import { useAuthStore } from "@/features/auth/store";
import { authRepository } from "@/features/auth/data/repository";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { LocationCard } from "@/features/business/components/LocationCard";
import {
	useBusinesses,
	useBusinessLocations,
	useBusinessProfile,
} from "@/features/business/hooks";

export default function GestionScreen() {
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];

	if (isLoading) return null;

	if (!business) {
		return (
			<Screen>
				<View style={styles.stateContainer}>
					<EmptyState
						icon={<Ionicons name="storefront-outline" size={28} />}
						title={strings.business.noBusiness}
						message={strings.business.createBusiness}
						action={
							<Button
								label={strings.business.createBusiness}
								onPress={() => router.push("/(business)/profile")}
							/>
						}
					/>
				</View>
			</Screen>
		);
	}

	return <GestionContent businessId={business.id} />;
}

function GestionContent({ businessId }: { businessId: string }) {
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
						{business.description ?? "Sin descripción registrada"}
					</AppText>
					<Button
						label={strings.business.editProfile}
						variant="primary"
						icon={<Ionicons name="create-outline" size={20} color="#fff" />}
						style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
						onPress={() => router.push("/(business)/profile/edit")}
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
						icon={<Ionicons name="add" size={16} color="#fff" />}
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

				<SignOutDialog style={{ marginTop: spacing.xl }} />
				<View style={{ height: 40 }} />
			</View>
		</Screen>
	);
}

// ─── Quick actions grid ──────────────────────────────────────────────
function QuickActionsGrid({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;

	const large = {
		icon: <Ionicons name="trending-up" size={18} color={colors.greenDark} />,
		title: strings.business.quickStats,
		subtitle: strings.business.quickStatsSub,
		route: `${base}/stats`,
	} as const;

	const grid = [
		{
			icon: <Ionicons name="card-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickPayments,
			subtitle: strings.business.quickPaymentsSub,
			route: `${base}/payouts`,
		},
		{
			icon: <Ionicons name="pricetag-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickCoupons,
			subtitle: strings.business.quickCouponsSub,
			route: `${base}/coupons`,
		},
		{
			icon: <Ionicons name="notifications-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickAlerts,
			subtitle: strings.business.quickAlertsSub,
			route: `${base}/notifications`,
		},
		{
			icon: <Ionicons name="help-circle-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickSupport,
			subtitle: strings.business.quickSupportSub,
			route: `${base}/help`,
		},
	];

	return (
		<View style={styles.quickGrid}>
			<Pressable
				onPress={() => router.push(`${base}/stats` as Href)}
				style={({ pressed }) => [
					styles.quickTileLarge,
					{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					pressed && styles.pressed,
				]}
			>
				<View style={styles.quickInfo}>
					<AppText variant="bodyMedium" weight="bold">
						{large.title}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{large.subtitle}
					</AppText>
				</View>
				<View style={[styles.quickIconLarge, { backgroundColor: colors.muted }]}>
					{large.icon}
				</View>
			</Pressable>
			<View style={styles.quickCellWrap}>
				{grid.map((item) => (
					<Pressable
						key={item.title}
						onPress={() => router.push(item.route as Href)}
						style={({ pressed }) => [
							styles.quickTile,
							{ backgroundColor: colors.card, borderColor: colors.borderSolid },
							pressed && styles.pressed,
						]}
					>
						<View style={styles.quickInfo}>
							<AppText variant="bodySmall" weight="bold">
								{item.title}
							</AppText>
							<AppText
								variant="bodySmall"
								numberOfLines={1}
								style={{ fontSize: 11, color: colors.mutedForeground }}
							>
								{item.subtitle}
							</AppText>
						</View>
						<View style={[styles.quickIcon, { borderColor: colors.borderSolid }]}>
							{item.icon}
						</View>
					</Pressable>
				))}
			</View>
		</View>
	);
}

// ─── Settings section ────────────────────────────────────────────────
export function SettingsSection({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;
	const items = [
		{
			icon: <Ionicons name="settings-outline" size={20} color="gray" />,
			label: strings.business.generalSettings,
			route: "/(business)/profile" as Href,
		},
		{
			icon: <Ionicons name="notifications-outline" size={20} color="currentColor" />,
			label: strings.business.notifications,
			route: `${base}/notifications` as Href,
		},
		{
			icon: <Ionicons name="card-outline" size={20} color="currentColor" />,
			label: strings.business.paymentMethods,
			route: `${base}/payouts` as Href,
		},
		{
			icon: <Ionicons name="help-circle-outline" size={20} color="currentColor" />,
			label: strings.business.helpCenter,
			route: `${base}/help` as Href,
		},
	];
	return (
		<Card style={styles.settingsCard}>
			{items.map((item, index) => (
				<View key={item.label}>
					<Pressable
						onPress={() => router.push(item.route)}
						style={({ pressed }) => [
							styles.settingsItem,
							pressed && styles.pressed,
						]}
					>
						<View style={styles.rowStart}>
							{item.icon}
							<View style={{ marginLeft: spacing.md }}>
								<AppText variant="bodyMedium">{item.label}</AppText>
							</View>
						</View>
						<Ionicons name="chevron-forward" size={18} color="gray" />
					</Pressable>
					{index < items.length - 1 ? (
						<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					) : null}
				</View>
			))}
		</Card>
	);
}

// ─── Sign out ────────────────────────────────────────────────────────
function SignOutDialog({ style }: { style?: object }) {
	const [open, setOpen] = useState(false);
	const confirmSignOut = () => {
		void authRepository.signOut().then(() => {
			useAuthStore.getState().clear();
		});
		setOpen(false);
	};
	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<AlertDialogTrigger asChild>
				<Button
					label={strings.profile.signOutItem}
					variant="danger"
					onPress={() => setOpen(true)}
					style={style}
				/>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{strings.auth.signOut}</AlertDialogTitle>
					<AlertDialogDescription>{strings.auth.signOutConfirm}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Text>Cancelar</Text>
					</AlertDialogCancel>
					<AlertDialogAction onPress={confirmSignOut}>
						<Text>{strings.auth.signOut}</Text>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	stateContainer: { padding: spacing.xl },
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
	rowStart: { flexDirection: "row", alignItems: "center" },
	quickGrid: { gap: spacing.sm },
	quickCellWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	quickTileLarge: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: 16,
	},
	quickTile: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		flexBasis: "48%",
		flexGrow: 1,
		gap: spacing.xs,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: 16,
	},
	quickInfo: { flexShrink: 1, gap: 2 },
	quickIconLarge: {
		width: 34,
		height: 34,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	quickIcon: {
		width: 34,
		height: 34,
		borderRadius: 8,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	settingsCard: { padding: 0 },
	settingsItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	divider: { height: 1, width: "100%" },
	pressed: { opacity: 0.85 },
});