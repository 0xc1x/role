import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Card, Screen } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function LandingScreen() {
	const { colors } = useTheme();
	return (
		<Screen scroll>
			<View style={styles.container}>
				{/* Hero */}
				<View style={[styles.hero, { backgroundColor: colors.primary }]}>
					<AppText
						variant="h1"
						weight="extraBold"
						style={{ color: "#fff", textAlign: "center" }}
					>
						{strings.landing.heroTitleA}
						<AppText
							variant="h1"
							weight="extraBold"
							style={{ color: colors.warning }}
						>
							{strings.landing.heroTitleB}
						</AppText>
					</AppText>
					<AppText
						variant="bodyLarge"
						style={{ color: "#FFF", opacity: 0.9, textAlign: "center" }}
					>
						{strings.landing.heroBody}
					</AppText>
					<Link href="/login" asChild>
						<Button label={strings.landing.login} fullWidth />
					</Link>
					<Link href="/signup" asChild>
						<Button
							label={strings.landing.createAccount}
							variant="secondary"
							fullWidth
						/>
					</Link>
				</View>

				{/* Why Rolé */}
				<View style={styles.section}>
					<AppText variant="h2" weight="bold" style={{ textAlign: "center" }}>
						{strings.landing.whyTitle}
					</AppText>
					<AppText
						variant="bodyMedium"
						style={{
							textAlign: "center",
							color: colors.mutedForeground,
							marginBottom: spacing.lg,
						}}
					>
						{strings.landing.whyBody}
					</AppText>
					<Card style={styles.featureCard}>
						<AppText variant="h4" weight="bold">
							🥗 {strings.landing.featureReduce}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.landing.featureReduceBody}
						</AppText>
					</Card>
					<Card style={styles.featureCard}>
						<AppText variant="h4" weight="bold">
							💸 {strings.landing.featureSave}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.landing.featureSaveBody}
						</AppText>
					</Card>
					<Card style={styles.featureCard}>
						<AppText variant="h4" weight="bold">
							🌍 {strings.landing.featureImpact}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.landing.featureImpactBody}
						</AppText>
					</Card>
					<Card style={styles.featureCard}>
						<AppText variant="h4" weight="bold">
							⚡ {strings.landing.featureEasy}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.landing.featureEasyBody}
						</AppText>
					</Card>
				</View>

				{/* How it works */}
				<View style={styles.section}>
					<AppText
						variant="h2"
						weight="bold"
						style={{ textAlign: "center", marginBottom: spacing.lg }}
					>
						{strings.landing.howTitle}
					</AppText>
					{[
						{
							step: "1",
							title: strings.landing.howStep1,
							body: strings.landing.howStep1Body,
						},
						{
							step: "2",
							title: strings.landing.howStep2,
							body: strings.landing.howStep2Body,
						},
						{
							step: "3",
							title: strings.landing.howStep3,
							body: strings.landing.howStep3Body,
						},
					].map((s) => (
						<Card key={s.step} style={styles.featureCard}>
							<View style={styles.stepRow}>
								<View
									style={[
										styles.stepBadge,
										{ backgroundColor: colors.primary },
									]}
								>
									<AppText variant="h4" weight="bold" style={{ color: "#fff" }}>
										{s.step}
									</AppText>
								</View>
								<AppText variant="h4" weight="bold">
									{s.title}
								</AppText>
							</View>
							<AppText
								variant="bodyMedium"
								style={{ color: colors.mutedForeground }}
							>
								{s.body}
							</AppText>
						</Card>
					))}
				</View>

				{/* CTA */}
				<View style={[styles.cta, { backgroundColor: colors.secondary }]}>
					<AppText
						variant="h2"
						weight="bold"
						style={{ color: colors.secondaryForeground, textAlign: "center" }}
					>
						{strings.landing.ctaTitle}
					</AppText>
					<AppText
						variant="bodyMedium"
						style={{ color: colors.secondaryForeground, textAlign: "center" }}
					>
						{strings.landing.ctaBody}
					</AppText>
					<Link href="/signup" asChild>
						<Button label={strings.landing.openApp} fullWidth />
					</Link>
				</View>

				<AppText
					variant="bodySmall"
					style={{
						textAlign: "center",
						color: colors.mutedForeground,
						marginTop: spacing.xl,
					}}
				>
					© {new Date().getFullYear()} Rolé · {strings.landing.footerRights}
				</AppText>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { paddingBottom: spacing.xxl },
	hero: {
		padding: spacing.xl,
		gap: spacing.md,
		alignItems: "center",
		borderRadius: 0,
		marginHorizontal: -spacing.xl,
	},
	section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
	featureCard: { marginBottom: spacing.md, gap: spacing.xs },
	stepRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginBottom: spacing.xs,
	},
	stepBadge: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	cta: {
		marginTop: spacing.xl,
		marginHorizontal: spacing.xl,
		borderRadius: 16,
		padding: spacing.xl,
		gap: spacing.md,
		alignItems: "center",
	},
});
