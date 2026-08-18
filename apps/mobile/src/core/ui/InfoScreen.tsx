import { StyleSheet, View } from "react-native";

import { AppText, Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";

/** Simple scrollable screen for static informational content (about/terms/help…). */
export default function InfoScreen({
	title,
	body,
}: {
	title: string;
	body: string;
}) {
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={title} />
				<AppText variant="bodyMedium">{body}</AppText>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
});
