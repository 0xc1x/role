import type { BusinessLocation, BusinessMemberDto } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

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
 * Porque «Centro» dice más que «1 sucursal»: cuando el negocio tiene una sola,
 * el número es ruido y el nombre es el dato.
 *
 * ─── Y POR QUÉ «TODAS LAS SUCURSALES» CUANDO EL ALCANCE ESTÁ VACÍO ───────────
 *
 * Porque un alcance vacío no es una ausencia: es el acceso que alcanza todas
 * las sucursales del negocio (§4.1). Decirlo es lo contrario de inventar un
 * cero.
 *
 * ─── Y POR QUÉ EL CONTEO TIENE SU FORMA EN SINGULAR ───────────────────────────
 *
 * Porque «1 sucursales» no es español: el acceso con un solo alcance es un
 * caso de verdad —el negocio con varias sucursales y un empleado en una—.
 */
function staffLocationsLabel(
	member: Pick<BusinessMemberDto, "business_location_ids">,
	locations: Pick<BusinessLocation, "name">[],
): string {
	if (locations.length === 1) return locations[0].name;
	const count = member.business_location_ids.length;
	if (count === 0) return strings.business.staff.allLocations;
	if (count === 1) return strings.business.staff.locationsOne;
	return strings.business.staff.locations.replace("{n}", String(count));
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
 * ─── POR QUÉ NO HAY ACCIONES TODAVÍA ──────────────────────────────────────────
 *
 * Porque las acciones sobre un acceso (cambiar el rol, el alias o el alcance,
 * rotar el PIN, pausar, reactivar y dar de baja) llegan en las Tasks 9, 10 y
 * 13, y se montan EN LA PANTALLA: la tarjeta dice qué es un acceso y el menú
 * dice qué se le puede hacer. Una tarjeta con acciones a medias sería media
 * puerta.
 */
export function StaffMemberCard({
	member,
	locations,
}: {
	member: BusinessMemberDto;
	/**
	 * Las sucursales del negocio. La tarjeta NO las busca: las trae quien la
	 * pinta, para que pintarla no sea una consulta más.
	 */
	locations: BusinessLocation[];
}) {
	const { colors } = useTheme();
	const isPaused = member.status === "disabled";

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
});
