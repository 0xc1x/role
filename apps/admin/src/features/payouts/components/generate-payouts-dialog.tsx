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
 * Confirmación de "Generar cortes". Generar cortes escribe filas nuevas en la
 * tabla de dinero: se confirma nombrando el efecto en vez de dispararlo con un
 * click. Vive fuera de la ruta para poder probarla sin el router.
 */
export function GeneratePayoutsDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Generar los cortes del período?</AlertDialogTitle>
					<AlertDialogDescription>
						Se creará un corte pendiente por cada negocio con órdenes liquidadas
						en el período actual, con el fee congelado por orden. Después hay
						que pagarlos uno a uno. Esta acción no se puede deshacer.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction disabled={isPending} onClick={onConfirm}>
						{isPending ? <Spinner /> : null} Generar cortes
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
