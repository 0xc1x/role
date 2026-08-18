import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";

/**
 * Reusable bottom sheet (same visual language as the consumer
 * `OfferFiltersSheet`): backdrop + rounded sheet + grabber + header.
 */
export function SheetModal({
	title,
	onClose,
	children,
	footer,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();

	return (
		<Modal
			visible
			transparent
			statusBarTranslucent
			animationType="slide"
			onRequestClose={onClose}
		>
			<View style={styles.backdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							paddingBottom: insets.bottom,
						},
					]}
				>
					<View style={[styles.grabber, { backgroundColor: colors.borderSolid }]} />
					<View style={styles.header}>
						<AppText variant="h3" weight="bold">
							{title}
						</AppText>
						<Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
							<Ionicons name="close" size={22} color={colors.mutedForeground} />
						</Pressable>
					</View>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContent}
					>
						{children}
					</ScrollView>
					{footer ? <View style={styles.footer}>{footer}</View> : null}
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	sheet: {
		borderTopLeftRadius: radii.xl,
		borderTopRightRadius: radii.xl,
		borderWidth: 1,
		maxHeight: "80%",
	},
	grabber: {
		alignSelf: "center",
		width: 48,
		height: 5,
		borderRadius: 2.5,
		marginTop: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
	},
	scrollContent: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.md,
		gap: spacing.sm,
	},
	footer: {
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.sm,
	},
});