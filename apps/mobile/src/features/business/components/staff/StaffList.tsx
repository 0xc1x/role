import { type Href, router } from "expo-router";
import { Users } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import type { BusinessLocation } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { EmptyState, ErrorState } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { useStaffMembers } from "@/src/features/business/hooks";
import { StaffMemberCard, StaffMemberCardSkeleton } from "./StaffMemberCard";

/**
 * La lista de accesos del negocio (§9.2).
 *
 * ─── POR QUÉ LA CONSULTA VIVE AQUÍ Y NO EN LA TARJETA ─────────────────────────
 *
 * Porque la lista tiene estados —cargando, fallando, vacía— y cada uno se
 * pinta distinto. Si la consulta viviera en la tarjeta, cada tarjeta tendría
 * su propio estado y la lista no podría pintar una sola vez lo que le pasa a
 * todas.
 *
 * ─── Y POR QUÉ LAS SUCURSALES LLEGAN POR PROP ─────────────────────────────────
 *
 * Porque el nombre de la sucursal —«Centro»— es lo que la tarjeta dice cuando
 * el negocio tiene una sola, y ese nombre lo trae `useBusinessLocations`: la
 * tarjeta no busca nada, la lista tampoco, y quien la pinta decide.
 */
export function StaffList({
	businessId,
	locations,
}: {
	businessId: string;
	/** Las sucursales del negocio, para leer el alcance de cada acceso. */
	locations: BusinessLocation[];
}) {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch } =
		useStaffMembers(businessId);

	if (isLoading) {
		return (
			<View style={styles.list}>
				{[0, 1].map((index) => (
					<StaffMemberCardSkeleton key={`staff-skeleton-${index}`} />
				))}
			</View>
		);
	}

	// Un 403 —una sesión vieja— no es «no hay nadie»: es un fallo, y se
	// reintenta.
	if (isError) {
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	}

	if (!data || data.length === 0) {
		return (
			<EmptyState
				icon={<Users size={28} color={colors.primary} />}
				title={strings.business.staff.emptyTitle}
				message={strings.business.staff.emptyBody}
				action={
					<Button
						// «Dar acceso» a secas no dice a QUIÉN se da el acceso:
						// el lector de pantalla necesita el objeto.
						accessibilityLabel={
							strings.business.staff.addAccessAccessibilityLabel
						}
						onPress={() =>
							router.push(`/business/${businessId}/staff/new` as Href)
						}
						style={{ marginTop: spacing.md }}
					>
						{strings.business.staff.addAccess}
					</Button>
				}
			/>
		);
	}

	return (
		<View style={styles.list}>
			{data.map((member) => (
				<StaffMemberCard
					key={member.id}
					member={member}
					locations={locations}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: spacing.md },
});
