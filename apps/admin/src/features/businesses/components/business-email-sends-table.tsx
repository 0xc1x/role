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
import { StatusBadge } from "@/features/email-sends/tables/cells/status-badge";
import { formatBusinessDateTime } from "@/lib/dates";

/**
 * Historial de avisos transaccionales de un negocio (read-only), con la query y
 * sus estados de carga/error/vacío. Lo consumen el drawer de notificaciones y la
 * ficha del negocio: aprobar sin ver si el aviso salió es aprobar a ciegas.
 *
 * `error_message` NO es un motivo legible, y la columna lo dice sin prometer una
 * redacción que no ocurrió para todas las filas: en los envíos fallidos DESDE
 * a7fac68 el valor es la huella acotada del fallo (`TypeError`,
 * `NotFoundException:E42`) en vez del texto crudo de Resend; en las filas
 * anteriores a ese commit no hay backfill y el valor sigue siendo el texto
 * crudo que el propio commit definió como potencialmente sensible. Por eso la
 * etiqueta es "Detalle del error del servidor": describe el origen del dato sin
 * afirmar una garantía que las filas históricas no tienen. La redacción de esas
 * filas es una migración escrita y NO aplicada
 * (`supabase/migrations/20260926041000_email_sends_redact_legacy_error_message.sql`).
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
						<TableHead>Detalle del error del servidor</TableHead>
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
							<TableCell className="max-w-[16rem] text-muted-foreground font-mono text-sm">
								{send.error_message ?? "—"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
								{formatBusinessDateTime(send.created_at)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
