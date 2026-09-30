import type { BusinessLocationDto } from "@0xc1x/role-commons";
import { Pencil, Trash2 } from "lucide-react";
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
	useBusinessLocations,
	useDeleteBusinessLocation,
} from "../queries/businesses.queries";
import { BusinessLocationCreateDrawer } from "./business-locations-create-drawer";
import { BusinessLocationDeleteDialog } from "./business-locations-delete-dialog";
import { BusinessLocationEditDrawer } from "./business-locations-edit-drawer";

/**
 * Filas de los puntos de retiro.
 *
 * Su propio componente porque tiene identidad propia —el conjunto de puntos de
 * retiro de un negocio, con sus acciones de fila— y porque las celdas se
 * decisionan por fila (sede, estado, editabilidad): mezcladas con el estado de
 * carga de la sección, el `return` del componente tenía que leer las dos cosas a
 * la vez para decir qué renderizar.
 */
function LocationsTable({
	rows,
	isDeleting,
	onEdit,
	onDelete,
}: {
	rows: BusinessLocationDto[];
	isDeleting: boolean;
	onEdit: (location: BusinessLocationDto) => void;
	onDelete: (location: BusinessLocationDto) => void;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nombre</TableHead>
					<TableHead>Dirección</TableHead>
					<TableHead>Coordenadas</TableHead>
					<TableHead>Zona</TableHead>
					<TableHead>Estado</TableHead>
					<TableHead className="text-right">Acciones</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((location) => (
					<TableRow key={location.id}>
						<TableCell className="font-medium">
							{location.name}
							{location.is_headquarter ? (
								<Badge variant="secondary" className="ml-2">
									Sede
								</Badge>
							) : null}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{location.address}
						</TableCell>
						<TableCell className="text-muted-foreground font-mono text-sm whitespace-nowrap">
							{location.latitude}, {location.longitude}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{location.zone ?? "—"}
						</TableCell>
						<TableCell>
							<Badge variant={location.is_active ? "default" : "secondary"}>
								{location.is_active ? "Activo" : "Inactivo"}
							</Badge>
						</TableCell>
						<TableCell className="text-right">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => onEdit(location)}
							>
								<Pencil className="h-4 w-4" />
								<span className="sr-only">
									Editar punto de retiro {location.name}
								</span>
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={!location.is_active || isDeleting}
								onClick={() => onDelete(location)}
							>
								<Trash2 className="h-4 w-4" />
								<span className="sr-only">
									Eliminar punto de retiro {location.name}
								</span>
							</Button>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

/**
 * El listado en el estado en que la query lo dejó: cargando, con error, vacío o
 * con filas.
 *
 * Las cuatro ramas son una sola decisión —"qué muestra la lista"— y cada una
 * excluye a las otras por una regla distinta (pending, error, sin filas). Su
 * propio componente porque es la rama condicional del `return` de la sección, y
 * porque un `return` que tiene que resolver las cuatro antes de poder pintar una
 * fila se lee peor que la decisión que toma.
 */
function LocationsList({
	rows,
	isPending,
	isError,
	error,
	isFetching,
	isDeleting,
	businessName,
	onEdit,
	onDelete,
}: {
	rows: BusinessLocationDto[];
	isPending: boolean;
	isError: boolean;
	error: unknown;
	isFetching: boolean;
	isDeleting: boolean;
	businessName: string;
	onEdit: (location: BusinessLocationDto) => void;
	onDelete: (location: BusinessLocationDto) => void;
}) {
	if (isPending) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<p className="text-destructive text-sm">
				{error instanceof Error
					? error.message
					: "No se pudieron cargar los puntos de retiro"}
			</p>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Sin puntos de retiro registrados para {businessName}.
			</p>
		);
	}

	return (
		<>
			{isFetching ? <Spinner /> : null}
			<LocationsTable
				rows={rows}
				isDeleting={isDeleting}
				onEdit={onEdit}
				onDelete={onDelete}
			/>
		</>
	);
}

/**
 * Puntos de retiro del negocio, dentro de la ficha.
 *
 * NO se filtran por `is_active`: el `DELETE` de la API desactiva en vez de borrar,
 * así que la fila tiene que seguir visible — con su estado — para que el operador
 * vea que el punto sigue ahí y pueda reactivarlo editándolo. Escondidas, el
 * borrado parecería haber funcionado y el reactivate sería imposible desde el panel.
 */
export function BusinessLocationsSection({
	businessId,
	businessName,
	enabled,
}: {
	businessId: string;
	businessName: string;
	/** El drawer cerrado no consulta: la lista se lee al abrir la ficha. */
	enabled: boolean;
}) {
	const locations = useBusinessLocations(enabled ? businessId : null);
	const deleteMutation = useDeleteBusinessLocation(businessId);
	const [deleting, setDeleting] = useState<BusinessLocationDto | null>(null);
	const [editing, setEditing] = useState<BusinessLocationDto | null>(null);

	const rows = locations.data?.data ?? [];

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-sm">
					{locations.data
						? `${locations.data.meta.total} ${
								locations.data.meta.total === 1
									? "punto de retiro"
									: "puntos de retiro"
							}`
						: "Puntos de retiro"}
				</p>
				<BusinessLocationCreateDrawer
					businessId={businessId}
					businessName={businessName}
				/>
			</div>

			<LocationsList
				rows={rows}
				isPending={locations.isPending}
				isError={locations.isError}
				error={locations.error}
				isFetching={locations.isFetching}
				isDeleting={deleteMutation.isPending}
				businessName={businessName}
				onEdit={setEditing}
				onDelete={setDeleting}
			/>

			{editing ? (
				<BusinessLocationEditDrawer
					businessId={businessId}
					businessName={businessName}
					location={editing}
					isOpen
					onClose={() => setEditing(null)}
				/>
			) : null}

			{deleting ? (
				<BusinessLocationDeleteDialog
					businessName={businessName}
					location={deleting}
					isPending={deleteMutation.isPending}
					onOpenChange={(open) => !open && setDeleting(null)}
					onConfirm={async () => {
						await deleteMutation.mutateAsync(deleting.id);
						setDeleting(null);
					}}
				/>
			) : null}
		</div>
	);
}
