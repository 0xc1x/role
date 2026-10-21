import { type Href, router } from "expo-router";
import type { BusinessLocation, BusinessMemberDto } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import { AppText, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { formatDateTime } from "@/src/core/utils/formatters";

/**
 * El nombre del rol, en el idioma de la persona (§9.2).
 *
 * El vocabulario es el de `business_members` —`owner`, `manager`, `staff`— y el
 * orden es el de autoridad: el dueño administra el negocio entero, el gerente
 * administra al equipo de sus sucursales y el empleado retira ofertas.
 */
const ROLE_LABELS: Record<BusinessMemberDto["role"], string> = {
	owner: strings.business.staff.roleOwner,
	manager: strings.business.staff.roleManager,
	staff: strings.business.staff.roleStaff,
};

/**
 * El alcance del acceso, en una línea.
 *
 * ─── POR QUÉ EL NOMBRE CUANDO HAY UNA SOLA SUCURSAL ───────────────────────────
 *
 * Porque «Centro» dice más que «1 sucursal»: cuando el acceso alcanza una sola,
 * el número es ruido y el nombre es el dato.
 *
 * ─── Y POR QUÉ EL ALCANCE VACÍO NO ES «TODAS LAS SUCURSALES» ──────────────────
 *
 * Porque §5.1 dice que «sin filas de alcance» no es «todo»: un gerente o un
 * empleado sin filas NO ALCANZA ningún recurso —y lo que alcanza es su propia
 * fila de membresía—. Sólo el dueño llega al negocio entero, con o sin filas,
 * porque su rol se lo da. Decirle «todas las sucursales» a un acceso que no
 * llega a ninguna sería mentirle sobre lo que ese acceso puede hacer.
 *
 * ─── Y POR QUÉ EL CONTEO TIENE SU FORMA EN SINGULAR ───────────────────────────
 *
 * Porque «1 sucursales» no es español. Y una sola fila que ya no resuelve —
 * la sucursal se borró y el id quedó viejo— se cuenta igual: el nombre no se
 * inventa, pero el alcance sigue siendo de una.
 */
function staffLocationsLabel(
	member: Pick<BusinessMemberDto, "role" | "business_location_ids">,
	locations: Pick<BusinessLocation, "id" | "name">[],
): string {
	// El dueño alcanza el negocio entero, con o sin filas de alcance (§5.1).
	if (member.role === "owner") return strings.business.staff.allLocations;

	const ids = member.business_location_ids;
	// Sin filas no se alcanza ningún recurso (§5.1): el alcance vacío no es
	// «todo», es «nada».
	if (ids.length === 0) return strings.business.staff.noLocations;

	if (ids.length === 1) {
		// Una sola fila: se dice el NOMBRE de esa sucursal. Y si su id ya no
		// resuelve —la sucursal se borró y la fila quedó vieja—, se dice el
		// número: el nombre no se inventa.
		const only = locations.find((location) => location.id === ids[0]);
		return only ? only.name : strings.business.staff.locationsOne;
	}

	return strings.business.staff.locations.replace("{n}", String(ids.length));
}

/**
 * La política de sesión del acceso, en una línea.
 *
 * El `0` NO es «venció ahora»: es el modo sin expiración —el de «equipo
 * propio»—, que la base guarda como TTL cero (ver `business-member.schema.ts`).
 */
function staffSessionLabel(ttlHours: number): string {
	if (ttlHours === 0) return strings.business.staff.sessionNever;
	return strings.business.staff.sessionHours.replace("{n}", String(ttlHours));
}

/**
 * Un acceso del equipo: quién es, qué alcanza, cómo entra y si está en pie.
 *
 * ─── POR QUÉ EL BOTÓN DE EDITAR NO SE OFRECE AL DUEÑO ────────────────────────
 *
 * Porque la propiedad del negocio no se cambia editando un acceso: se
 * TRANSFIERE, y el API rechaza (`R0002`) un cambio de rol sobre el dueño. Un
 * botón que lleva a una pantalla que el servidor va a rechazar es una puerta
 * que se abre para encontrar un error.
 *
 * ─── Y POR QUÉ LA TARJETA SÍ DICE QUÉ SE PUEDE HACER ─────────────────────────
 *
 * Porque la lista es el lugar donde se ve QUIÉN es cada acceso, y ahí es donde
 * se decide qué se le hace: la tarjeta dice qué es un acceso y ofrece la
 * entrada a lo que se le puede cambiar. Las demás acciones —rotar el PIN,
 * pausar, reactivar, dar de baja— llegan en las Tasks 10 y 13 sobre esta misma
 * tarjeta.
 */
export function StaffMemberCard({
	businessId,
	member,
	locations,
}: {
	businessId: string;
	member: BusinessMemberDto;
	/**
	 * Las sucursales del negocio. La tarjeta NO las busca: las trae quien la
	 * pinta, para que pintarla no sea una consulta más.
	 */
	locations: BusinessLocation[];
}) {
	const { colors } = useTheme();
	const isPaused = member.status === "disabled";
	const isOwner = member.role === "owner";

	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<View style={styles.header}>
				<View style={styles.identity}>
					<AppText
						variant="h4"
						weight="bold"
						numberOfLines={1}
						style={styles.flex1}
					>
						{member.label}
					</AppText>
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{ color: colors.mutedForeground }}
					>
						{member.alias}
					</AppText>
				</View>
				<StatusBadge
					label={
						isPaused
							? strings.business.staff.statusPaused
							: strings.business.staff.statusActive
					}
					tone={isPaused ? "neutral" : "success"}
				/>
			</View>

			<View style={styles.metaRow}>
				<AppText variant="bodySmall" weight="semiBold">
					{ROLE_LABELS[member.role]}
				</AppText>
				<AppText
					variant="bodySmall"
					numberOfLines={1}
					style={[
						styles.flex1,
						{ color: colors.mutedForeground, textAlign: "right" },
					]}
				>
					{staffLocationsLabel(member, locations)}
				</AppText>
			</View>

			<View style={styles.metaRow}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.staff.sessionPolicy}
				</AppText>
				<AppText variant="bodySmall" weight="semiBold">
					{staffSessionLabel(member.session_ttl_hours)}
				</AppText>
			</View>

			<View style={styles.metaRow}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.staff.lastLogin}
				</AppText>
				<AppText variant="bodySmall" weight="semiBold">
					{member.last_authenticated_at
						? formatDateTime(member.last_authenticated_at)
						: strings.business.staff.neverLoggedIn}
				</AppText>
			</View>

			{isOwner ? null : (
				<Button
					variant="outline"
					// El botón dice a QUIÉN se edita: en una lista de accesos,
					// un «Editar» a secas es un botón que no dice de qué.
					accessibilityLabel={strings.business.staff.editAccessibilityLabel.replace(
						"{name}",
						member.label,
					)}
					onPress={() =>
						router.push(
							`/business/${businessId}/staff/${member.id}/edit` as Href,
						)
					}
					style={styles.editButton}
				>
					{strings.business.staff.edit}
				</Button>
			)}
		</View>
	);
}

