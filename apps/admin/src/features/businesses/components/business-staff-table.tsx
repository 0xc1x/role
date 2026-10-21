import type {
	BusinessLocationDto,
	BusinessMemberDto,
} from "@0xc1x/role-commons";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	businessMemberRoleLabel,
	businessMemberStatusLabel,
} from "@/lib/labels";
import { useBusinessStaff } from "../queries/business-staff.queries";
import { useBusinessLocations } from "../queries/businesses.queries";
import { BusinessStaffRevokeDialog } from "./business-staff-revoke-dialog";

/**
 * El alcance del dueño: TODO el negocio.
 *
 * El dueño llega a todo con o sin filas de alcance (§5.1), así que su fila no
 * dice «Sin sucursales» —eso sería una mentira— sino esto.
 */
const OWNER_SCOPE = "Todo el negocio";

/** Un acceso sin filas de alcance no llega a ninguna sucursal. */
const NO_SCOPE = "Sin sucursales";

/**
 * El alcance de UN acceso, en palabras.
 *
 * ─── POR QUÉ EL DUEÑO NO APARECE EN LA LISTA DE SUCURSALES ───────────────────
 *
 * Porque su alcance no es una lista: es el negocio entero. Y por eso su fila
 * dice «Todo el negocio» y no los nombres de los puntos de retiro: la lista de
 * sucursales del dueño no sería su alcance, sería una foto de la casa.
 *
 * ─── Y POR QUÉ UN ID SIN SUCURSAL SE OMITE ────────────────────────────────────
 *
 * El alcance viene como ids y los nombres se resuelven con la lista de puntos
 * de retiro —la misma caché que usa la ficha—. Un id que no resuelve no tiene
 * nombre que mostrar, y un nombre inventado sería peor que un hueco: el
 * operador leería un negocio que no existe. Se omite, y por eso una fila puede
 * quedar sin alcance visible aunque la API diga que tiene.
 *
 * La lista de puntos de retiro NO se filtra por `is_active` (misma razón que en
 * la ficha): un acceso sobre un punto dado de baja sigue siendo un acceso, y
 * esconder el punto haría creer que el acceso no existe.
 *
 * ─── POR QUÉ MIENTRAS LOS NOMBRES LLEGAN HAY UN ESQUELETO ─────────────────────
 *
 * Porque el roster puede estar listo antes que la lista de puntos de retiro, y
 * un «—» en esa celda diría «este acceso no tiene alcance» cuando lo que pasa
 * es que todavía no se sabe. El esqueleto dice «viene»; el «—» se reserva para
 * el caso en que la lista YA llegó y el id no resuelve.
 *
 * Y si la lista de puntos de retiro FALLA, la celda queda en «—»: el roster
 * sigue siendo legible —el nombre, el rol y el estado no dependen de ella— y
 * un error de una lista secundaria no puede tapar la lectura del equipo.
 */
function ScopeCell({
	member,
	locations,
	isPending,
}: {
	member: BusinessMemberDto;
	locations: BusinessLocationDto[];
	isPending: boolean;
}) {
	if (member.role === "owner") return OWNER_SCOPE;
	if (member.business_location_ids.length === 0) return NO_SCOPE;
	if (isPending) return <Skeleton className="h-4 w-24" />;
	const names = member.business_location_ids
		.map((id) => locations.find((location) => location.id === id)?.name)
		.filter((name): name is string => Boolean(name));
	return names.join(", ") || "—";
}

/**
 * El equipo del negocio, en la ficha: QUIÉN tiene acceso, de sólo lectura.
 *
 * ─── POR QUÉ NO HAY ALTA NI EDICIÓN ───────────────────────────────────────────
 *
 * Porque el panel de la plataforma SUPERVISA: el alta y la edición de accesos
 * son del dueño y del gerente, y la API no le da esas rutas al admin. Un botón
 * que el servidor va a rechazar es una puerta que se abre para encontrar un
 * error, así que no existe. La tabla es de sólo lectura por construcción: no
 * hay fila de acciones.
 *
 * ─── POR QUÉ SÍ HAY UN CORTE ──────────────────────────────────────────────────
 *
 * Porque el corte de emergencia es de la plataforma: es la operación con la que
 * se corta un negocio que se está portando mal, y es la que deja al dueño
 * adentro. Por eso es la ÚNICA acción de la pantalla, y por eso pide
 * confirmación.
 *
 * ─── POR QUÉ EL ALIAS SE MUESTRA ──────────────────────────────────────────────
 *
 * Porque el alias es con lo que la persona entra: sin él, el operador no puede
 * saber a quién está viendo el acceso que va a cortar.
 */
export function BusinessStaffTable({
	businessId,
	businessName,
}: {
	businessId: string | null;
	businessName: string;
}) {
	const staff = useBusinessStaff(businessId);
	const locations = useBusinessLocations(businessId);
	const [revokeOpen, setRevokeOpen] = useState(false);

	const rows = staff.data ?? [];
	const locationRows = locations.data?.data ?? [];

	// Sin negocio no hay nada que supervisar: la consulta ni siquiera se
	// dispara (`enabled: false`) y la pantalla no muestra un estado de carga
	// eterno.
	if (!businessId) return null;

	if (staff.isPending) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (staff.isError) {
		return (
			<p className="text-destructive text-sm">
				{staff.error instanceof Error
					? staff.error.message
					: "No se pudieron cargar los accesos del equipo"}
			</p>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Sin accesos registrados para {businessName}.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-sm">
					{rows.length} {rows.length === 1 ? "acceso" : "accesos"}
				</p>
				<Button
					variant="destructive"
					onClick={() => setRevokeOpen(true)}
					// El nombre del botón dice de QUÉ negocio se trata: el lector
					// de pantalla no ve la fila de la tabla de al lado.
					aria-label={`Cortar todos los accesos de ${businessName}`}
				>
					Cortar todos los accesos
				</Button>
			</div>

			{staff.isFetching ? <Spinner /> : null}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Nombre</TableHead>
						<TableHead>Alias</TableHead>
						<TableHead>Rol</TableHead>
						<TableHead>Sucursales</TableHead>
						<TableHead>Estado</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((member) => (
						<TableRow key={member.id}>
							<TableCell className="font-medium">{member.label}</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{member.alias}
							</TableCell>
							<TableCell>{businessMemberRoleLabel(member.role)}</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								<ScopeCell
									member={member}
									locations={locationRows}
									isPending={locations.isPending}
								/>
							</TableCell>
							<TableCell>
								<Badge
									variant={member.status === "active" ? "default" : "secondary"}
								>
									{businessMemberStatusLabel(member.status)}
								</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<BusinessStaffRevokeDialog
				businessId={businessId}
				businessName={businessName}
				open={revokeOpen}
				onOpenChange={setRevokeOpen}
			/>
		</div>
	);
}
