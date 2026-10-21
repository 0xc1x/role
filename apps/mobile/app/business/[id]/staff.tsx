import { type Href, router, useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { Screen, ScreenHeader } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { useAuthStore } from "@/src/features/auth/store";
import { useStaffSessionStamp } from "@/src/features/auth/presentation/use-staff-session-stamp";
import { RevokeAllCard } from "@/src/features/business/components/staff/RevokeAllCard";
import { StaffList } from "@/src/features/business/components/staff/StaffList";
import {
	useBusinessLocations,
	useBusinesses,
} from "@/src/features/business/hooks";

/**
 * La pantalla del equipo: los accesos del negocio (§9.2).
 *
 * ─── POR QUÉ SELLA LA SESIÓN AL ABRIRSE ───────────────────────────────────────
 *
 * Porque el sello del login sella SIN negocio cuando la persona tiene una sola
 * membresía, y con dos o más no sella nada (§5.2). Quien abre esta pantalla
 * ya sabe qué negocio está usando, así que el sello se repite aquí con el
 * negocio en el cuerpo: es lo que deja la membresía sellada de verdad.
 *
 * ─── Y POR QUÉ EL ROL SE RESUELVE AQUÍ Y NO VIENE EN LA URL ──────────────────
 *
 * Porque el rol NO es un dato de la ruta: es el que la persona tiene en ESTE
 * negocio, y por eso se busca en los negocios que opera —`useBusinesses`— y se
 * compara con el id de la ruta. Pasarlo por la URL dejaría que la URL mintiera
 * sobre el rol, y el rol decide si se ofrece el corte de emergencia. La
 * puerta de verdad, de todas formas, la tiene el API: esto es UX.
 */
export default function BusinessStaffScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";

	useStaffSessionStamp(businessId);

	// El rol de quien mira en este negocio: sin él no se sabe si el corte de
	// emergencia se ofrece (un empleado no lo ve), ni si la hoja de acciones
	// ofrece la transferencia de la propiedad (sólo el dueño la ofrece).
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const role = businesses?.find((business) => business.id === businessId)?.role;

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
			{role ? <RevokeAllCard businessId={businessId} role={role} /> : null}
			<StaffList
				businessId={businessId}
				locations={locations ?? []}
				actorRole={role}
			/>
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
