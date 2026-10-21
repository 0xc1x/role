import type { RevokeBusinessAccessResponseDto } from "@0xc1x/role-commons";
import { useRef } from "react";
import { toast } from "sonner";
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
import { useRevokeBusinessAccess } from "../queries/business-staff.queries";

/**
 * El corte de emergencia, desde el panel de administración.
 *
 * ─── POR QUÉ EL TÍTULO Y EL BOTÓN NO SON LO MISMO ─────────────────────────────
 *
 * El título pregunta («¿Cortar todos los accesos?») y el botón afirma («Cortar
 * los accesos»). Con el mismo texto, el botón de confirmación repite la
 * pregunta y el operador tiene que volver a leerla para saber si está
 * confirmando o cancelando.
 *
 * ─── POR QUÉ EL DIÁLOGO DICE LO QUE NO PASA ───────────────────────────────────
 *
 * El corte se lleva las sesiones abiertas —una tablet con la app abierta se
 * queda afuera al instante— y el dueño NO se corta. Las dos cosas se dicen
 * antes del clic: la primera sorprende, la segunda es la garantía de que el
 * negocio no se queda sin dueño.
 *
 * ─── POR QUÉ EL FALLO NO CIERRA EL DIÁLOGO ────────────────────────────────────
 *
 * El corte no se aplicó, así que la pantalla tiene que seguir pidiendo la
 * decisión. El aviso es el de `notifyMutationError`, que lleva el `requestId`:
 * sin ese identificador el operador no puede cruzar el fallo con el log del
 * servidor.
 */
export function BusinessStaffRevokeDialog({
	businessId,
	businessName,
	open,
	onOpenChange,
}: {
	businessId: string;
	businessName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const revoke = useRevokeBusinessAccess(businessId);
	// Un corte en vuelo no se repite: el botón se deshabilita, y esta guarda es
	// la segunda barrera para el clic que llega antes de que React repinte.
	const inFlight = useRef(false);

	const confirm = async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const response = await revoke.mutateAsync();
			toast.success(revokeSummary(response));
			onOpenChange(false);
		} catch (error) {
			notifyMutationError(error);
		} finally {
			inFlight.current = false;
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>¿Cortar todos los accesos?</AlertDialogTitle>
					<AlertDialogDescription>
						Se cortan TODOS los accesos de{" "}
						<span className="font-medium text-foreground">{businessName}</span>,
						y con ellos las sesiones abiertas. El dueño del negocio queda
						dentro.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={revoke.isPending}>
						Cancelar
					</AlertDialogCancel>
					<AlertDialogAction
						variant="destructive"
						disabled={revoke.isPending}
						onClick={confirm}
					>
						{revoke.isPending ? <Spinner /> : null} Cortar los accesos
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

/**
 * El resultado del corte, en una frase.
 *
 * El conteo es el de la RESPUESTA (`disabled.length`), no el de lo que se
 * pidió: en un corte de emergencia «se cortaron tres» y «se pidieron tres» no
 * son lo mismo. Y el cero tiene su propia frase, porque «Se cortaron 0
 * accesos» se lee como un fallo y no como un negocio que ya estaba limpio.
 *
 * La frase del dueño se agrega sólo cuando la API dice `owner_skipped`: es un
 * hecho de la respuesta, no una cortesía del panel.
 */
function revokeSummary(response: RevokeBusinessAccessResponseDto): string {
	const count = response.disabled.length;
	const base =
		count === 0
			? "No había accesos activos que cortar."
			: count === 1
				? "Se cortó 1 acceso."
				: `Se cortaron ${count} accesos.`;
	return response.owner_skipped ? `${base} El dueño quedó adentro.` : base;
}
