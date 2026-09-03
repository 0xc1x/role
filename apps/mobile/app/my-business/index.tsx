import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	SectionTitle,
	ThemeOptionCard 
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useBusinesses, useBusinessProfile } from "@/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { spacing } from "@/core/theme/spacing";
import { ThemeMode, useTheme } from "@/core/theme";

function Row({ label, value }: { label: string; value: string | null }) {
	const { colors } = useTheme();
	return (
		<View style={styles.rowBetween}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
			<AppText variant="bodyMedium">{value ?? "—"}</AppText>
		</View>
	);
}

export default function BusinessProfileScreen() {
	const { colors, mode, setMode } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];
	const businessId = business?.id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessProfile(
		businessId,
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const b = data?.business;
	const MODES: Array<{ key: ThemeMode; label: string; icon: string }> = [
		{ key: "light", label: strings.settings.light, icon: "sunny-outline" },
		{ key: "dark", label: strings.settings.dark, icon: "moon-outline" },
		{ key: "system", label: strings.settings.system, icon: "phone-portrait-outline" },
	];

	return (
		<Screen scroll>
			<View style={styles.container}>
				{/* Hub de configuración: atrás vuelve a Mi negocio si el stack no tiene historia. */}
				<ScreenHeader
					title={strings.settings.title}
					fallback="/(business)/management"
				/>

				{data ? (
					<Card style={{ marginTop: spacing.lg }}>
						<AppText variant="h2" weight="bold">
							{b?.name}
						</AppText>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{BUSINESS_TYPE_LABELS?.[b?.type ?? ""] ?? b?.type}
						</AppText>
						<AppText variant="bodyMedium" style={{ marginTop: spacing.md }}>
							{b?.description ?? "Sin descripción registrada"}
						</AppText>
						<Button
							label={strings.business.editProfile}
							icon={<Ionicons name="create-outline" size={20} color="#fff" />}
							style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
							onPress={() => router.push("/my-business/edit")}
						/>
					</Card>
				) : null}

				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground, marginTop: spacing.xl }}
				>
					{strings.business.themeAppearance}
				</AppText>

				<SectionTitle>{strings.settings.appearance}</SectionTitle>
				<View style={styles.themeRow}>
					{MODES.map((m) => (
						<ThemeOptionCard
							key={m.key}
							label={m.label}
							icon={m.icon}
							isSelected={mode === m.key}
							onPress={() => setMode(m.key)}
						/>
					))}
				</View>

				<Card style={{ marginTop: spacing.xl }}>
					<Link href={`/business/${businessId}`} asChild>
						<View style={styles.rowBetween}>
							<AppText variant="bodyMedium">
								Panel de {b?.name ?? ""}
							</AppText>
							<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
						</View>
					</Link>
				</Card>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginVertical: spacing.xs,
	},
	themeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
	themeOption: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		paddingVertical: spacing.md,
		borderRadius: 12,
		borderWidth: 1,
		// borderColor dinámico via useTheme (colors.border) — valor por defecto neutro
	},
	pressed: { opacity: 0.85 },
});