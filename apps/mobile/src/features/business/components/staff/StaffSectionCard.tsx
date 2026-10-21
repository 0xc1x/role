import { type Href, router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import type { BusinessMemberRole } from "@/src/features/business/domain/business";
import { meetsMinRole } from "@/src/features/business/domain/panel-role";
import { useStaffMembers } from "@/src/features/business/hooks";

/**
 * La tarjeta de la sección «Equipo y accesos» del panel (§9.3).
 *
 * ─── POR QUÉ EL MÍNIMO ESTÁ DECLARADO AQUÍ ────────────────────────────────────
 *
 * Porque el mínimo es lo que dice el §9.3 —el equipo se administra desde el
 * dueño y el gerente— y porque una sección que no declara su mínimo es una
 * sección que se le enseña a cualquiera. El filtro es de UI, no una barra: RLS
 * sigue siendo la frontera de datos.
 *
 * ─── POR QUÉ UN FALLO NO ROMPE EL PANEL ───────────────────────────────────────
 *
 * Porque la lista de accesos se lee del API y el API puede negarla —una
 * sesión vieja, un permiso que ya no está—. Eso NO puede dejar el panel sin
 * su sección: el título y el botón se pintan igual, y lo que no se puede
 * leer es lo que no se cuenta. Un panel a medio pintar es peor que un panel
 * con un número menos.
 */
export function StaffSectionCard({
	businessId,
	role,
}: {
	businessId: string;
	role: BusinessMemberRole;
}) {
	const { colors } = useTheme();
	const visible = meetsMinRole(role, "manager");
	// Sin sección no hay consulta: un cajero no puede leer la lista y no tiene
	// por qué pedirla. La consulta sin negocio queda apagada.
	const { data: members } = useStaffMembers(visible ? businessId : "");

	if (!visible) return null;

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					borderRadius: radii.lg,
				},
			]}
		>
			<View style={styles.body}>
				<View style={styles.identity}>
					<AppText variant="h4" weight="bold">
						{strings.business.staff.sectionTitle}
					</AppText>
					{members ? (
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{strings.business.staff.sectionSubtitle.replace(
								"{count}",
								String(members.length),
							)}
						</AppText>
					) : null}
				</View>
				<Button
					size="sm"
					onPress={() => router.push(`/business/${businessId}/staff` as Href)}
				>
					{strings.business.staff.manage}
				</Button>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		marginTop: spacing.xl,
		borderWidth: 1,
	},
	body: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.md,
		padding: spacing.lg,
	},
	identity: { flex: 1, gap: spacing.xxs },
});
