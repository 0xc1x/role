import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, Screen } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const BENEFITS = [
	{
		title: strings.landing.featureReduce,
		body: strings.landing.featureReduceBody,
	},
	{
		title: strings.landing.featureImpact,
		body: strings.landing.featureImpactBody,
	},
];

export default function LandingForBusinessScreen() {
	const { colors } = useTheme();
	const benefits = BENEFITS;
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
						fullWidth
						style={{ marginTop: spacing.lg }}
					>
						{strings.business.createBusiness}
					</Button>
				</Link>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});
