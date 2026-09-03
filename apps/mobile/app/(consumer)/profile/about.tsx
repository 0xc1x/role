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
import { usePlatformStats } from "@/features/profile/hooks";

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
					{strings.aboutScreen.heroTitle}
				</AppText>
				<AppText variant="bodyLarge" style={[styles.centered, { color: colors.mutedForeground }]}>
					{strings.aboutScreen.heroBody}
				</AppText>
			</View>
		</LinearGradient>
	);
}

function TextSection({ title, body }: { title: string; body: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.section}>
			<View style={styles.textSectionBody}>
				<AppText variant="h2" weight="bold" style={styles.centered}>
					{title}
				</AppText>
				<AppText variant="bodyLarge" style={[styles.centered, styles.bodyText, { color: colors.mutedForeground }]}>
					{body}
				</AppText>
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

function Principles() {
	const { colors } = useTheme();
	return (
		<View style={[styles.section, { backgroundColor: colors.background }]}>
			<AppText variant="bodySmall" weight="bold" style={[styles.eyebrow, { color: colors.primary }]}>
				{strings.aboutScreen.principlesEyebrow.toUpperCase()}
			</AppText>
			<AppText variant="h2" weight="bold" style={[styles.centered, styles.sectionTitle]}>
				{strings.aboutScreen.principlesTitle}
			</AppText>
			<View style={styles.valueList}>
				<ValueCard
					icon="leaf-outline"
					title={strings.aboutScreen.principle1Title}
					description={strings.aboutScreen.principle1Body}
				/>
				<ValueCard
					icon="people-outline"
					title={strings.aboutScreen.principle2Title}
					description={strings.aboutScreen.principle2Body}
				/>
				<ValueCard
					icon="pricetag-outline"
					title={strings.aboutScreen.principle3Title}
					description={strings.aboutScreen.principle3Body}
				/>
				<ValueCard
					icon="sparkles-outline"
					title={strings.aboutScreen.principle4Title}
					description={strings.aboutScreen.principle4Body}
				/>
			</View>
		</View>
	);
}

function Stats() {
	const { colors } = useTheme();
	const { data } = usePlatformStats();
	// Fallback a valores de strings si RPC falla / aún carga (no bloquea UI)
	const users = data?.users ?? 15;
	const businesses = data?.businesses ?? 13;
	const meals = data?.meals ?? 7;
	const items = [
		{ value: `${users}+`, label: strings.aboutScreen.statUsers },
		{ value: `${businesses}+`, label: strings.aboutScreen.statBusinesses },
		{ value: `${meals}+`, label: strings.aboutScreen.statMeals },
	];
	return (
		<View style={styles.section}>
			<AppText variant="h2" weight="bold" style={[styles.centered, styles.sectionTitle]}>
				{strings.aboutScreen.statsTitle}
			</AppText>
			<AppText variant="bodyMedium" weight="semiBold" style={[styles.centered, { color: colors.mutedForeground }]}>
				{strings.aboutScreen.statsSubtitle}
			</AppText>
			<View style={styles.statsGrid}>
				{items.map((item) => (
					<View key={item.label} style={styles.statItem}>
						<AppText variant="h2" weight="bold" style={{ color: colors.primary }}>
							{item.value}
						</AppText>
						<AppText variant="bodyMedium" style={[styles.centered, { color: colors.mutedForeground }]}>
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

	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={styles.header}>
				<ScreenHeader title={strings.aboutScreen.title} fallback="/(consumer)/profile" />
			</View>
			<Hero />
			<TextSection title={strings.aboutScreen.ideaTitle} body={strings.aboutScreen.ideaBody} />
			<TextSection title={strings.aboutScreen.missionTitle} body={strings.aboutScreen.missionBody} />
			<TextSection title={strings.aboutScreen.howTitle} body={strings.aboutScreen.howBody} />
			<Stats />
			<Principles />
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
	eyebrow: { textAlign: "center", letterSpacing: 1.2, fontSize: 12 },
	section: {
		paddingVertical: 48,
		paddingHorizontal: spacing.xl,
	},
	textSectionBody: {
		alignItems: "center",
		gap: spacing.lg,
		maxWidth: 1000,
		alignSelf: "center",
	},
	bodyText: { lineHeight: 24 },
	sectionTitle: { marginBottom: spacing.sm },
	valueList: { gap: spacing.lg, maxWidth: 700, alignSelf: "center", width: "100%", marginTop: spacing.lg },
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
		justifyContent: "center",
	},
	statItem: {
		minWidth: 90,
		flex: 1,
		alignItems: "center",
		gap: spacing.sm,
	},
});
