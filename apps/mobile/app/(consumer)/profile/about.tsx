import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";

import { strings } from "@/core/i18n/strings";
import { AppText, Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { useAuthStore } from "@/features/auth/store";

type IoniconName = keyof typeof Ionicons.glyphMap;

function Hero() {
	const { colors } = useTheme();
	return (
		<LinearGradient
			colors={[`${colors.secondary}4D`, `${colors.secondary}1A`, `${colors.primary}1A`]}
			start={{ x: 0, y: 0 }}
			end={{ x: 1, y: 1 }}
			style={styles.hero}
		>
			<View style={styles.heroBody}>
				<AppText variant="h2" weight="bold" style={styles.centered}>
					{strings.aboutScreen.missionTitle}
				</AppText>
				<AppText
					variant="bodyLarge"
					style={[styles.centered, { color: colors.mutedForeground }]}
				>
					{strings.aboutScreen.missionBody}
				</AppText>
			</View>
		</LinearGradient>
	);
}

function Mission() {
	const { colors } = useTheme();
	return (
		<View style={styles.section}>
			<View style={styles.missionBody}>
				<AppText variant="h2" weight="bold" style={styles.centered}>
					{strings.aboutScreen.whyTitle}
				</AppText>
				<AppText
					variant="bodyLarge"
					style={[styles.centered, styles.missionText, { color: colors.mutedForeground }]}
				>
					{strings.aboutScreen.whyBody1}
				</AppText>
				<AppText
					variant="bodyLarge"
					style={[styles.centered, { color: colors.mutedForeground }]}
				>
					{strings.aboutScreen.whyBody2}
				</AppText>
				<View style={[styles.ecoPanel, { backgroundColor: `${colors.secondary}33` }]}>
					<Ionicons name="leaf-outline" size={80} color={colors.ecoGreen} />
				</View>
			</View>
		</View>
	);
}

function ValueCard({
	icon,
	title,
	description,
}: {
	icon: IoniconName;
	title: string;
	description: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.valueCard, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
			<View style={[styles.valueIcon, { backgroundColor: `${colors.secondary}4D` }]}>
				<Ionicons name={icon} size={24} color={colors.primary} />
			</View>
			<View style={styles.valueBody}>
				<AppText variant="bodyMedium" weight="bold">
					{title}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{description}
				</AppText>
			</View>
		</View>
	);
}

function Values() {
	const { colors } = useTheme();
	return (
		<View style={[styles.section, { backgroundColor: colors.background }]}>
			<AppText variant="h2" weight="bold" style={[styles.centered, styles.sectionTitle]}>
				{strings.aboutScreen.valuesTitle}
			</AppText>
			<View style={styles.valueList}>
				<ValueCard
					icon="leaf-outline"
					title={strings.aboutScreen.valueSustainability}
					description={strings.aboutScreen.valueSustainabilityBody}
				/>
				<ValueCard
					icon="heart-outline"
					title={strings.aboutScreen.valueCommunity}
					description={strings.aboutScreen.valueCommunityBody}
				/>
				<ValueCard
					icon="bulb-outline"
					title={strings.aboutScreen.valueInnovation}
					description={strings.aboutScreen.valueInnovationBody}
				/>
			</View>
		</View>
	);
}

function Stats() {
	const { colors } = useTheme();
	const items = [
		{ value: strings.aboutScreen.statMealsValue, label: strings.aboutScreen.statMeals },
		{
			value: strings.aboutScreen.statBusinessesValue,
			label: strings.aboutScreen.statBusinesses,
		},
		{ value: strings.aboutScreen.statUsersValue, label: strings.aboutScreen.statUsers },
		{ value: strings.aboutScreen.statCo2Value, label: strings.aboutScreen.statCo2 },
	];
	return (
		<View style={styles.section}>
			<AppText variant="h2" weight="bold" style={[styles.centered, styles.sectionTitle]}>
				{strings.aboutScreen.statsTitle}
			</AppText>
			<View style={styles.statsGrid}>
				{items.map((item) => (
					<View key={item.label} style={styles.statItem}>
						<AppText variant="h2" weight="bold" style={{ color: colors.primary }}>
							{item.value}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={[styles.centered, { color: colors.mutedForeground }]}
						>
							{item.label}
						</AppText>
					</View>
				))}
			</View>
		</View>
	);
}

export default function AboutScreen() {
	const { status, initialized } = useAuthStore();

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={styles.header}>
				<ScreenHeader title={strings.aboutScreen.title} />
			</View>
			<Hero />
			<Mission />
			<Values />
			<Stats />
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
	hero: {
		width: "100%",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 48,
	},
	heroBody: {
		alignItems: "center",
		gap: spacing.xl,
		paddingHorizontal: spacing.xl,
	},
	centered: { textAlign: "center" },
	section: {
		paddingVertical: 48,
		paddingHorizontal: spacing.xl,
	},
	missionBody: {
		alignItems: "center",
		gap: spacing.xl,
		maxWidth: 1000,
		alignSelf: "center",
	},
	missionText: { lineHeight: 24 },
	ecoPanel: {
		width: "100%",
		height: 250,
		borderRadius: 40,
		alignItems: "center",
		justifyContent: "center",
	},
	sectionTitle: { marginBottom: spacing.sm },
	valueList: { gap: spacing.lg, maxWidth: 700, alignSelf: "center", width: "100%" },
	valueCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: 20,
		borderRadius: 24,
		borderWidth: 1,
	},
	valueIcon: {
		padding: spacing.md,
		borderRadius: 999,
	},
	valueBody: { flex: 1, gap: 4 },
	statsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.lg,
		marginTop: spacing.xl,
	},
	statItem: {
		width: "47%",
		alignItems: "center",
		gap: spacing.sm,
	},
});