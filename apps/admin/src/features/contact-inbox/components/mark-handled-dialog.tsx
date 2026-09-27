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

/**
 * Confirmación de "marcar como atendido".
 *
 * NO reusa `ConfirmDeleteDialog`: su copy habla de borrado y de algo que no se
 * puede deshacer, y acá no se borra nada. Además esta acción tiene una
 * consecuencia que el operador tiene que ver antes de aceptar: cambia el estado
 * de la fila, y con el copy de "eliminar" el panel estaría mintiendo sobre lo
 * que va a pasar. El mensaje nombra a quién pertenece el mensaje para que un
 * click a ciegas no cierre el lead equivocado.
 */
export function MarkHandledDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
	nombre,
	email,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
	nombre: string | null;
	email: string | null;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Marcar el mensaje como atendido?</AlertDialogTitle>
					<AlertDialogDescription>
						Se marcará como atendido el mensaje de{" "}
						{nombre ? <b>{nombre}</b> : "una persona sin nombre"} en{" "}
						{email ?? "un correo sin registrar"}. El mensaje no se borra ni se
						contesta: solo cambia su estado para que deje de aparecer entre los
						pendientes.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={onConfirm}>
						{isPending ? <Spinner /> : null} Marcar como atendido
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
