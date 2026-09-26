import { Apple, Globe } from "lucide-react-native";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
import { strings } from "@/src/core/i18n/strings";

/**
 * Aviso de proveedores sociales (Google/Apple), portado de Fudi.
 *
 * El flujo social NO está conectado: Supabase no tiene proveedor OAuth
 * configurado en este proyecto. Antes esto pintaba dos `Button` con
 * `disabled` sin explicación, con el mismo estilo que los botones que sí
 * funcionan y debajo de un divisor "o continuar con" — dos controles que
 * parecen vivos y no hacen nada.
 *
 * Ahora no hay botón: hay una fila estática de proveedores con la etiqueta
 * "Próximamente" y una frase que dice por qué. Cuando el flujo exista, esta
 * pieza se sustituye por los botones reales (la decisión de producto está
 * registrada en `docs/decisions/`).
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

			<View
				style={[
					styles.providers,
					{
						backgroundColor: colors.muted,
						borderColor: colors.borderSolid,
					},
				]}
			>
				<ProviderChip
					icon={<Globe size={18} color={colors.mutedForeground} />}
					label={strings.auth.google}
				/>
				<ProviderChip
					icon={<Apple size={18} color={colors.mutedForeground} />}
					label={strings.auth.apple}
				/>
				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground }}
				>
					{strings.auth.socialUnavailableLabel}
				</AppText>
			</View>

			<AppText
				variant="bodySmall"
				style={[styles.note, { color: colors.mutedForeground }]}
			>
				{strings.auth.socialUnavailableBody}
			</AppText>
		</>
	);
}

function ProviderChip({ icon, label }: { icon: ReactNode; label: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.chip}>
			{icon}
			<AppText
				variant="bodySmall"
				weight="medium"
				style={{ color: colors.mutedForeground }}
			>
				{label}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	dividerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		marginTop: spacing.xl,
		marginBottom: spacing.md,
	},
	dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
	providers: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		borderWidth: 1,
		borderRadius: radii.md,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.lg,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	note: { marginTop: spacing.sm },
});
