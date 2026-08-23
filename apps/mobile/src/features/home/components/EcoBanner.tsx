import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/core/theme";
import { AppText } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";

export function EcoBanner() {
	const { colors } = useTheme();

	return (
		<View
			style={[
				styles.container,
				{ backgroundColor: colors.greenDark },
			]}
		>
			<View style={styles.content}>
				<View
					style={[styles.iconContainer, { backgroundColor: colors.greenMidDark }]}
				>
					<Ionicons name="leaf" size={28} color={colors.green} />
				</View>
				<View style={styles.textContainer}>
					<AppText
						style={{
							color: colors.greenDarkForeground,
							fontSize: 16,
							fontWeight: "700",
							lineHeight: 20,
						}}
					>
						{strings.home.ecoBannerTitle}
					</AppText>
					<AppText
						style={{
							color: colors.greenDarkForeground + "B3",
							fontSize: 13,
							marginTop: 6,
						}}
					>
						{strings.home.ecoBannerBody}
					</AppText>
				</View>
			</View>
			<View style={styles.leafDecorationWrap} pointerEvents="none">
				<View
					style={[styles.leafDecoration, { backgroundColor: colors.ecoGreen }]}
				>
					<Ionicons
						name="leaf"
						size={40}
						color={colors.greenDarkForeground}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginHorizontal: spacing.lg,
		marginTop: spacing.lg,
		marginBottom: spacing.xs,
		height: 100,
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	content: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingRight: 75 + spacing.lg,
	},
	iconContainer: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: "center",
		justifyContent: "center",
	},
	textContainer: {
		flex: 1,
		marginLeft: 14,
	},
	leafDecorationWrap: {
		position: "absolute",
		right: spacing.md,
		top: -5,
		bottom: -5,
		justifyContent: "center",
	},
	leafDecoration: {
		width: 75,
		height: 75,
		borderRadius: 37.5,
		alignItems: "center",
		justifyContent: "center",
	},
});
