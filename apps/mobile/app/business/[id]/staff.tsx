import { type Href, router, useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { Screen, ScreenHeader } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { useStaffSessionStamp } from "@/src/features/auth/presentation/use-staff-session-stamp";
import { StaffList } from "@/src/features/business/components/staff/StaffList";
import { useBusinessLocations } from "@/src/features/business/hooks";

/**
 * La pantalla del equipo: los accesos del negocio (§9.2).
 *
 * ─── POR QUÉ SELLA LA SESIÓN AL ABRIRSE ───────────────────────────────────────
 *
 * Porque el sello del login sella SIN negocio cuando la persona tiene una sola
 * membresía, y con dos o más no sella nada (§5.2). Quien abre esta pantalla
 * ya sabe qué negocio está usando, así que el sello se repite aquí con el
 * negocio en el cuerpo: es lo que deja la membresía sellada de verdad.
 */
export default function BusinessStaffScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";

	useStaffSessionStamp(businessId);

	// Las sucursales las trae quien pinta: la tarjeta dice el alcance de cada
	// acceso y, con una sola sucursal, dice su nombre.
	const { data: locations } = useBusinessLocations(businessId);

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader
				title={strings.business.staff.title}
				fallback={`/business/${businessId}`}
			/>
			<View style={styles.actions}>
				<Button
					size="sm"
					icon={<Plus size={16} color={colors.primaryForeground} />}
					// «Dar acceso» a secas no dice a QUIÉN se da el acceso: el
					// lector de pantalla necesita el objeto.
					accessibilityLabel={
						strings.business.staff.addAccessAccessibilityLabel
					}
					onPress={() =>
						router.push(`/business/${businessId}/staff/new` as Href)
					}
				>
					{strings.business.staff.addAccess}
				</Button>
			</View>
			<StaffList businessId={businessId} locations={locations ?? []} />
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, paddingBottom: spacing.xxl },
	actions: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: spacing.lg,
		marginBottom: spacing.lg,
	},
});
