import type { BusinessLocationDto } from "@0xc1x/role-commons";
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

/**
 * Confirmación de "dar de baja" un punto de retiro.
 *
 * POR QUÉ NO `ConfirmDeleteDialog` (features/email): su descripción está fija en
 * el componente y no tiene dónde nombrar a qué fila pertenece la acción. Aquí el
 * riesgo real es que el operador de de baja el punto de retiro equivocado sin
 * tener delante el negocio al que pertenece, así que el diálogo nombra el negocio
 * y la fila (nombre + dirección) antes de pedir el clic.
 *
 * El verbo del botón es "Dar de baja" y no "Eliminar" porque eso es lo que hace
 * la API: `removeLocation` escribe `is_active = false` y conserva la fila. Un
 * "Eliminar" sería una promesa que el backend no cumple.
 *
 * El fallo se avisa con `notifyMutationError` (que es `formatApiError`), el mismo
 * camino que usa el resto del panel para que el operador reciba el `requestId`.
 */
export function BusinessLocationDeleteDialog({
	businessName,
	location,
	isPending,
	onOpenChange,
	onConfirm,
}: {
	businessName: string;
	location: BusinessLocationDto;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => Promise<unknown>;
}) {
	return (
		<AlertDialog open onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Dar de baja el punto de retiro?</AlertDialogTitle>
					<AlertDialogDescription>
						<span className="font-medium text-foreground">{location.name}</span>{" "}
						({location.address}) dejará de aparecer para los clientes de{" "}
						<span className="font-medium text-foreground">{businessName}</span>.
						El registro se conserva: podés reactivarlo editando el punto de
						retiro.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={isPending}
						onClick={async () => {
							try {
								await onConfirm();
								onOpenChange(false);
							} catch (error) {
								// El `requestId` que devuelve la API es lo único que
								// correlaciona este fallo con el log del servidor.
								notifyMutationError(error);
							}
						}}
					>
						{isPending ? <Spinner /> : null} Dar de baja
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
