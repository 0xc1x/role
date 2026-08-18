import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Card, Screen } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function LandingForBusinessScreen() {
	const { colors } = useTheme();
	const benefits = [
		{
			title: strings.landing.featureReduce,
			body: strings.landing.featureReduceBody,
		},
		{
			title: strings.landing.featureImpact,
			body: strings.landing.featureImpactBody,
		},
	];
	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h1" weight="bold">
					{strings.landing.forBusiness}
				</AppText>
				<Card style={{ marginTop: spacing.lg }}>
					{benefits.map((b) => (
						<View key={b.title} style={{ marginBottom: spacing.md }}>
							<AppText variant="h4" weight="bold">
								{b.title}
							</AppText>
							<AppText
								variant="bodyMedium"
								style={{ color: colors.mutedForeground }}
							>
								{b.body}
							</AppText>
						</View>
					))}
				</Card>
				<Link href="/business-signup" asChild>
					<Button
						label={strings.business.createBusiness}
						fullWidth
						style={{ marginTop: spacing.lg }}
					/>
				</Link>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});
