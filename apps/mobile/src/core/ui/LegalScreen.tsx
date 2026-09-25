import { StyleSheet, View } from "react-native";

import { AppText, Screen, ScreenHeader } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Card } from "@/components/ui/card";

interface LegalSection {
	title: string;
	content: string;
}

/** Scrollable screen for legal documents (terms/privacy) with section list. */
export default function LegalScreen({
	title,
	updatedAt,
	sections,
}: {
	title: string;
	updatedAt: string;
	sections: readonly LegalSection[];
}) {
	const { colors } = useTheme();
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={title} />
				<Card style={styles.card}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{updatedAt}
					</AppText>
					{sections.map((section) => (
						<View key={section.title} style={styles.section}>
							<AppText variant="bodyMedium" weight="bold">
								{section.title}
							</AppText>
							<AppText
								variant="bodyMedium"
								style={{
									color: colors.mutedForeground,
									lineHeight: 21,
									marginTop: spacing.sm,
								}}
							>
								{section.content}
							</AppText>
						</View>
					))}
				</Card>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	card: { padding: spacing.xl, borderRadius: radii.lg },
	section: { marginTop: spacing.xl },
});
