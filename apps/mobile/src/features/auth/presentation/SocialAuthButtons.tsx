import { Apple, Globe } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";

import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
import { strings } from "@/src/core/i18n/strings";

/**
 * Divisor "o … con" + botones sociales (Google/Apple), portados de Fudi.
 * Placeholders: el flujo social aún no está conectado (igual que en Fudi).
 */
export function SocialAuthButtons({ label }: { label: string }) {
	const { colors } = useTheme();
	return (
		<>
			<View style={styles.dividerRow}>
				<View
					style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]}
				/>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<View
					style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]}
				/>
			</View>
			<View style={styles.providers}>
				<SocialProvider
					icon={
						<Ionicons name="logo-google" size={20} color={colors.foreground} />
					}
					label={strings.auth.google}
				/>
				<SocialProvider
					icon={
						<Ionicons name="logo-apple" size={20} color={colors.foreground} />
					}
					label={strings.auth.apple}
				/>
			</View>
		</>
	);
}

function SocialProvider({ icon, label }: { icon: ReactNode; label: string }) {
	return (
		<Button
			variant="outline"
			disabled
			accessibilityRole="button"
			accessibilityLabel={label}
			style={{ flex: 1 }}
			icon={icon}
		>
			{label}
		</Button>
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
		// Pill como el resto de CTAs (marca web): el rect era resto del port de Fudi.
		borderRadius: radii.pill,
		borderWidth: 1,
		paddingVertical: 14,
	},
});