/**
 * Esqueleto con las dimensiones de la tarjeta real.
 *
 * Mismo patrón que `LocationCardSkeleton`: la lista no cambia de alto cuando
 * llegan los datos.
 */
export function StaffMemberCardSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<View style={styles.header}>
				<View style={styles.identity}>
					<Skeleton style={styles.skeletonTitle} />
					<Skeleton style={styles.skeletonAlias} />
				</View>
				<Skeleton style={styles.skeletonBadge} />
			</View>
			<View style={styles.metaRow}>
				<Skeleton style={styles.skeletonLine} />
			</View>
			<View style={styles.metaRow}>
				<Skeleton style={styles.skeletonLineShort} />
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.md,
		gap: spacing.sm,
	},
	header: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	identity: { flex: 1, gap: spacing.xxs },
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	flex1: { flex: 1 },
	skeletonTitle: { height: 18, width: "55%", borderRadius: radii.sm },
	skeletonAlias: { height: 12, width: "40%", borderRadius: radii.sm },
	skeletonBadge: { height: 22, width: 72, borderRadius: radii.pill },
	skeletonLine: { height: 12, width: "70%", borderRadius: radii.sm },
	skeletonLineShort: { height: 12, width: "45%", borderRadius: radii.sm },
	editButton: { marginTop: spacing.sm },
});
