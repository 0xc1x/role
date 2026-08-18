import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { radii, spacing } from "@/core/theme/spacing";
import { AppText } from "@/core/ui";
import { strings } from "@/core/i18n/strings";

/**
 * Divisor "o … con" + botones sociales (Google/Apple), portados de Fudi.
 * Placeholders: el flujo social aún no está conectado (igual que en Fudi).
 */
export function SocialAuthButtons({ label }: { label: string }) {
	const { colors } = useTheme();
	return (
		<>
			<View style={styles.dividerRow}>
				<View style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]} />
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<View style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]} />
			</View>
			<View style={styles.providers}>
				<SocialProvider
					icon={<Ionicons name="logo-google" size={20} color={colors.foreground} />}
					label={strings.auth.google}
				/>
				<SocialProvider
					icon={<Ionicons name="logo-apple" size={20} color={colors.foreground} />}
					label={strings.auth.apple}
				/>
			</View>
		</>
	);
}

function SocialProvider({ icon, label }: { icon: ReactNode; label: string }) {
	const { colors } = useTheme();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled
			style={[
				styles.provider,
				{
					backgroundColor: colors.inputBackground,
					borderColor: colors.borderSolid,
				},
			]}
		>
			{icon}
			<AppText variant="bodyMedium" weight="semiBold">
				{label}
			</AppText>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	dividerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		marginVertical: spacing.xl,
	},
	dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
	providers: {
		flexDirection: "row",
		gap: spacing.md,
	},
	provider: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		paddingVertical: 14,
	},
});