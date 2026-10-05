import { type Href, router } from "expo-router";
import type { ReactNode } from "react";
import {
	Bell,
	Bug,
	ChevronRight,
	CircleHelp,
	Settings,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { Button } from "@/components/ui/button";
import { useReportProblemSheet } from "@/src/features/bug-report/use-report-problem-sheet";

/**
 * Una fila del menú: o navega, o abre la hoja del buzón en esta misma pantalla.
 *
 * Unión y no dos campos opcionales porque las dos ramas se tocan distinto: la
 * que navega delega en `router.push` y la que abre la hoja no sale de la
 * pantalla. Igual que en el perfil del consumidor, y por la misma razón.
 */
type SettingsRow =
	| { icon: ReactNode; label: string; route: Href }
	| { icon: ReactNode; label: string; onPress: () => void };

export function SettingsSection({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const { openReportProblem, reportProblemSheet } = useReportProblemSheet();
	const base = `/business/${businessId}`;
	const items: SettingsRow[] = [
		{
			icon: <Settings size={20} color={colors.mutedForeground} />,
			label: strings.business.generalSettings,
			route: "/my-business" as Href,
		},
		{
			icon: <Bell size={20} color={colors.mutedForeground} />,
			label: strings.business.notifications,
			route: `${base}/notifications` as Href,
		},
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <CreditCard size={20} color={colors.mutedForeground} />,
		// 	label: strings.business.paymentMethods,
		// 	route: `${base}/payouts` as Href,
		// },
		{
			icon: <CircleHelp size={20} color={colors.mutedForeground} />,
			label: strings.business.helpCenter,
			route: `${base}/help` as Href,
		},
		// Mismo destino que desde el perfil del consumidor: el reporte lo
		// manda la persona, no el negocio, y por eso esta fila no queda atada
		// a `/business/${businessId}`.
		//
		// Abre la hoja EN ESTA PANTALLA y no navega: el `Drawer` se portaliza a
		// un host que vive adentro del layout de tabs, así que tiene que
		// montarla la pantalla que la ofrece. Antes emparejaba a
		// `/report-problem`, y esa ruta de raíz no tiene host por encima: la
		// hoja se portalizaba a la pantalla de tabs ya tapada y el usuario veía
		// una página vacía con el título del buzón.
		{
			icon: <Bug size={20} color={colors.mutedForeground} />,
			label: strings.bugReport.title,
			onPress: openReportProblem,
		},
	];
	return (
		<View
			style={[
				styles.settingsCard,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					borderRadius: radii.lg,
				},
			]}
		>
			{items.map((item, index) => (
				<View key={item.label}>
					<Button
						variant="ghost"
						onPress={() =>
							"route" in item ? router.push(item.route) : item.onPress()
						}
						style={({ pressed }) => [
							styles.settingsItem,
							pressed && styles.pressed,
						]}
					>
						<View style={styles.settingsIcon}>{item.icon}</View>
						<View style={styles.settingsLabel}>
							<AppText variant="bodyMedium" numberOfLines={1}>
								{item.label}
							</AppText>
						</View>
						<View style={styles.settingsChevron}>
							<ChevronRight size={18} color={colors.mutedForeground} />
						</View>
					</Button>
					{index < items.length - 1 ? (
						<View
							style={[styles.divider, { backgroundColor: colors.borderSolid }]}
						/>
					) : null}
				</View>
			))}
			{/* La hoja va en el árbol de ESTA pantalla, que es la que tiene el host
			    del portal montado y visible. Montada en una ruta de raíz no
	            aparecería nunca. */}
			{reportProblemSheet}
		</View>
	);
}

const styles = StyleSheet.create({
	settingsCard: { padding: 0, borderWidth: 1, overflow: "hidden" },
	settingsItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	settingsIcon: {
		width: 20,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	settingsLabel: { flex: 1, minWidth: 0 },
	settingsChevron: {
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	divider: { height: 1, width: "100%" },
	pressed: { opacity: 0.85 },
});
