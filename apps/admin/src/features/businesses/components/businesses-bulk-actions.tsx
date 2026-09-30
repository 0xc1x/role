import type { BusinessDto, UpdateBusinessDto } from "@0xc1x/role-commons";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DataTableSelectionBar } from "@/components/data-table/selection";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { businessesApi } from "@/features/businesses/api/businesses.api";
import { businessesKeys } from "@/features/businesses/queries/businesses.keys";
import { useBulkAction } from "@/hooks/use-bulk-action";
import { formatApiError } from "@/lib/api/notify";
import type { BulkOutcome } from "@/lib/bulk-action";

/** Relleno cuando el operador no escribe motivo: el que ya usa `action-cell.tsx`. */
const DEFAULT_REJECTION_REASON = "No especificado";

/**
 * Aprobar y rechazar en lote la cola de verificación de negocios.
 *
 * POR QUÉ VIVE FUERA DE LA RUTA: son las reglas del lote —qué se puede
 * seleccionar, qué motivo se aplica, cómo se reporta el fallo parcial— y
 * ninguna depende del router. Igual que `GeneratePayoutsDialog`.
 *
 * POR QUÉ NO REUSA `useVerifyBusiness` POR FILA: ese hook avisa con un toast en
 * cada `onSuccess`, y 12 aprobaciones son 12 toasts que tapan el único dato que
 * importa (cuáles fallaron). Se llama a la MISMA api que el hook
 * (`businessesApi.update`, mismo endpoint y mismo `PATCH`) y se invalida la
 * lista una vez al final del lote, no 12 veces.
 */
export function BusinessesBulkActions({
	selectedRows,
	onClear,
}: {
	selectedRows: BusinessDto[];
	onClear: () => void;
}) {
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState("");
	const [outcome, setOutcome] = useState<BulkOutcome<BusinessDto> | null>(null);
	const queryClient = useQueryClient();
	const { run, isPending } = useBulkAction();

	const verify = async (
		rows: BusinessDto[],
		verification_status: "approved" | "rejected",
		rejection_reason?: string,
	) => {
		const result = await run(rows, (business) =>
			businessesApi.update(business.id, {
				verification_status,
				rejection_reason: rejection_reason ?? null,
			} as UpdateBusinessDto),
		);
		// `null` = el componente se desmontó o hubo otra corrida: el resultado ya
		// no tiene a quién avisarle.
		if (!result) return;
		setOutcome(result);
		toastBatchResult(result, verification_status);
		// Una sola invalidación para todo el lote: la lista ya no puede estar
		// cacheada con `staleTime` si la siguiente fila se actualizó hace un
		// segundo.
		void queryClient.invalidateQueries({ queryKey: businessesKeys.lists() });
		onClear();
	};

	const count = selectedRows.length;

	return (
		<>
			<DataTableSelectionBar count={count} onClear={onClear}>
				<Button
					size="sm"
					disabled={isPending}
					onClick={() => void verify(selectedRows, "approved")}
				>
					{isPending ? <Spinner /> : <Check />} Aprobar
					{count > 0 ? ` (${count})` : ""}
				</Button>
				<Button
					size="sm"
					variant="destructive"
					disabled={isPending}
					onClick={() => setRejecting(true)}
				>
					<X /> Rechazar
					{count > 0 ? ` (${count})` : ""}
				</Button>
			</DataTableSelectionBar>

			{/* MISMO patrón de confirmación que el rechazo de una fila en
			    `action-cell.tsx`: `AlertDialog` + motivo + acción destructiva. No
			    es `ConfirmDeleteDialog` porque su texto es de borrado ("Se ocultará
			    de la lista", botón "Eliminar") y aquí el efecto es rechazar. */}
			<AlertDialog open={rejecting} onOpenChange={setRejecting}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							¿Rechazar {count === 1 ? "1 negocio" : `${count} negocios`}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							Quedarán en estado rechazado y dejarán de ser visibles. El motivo
							se aplica a los {count} seleccionados de esta página.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Label htmlFor="businesses-bulk-rejection-reason">
						Motivo del rechazo
					</Label>
					<Textarea
						id="businesses-bulk-rejection-reason"
						placeholder="Motivo del rechazo"
						value={reason}
						disabled={isPending}
						onChange={(e) => setReason(e.target.value)}
					/>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isPending}
							onClick={() => {
								const rejectionReason = reason || DEFAULT_REJECTION_REASON;
								setRejecting(false);
								void verify(selectedRows, "rejected", rejectionReason);
							}}
						>
							{isPending ? <Spinner /> : null} Rechazar {count}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<BatchOutcomeDialog outcome={outcome} onClose={() => setOutcome(null)} />
		</>
	);
}

/**
 * "Algo falló" no es un resultado. Con 8 de 12 aprobados, el operador tiene que
 * poder ver cuáles 8, cuáles 4 y con qué `requestId` localizó soporte cada una.
 * El diálogo solo aparece cuando hay algo que detallar: si el lote salió limpio,
 * un toast basta.
 */
function BatchOutcomeDialog({
	outcome,
	onClose,
}: {
	outcome: BulkOutcome<BusinessDto> | null;
	onClose: () => void;
}) {
	const failed = outcome?.failed ?? [];
	const skipped = outcome?.skipped ?? [];
	if (!outcome || (failed.length === 0 && skipped.length === 0)) return null;

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Resultado del lote</DialogTitle>
					<DialogDescription>
						{outcome.succeeded.length} de{" "}
						{outcome.succeeded.length + failed.length + skipped.length} negocios
						se actualizaron. {failed.length} con error
						{skipped.length > 0 ? ` y ${skipped.length} sin intentar.` : "."}
					</DialogDescription>
				</DialogHeader>
				{skipped.length > 0 && (
					<p className="text-sm text-muted-foreground">
						Los negocios sin intentar no se modificaron: vuelve a seleccionarlos
						y reintenta.
					</p>
				)}
				<ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
					{failed.map((failure) => (
						<li
							key={failure.item.id}
							className="rounded-md border border-destructive/40 p-2"
						>
							<p className="font-medium">{failure.item.name}</p>
							{/* `formatApiError` ya concatena el `requestId` cuando la API
							    dio correlación: es el dato que soporte cruza con los logs. */}
							<p className="text-destructive">
								{formatApiError(
									failure.error,
									"No se pudo actualizar el negocio",
								)}
							</p>
						</li>
					))}
				</ul>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cerrar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function toastBatchResult(
	result: BulkOutcome<BusinessDto>,
	verification_status: "approved" | "rejected",
) {
	const verb = verification_status === "approved" ? "aprobados" : "rechazados";
	if (result.failed.length === 0 && result.skipped.length === 0) {
		toast.success(
			`${result.succeeded.length} ${result.succeeded.length === 1 ? "negocio" : "negocios"} ${verb}. Revisa el envío de la notificación por correo.`,
		);
		return;
	}
	toast.error(
		`${result.succeeded.length} ${verb}, ${result.failed.length} con error y ${result.skipped.length} sin intentar. Revisa el detalle del lote.`,
	);
}
