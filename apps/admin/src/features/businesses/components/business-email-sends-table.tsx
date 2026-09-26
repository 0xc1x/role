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
import { useBusinessEmailSends } from "@/features/businesses/queries/businesses.queries";
import { StatusBadge } from "@/features/email-sends/tables/email-sends.columns";

/**
 * Historial de avisos transaccionales de un negocio (read-only), con la query y
 * sus estados de carga/error/vacío. Lo consumen el drawer de notificaciones y la
 * ficha del negocio: aprobar sin ver si el aviso salió es aprobar a ciegas.
 */
export function BusinessEmailSendsTable({
	businessId,
	businessName,
}: {
	businessId: string | null;
	businessName: string;
}) {
	const sends = useBusinessEmailSends(businessId);
	const rows = sends.data ?? [];

	if (sends.isPending) {
		return (
			<div className="space-y-2">
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-10 w-full" />
				))}
			</div>
		);
	}

	if (sends.isError) {
		return (
			<p className="text-destructive text-sm">
				{sends.error instanceof Error
					? sends.error.message
					: "No se pudieron cargar las notificaciones"}
			</p>
		);
	}

	if (rows.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Sin notificaciones por correo para {businessName}.
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{sends.isFetching ? <Spinner /> : null}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Destinatario</TableHead>
						<TableHead>Plantilla</TableHead>
						<TableHead>Estado</TableHead>
						<TableHead>Detalle</TableHead>
						<TableHead>Creado</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((send) => (
						<TableRow key={send.id}>
							<TableCell className="font-medium">{send.email}</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{send.template_name}
							</TableCell>
							<TableCell>
								<StatusBadge status={send.status} />
							</TableCell>
							<TableCell className="max-w-[16rem] text-sm">
								{send.error_message ?? "—"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
								{new Date(send.created_at).toLocaleString("es-EC")}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
