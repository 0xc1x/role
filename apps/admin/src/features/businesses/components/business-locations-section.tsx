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

			{locations.isPending ? (
				<div className="space-y-2">
					{[1, 2, 3].map((n) => (
						<Skeleton key={n} className="h-10 w-full" />
					))}
				</div>
			) : null}

			{locations.isError ? (
				<p className="text-destructive text-sm">
					{locations.error instanceof Error
						? locations.error.message
						: "No se pudieron cargar los puntos de retiro"}
				</p>
			) : null}

			{!locations.isPending && !locations.isError && rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Sin puntos de retiro registrados para {businessName}.
				</p>
			) : null}

			{rows.length > 0 ? (
				<>
					{locations.isFetching ? <Spinner /> : null}
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
										<Badge
											variant={location.is_active ? "default" : "secondary"}
										>
											{location.is_active ? "Activo" : "Inactivo"}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => setEditing(location)}
										>
											<Pencil className="h-4 w-4" />
											<span className="sr-only">
												Editar punto de retiro {location.name}
											</span>
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											disabled={!location.is_active || deleteMutation.isPending}
											onClick={() => setDeleting(location)}
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
				</>
			) : null}

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
