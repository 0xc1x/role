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
import { notifyMutationError } from "@/lib/api/notify";

export function ConfirmDeleteDialog(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	onRemove: () => Promise<unknown>;
	busy: boolean;
}) {
	return (
		<AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.title}</AlertDialogTitle>
					<AlertDialogDescription>
						Se ocultará de la lista pero se conservan sus métricas e historial.
						Esta acción no se puede deshacer.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						onClick={async () => {
							try {
								await props.onRemove();
								props.onOpenChange(false);
							} catch (err) {
								notifyMutationError(err);
							}
						}}
						disabled={props.busy}
					>
						{props.busy ? <Spinner /> : null} Eliminar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
