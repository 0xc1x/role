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
 * Confirmación de "volver a mostrar la reseña".
 *
 * NO reusa `ConfirmDeleteDialog` por la misma razón que el diálogo de ocultar:
 * acá no se borra nada, y esta acción es la que REVIERTE un borrado. Un copy de
 * "no se puede deshacer" sobre la operación que deshace sería el doble error.
 *
 * El copy dice explícitamente que el motivo registrado se conserva: es el
 * registro de apelación y el operador tiene que saberlo ANTES de confirmar, no
 * descubrirlo después cuando el negocio pregunte por qué estuvo oculta.
 */
export function UnhideReviewDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
	authorName,
	hiddenReason,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
	authorName: string | null;
	hiddenReason: string | null;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Volver a mostrar esta reseña?</AlertDialogTitle>
					<AlertDialogDescription>
						La reseña de{" "}
						{authorName ? <b>{authorName}</b> : "una persona sin nombre"}{" "}
						volverá a aparecer en la página del negocio y volverá a contar en su
						promedio.{" "}
						{hiddenReason ? (
							<>
								El motivo por el que se ocultó se <b>conserva</b>: «
								{hiddenReason}».
							</>
						) : (
							<>No hay ningún motivo registrado para esta reseña.</>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={onConfirm}>
						{isPending ? <Spinner /> : null} Volver a mostrar
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
