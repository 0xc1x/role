import type { BugTriageState } from "@0xc1x/role-commons";
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
import { Spinner } from "@/components/ui/spinner";
import { bugTriageStateLabel } from "@/lib/labels";

/**
 * Confirmación de los dos estados que se pierden de vista.
 *
 * `DUPLICADO` y `DESCARTADO` no borran nada — el reporte sigue en la base y se
 * puede volver a triagear desde acá— pero sí sacan el reporte de la cola de los
 * que hay que mirar, y eso no tiene vuelta atrás visible para quien no sepa que
 * el cambio es reversible. Por eso el diálogo dice las dos cosas: qué pasa, y que
 * se puede deshacer.
 *
 * NO reusa `ConfirmDeleteDialog`: su copy habla de borrado y de algo que no se
 * puede deshacer, y acá el panel estaría mintiendo sobre la consecuencia.
 */
export function SetTriageStateDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
	state,
	resumen,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
	state: BugTriageState;
	resumen: string | null;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						¿Marcar el reporte como {bugTriageStateLabel(state).toLowerCase()}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						El reporte «{resumen ?? "sin resumen"}» va a salir de la cola de los
						que hay que mirar. No se borra: el texto y las capturas se
						conservan, y se puede volver a cambiar el estado desde el mismo
						lugar.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={onConfirm}>
						{isPending ? <Spinner /> : null} {bugTriageStateLabel(state)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
