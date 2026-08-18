import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { AppText, CircleIconButton } from "@/core/ui";

/**
 * Estructura común de las pantallas de autenticación (portada de Fudi):
 * cabecera con botón de regreso + título, divisor y cuerpo scrollable
 * centrado con ancho máximo similar al de escritorio.
 */
export function AuthScreenShell({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	const { colors } = useTheme();

	const goBack = () => {
		if (router.canGoBack()) router.back();
		else router.replace("/");
	};

	return (
		<SafeAreaView
			edges={["top", "bottom"]}
			style={[styles.safe, { backgroundColor: colors.background }]}
		>
			<View style={styles.header}>
				<CircleIconButton
					icon={<Ionicons name="chevron-back" size={20} color={colors.foreground} />}
					onPress={goBack}
					accessibilityLabel={strings.common.back}
				/>
				<AppText variant="h2" weight="bold" numberOfLines={1} style={styles.headerTitle}>
					{title}
				</AppText>
			</View>
			<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
			<ScrollView
				contentContainerStyle={styles.scrollContent}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.body}>{children}</View>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
	headerTitle: { flex: 1 },
	divider: { height: StyleSheet.hairlineWidth },
	scrollContent: {
		flexGrow: 1,
		alignItems: "center",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.xxl,
	},
	body: { width: "100%", maxWidth: 448 },
});