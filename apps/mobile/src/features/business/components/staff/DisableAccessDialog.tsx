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
import { Text } from "@/components/ui/text";
import { useTheme } from "@/src/core/theme";
import { strings } from "@/src/core/i18n/strings";

/**
 * Las acciones sobre un acceso que piden que alguien las confirme.
 *
 * Las cuatro son de la misma familia: cambian el acceso de una persona y el
 * dueño tiene que ver QUÉ va a pasar antes de que pase. Por eso la ventana es
 * la misma y lo que cambia es la prosa.
 */
export type StaffAccessAction = "rotate" | "pause" | "reactivate" | "remove";

/**
 * La prosa de cada confirmación.
 *
 * Se ITERA el vocabulario de las acciones en vez de preguntar por una: si
 * mañana aparece una acción nueva y nadie la escribió acá, el compilador lo
 * dice en vez de dejar la confirmación en blanco.
 */
const COPY: Record<
	StaffAccessAction,
	{ title: string; body: string; confirm: string }
> = {
	rotate: {
		title: strings.business.staff.rotateTitle,
		body: strings.business.staff.rotateBody,
		confirm: strings.business.staff.actionRotate,
	},
	pause: {
		title: strings.business.staff.pauseTitle,
		body: strings.business.staff.pauseBody,
		confirm: strings.business.staff.actionPause,
	},
	reactivate: {
		title: strings.business.staff.reactivateTitle,
		body: strings.business.staff.reactivateBody,
		confirm: strings.business.staff.actionReactivate,
	},
	remove: {
		title: strings.business.staff.removeTitle,
		body: strings.business.staff.removeBody,
		confirm: strings.business.staff.actionRemove,
	},
};

/**
 * La confirmación de una acción sobre el acceso de una persona.
 *
 * ─── POR QUÉ EL ARCHIVO SE LLAMA «DisableAccessDialog» ────────────────────────
 *
 * Porque la primera acción que lo usa es la pausa —«desactivar el acceso»— y
 * ese es el nombre que le fijó el plan. El componente, en cambio, cubre las
 * cuatro: la ventana es la misma —con su cancelar, su confirmar y su prosa— y
 * lo único que cambia es QUÉ se está confirmando.
 *
 * ─── POR QUÉ LA CONFIRMACIÓN DICE LO QUE NO PASA ───────────────────────────────
 *
 * Porque lo que la persona teme no es sólo lo que hace: es lo que NO hace.
 * Quien rota el PIN tiene que saber que las sesiones abiertas siguen vivas —
 *si no, «rotar» suena a «cortar el acceso» y se pausa en su lugar—. Quien
 * pausa tiene que saber que el corte es AHORA, y no «cuando termine la
 * sesión». Y quien da de baja tiene que saber que el alias no vuelve: es un
 * dato que no se puede recuperar y que hay que decidir antes de perderlo.
 *
 * ─── Y POR QUÉ EL TÍTULO DICE A QUIÉN ──────────────────────────────────────────
 *
 * Porque una ventana de confirmación sin objeto es una ventana sobre algo
 * que no se sabe: en una lista de accesos hay varias personas, y el nombre va
 * en el título para que la confirmación sea de ESTA persona.
 *
 * ─── Y POR QUÉ SÓLO LA BAJA SE PINTA DESTRUCTIVA ──────────────────────────────
 *
 * Porque es la única de las cuatro que DESTRUYE: las otras se deshacen —una
 * pausa se revierte reactivando, una reactivación se revierte pausando, y un
 * PIN rotado se vuelve a rotar—, y una baja no se deshace. El botón que la
 * confirma se pinta como el «Dar de baja» de la hoja: el mismo gesto pide lo
 * mismo.
 */
export function DisableAccessDialog({
	action,
	open,
	memberLabel,
	onConfirm,
	onCancel,
}: {
	/** La acción que se está confirmando. */
	action: StaffAccessAction | null;
	/** Si la ventana está abierta. */
	open: boolean;
	/** El nombre de la persona cuyo acceso se toca. */
	memberLabel: string;
	/** La persona confirmó: la acción sale. */
	onConfirm: () => void;
	/** La persona se arrepintió: no sale nada. */
	onCancel: () => void;
}) {
	const copy = action ? COPY[action] : null;
	const { colors } = useTheme();

	return (
		<AlertDialog
			open={open && copy !== null}
			onOpenChange={(next) => {
				if (!next) onCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{copy ? copy.title.replace("{name}", memberLabel) : ""}
					</AlertDialogTitle>
					<AlertDialogDescription>{copy?.body ?? ""}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Text>{strings.common.cancel}</Text>
					</AlertDialogCancel>
					<AlertDialogAction
						onPress={onConfirm}
						// La baja es la única de las cuatro que DESTRUYE: su
						// botón se pinta como el «Dar de baja» de la hoja, para
						// que el dedo sepa lo que está a punto de perder.
						style={
							action === "remove"
								? { backgroundColor: colors.destructive }
								: undefined
						}
					>
						<Text>{copy?.confirm ?? ""}</Text>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
