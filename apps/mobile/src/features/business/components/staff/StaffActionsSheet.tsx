import { type Href, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type {
	BusinessMemberDeliveryCardDto,
	BusinessMemberDto,
} from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { useStaffMutations } from "@/src/features/business/hooks";
import {
	DisableAccessDialog,
	type StaffAccessAction,
} from "./DisableAccessDialog";
import { RotatePinSheet } from "./RotatePinSheet";

/**
 * Las acciones sobre UN acceso del equipo (§9.2).
 *
 * ─── POR QUÉ LAS ACCIONES VIVEN EN UNA HOJA Y NO EN LA TARJETA ────────────────
 *
 * Porque son cinco y cada una tiene su consecuencia: la tarjeta del listado
 * es el lugar donde se VE QUIÉN es cada acceso, y la hoja es el lugar donde se
 * decide qué se le hace. La tarjeta ofrece la entrada —«Editar», «Más
 * acciones»— y la hoja ofrece las acciones: si las dos pintaran lo mismo,
 * la tarjeta sería un índice de menús.
 *
 * ─── POR QUÉ EL DUEÑO NO TIENE ACCIONES ───────────────────────────────────────
 *
 * Porque la propiedad del negocio no se administra desde aquí: se
 * TRANSFIERE, y el API rechaza (`R0002`) un cambio de rol sobre el dueño. La
 * hoja se cierra para él aunque se monte directamente —la tarjeta no ofrece
 * el botón, y la hoja tampoco ofrece acciones si el dueño llega a ella—:
 * dos barreras para el mismo hecho.
 *
 * ─── POR QUÉ CADA MUTACIÓN PIDE CONFIRMACIÓN ──────────────────────────────────
 *
 * Porque las cuatro escriben en el acceso de una persona y tres de ellas
 * cortan algo: una pausa corta el acceso AHORA —y con él las sesiones
 * abiertas—, una baja lo deja sin poder volver a entrar, y una rotación deja
 * de valer el PIN que la persona tenía. Sin una ventana de por medio, un
 * toque-equivocado deja a un empleado fuera del negocio.
 *
 * ─── POR QUÉ EL ERROR NO CIERRA LA HOJA ───────────────────────────────────────
 *
 * Porque la persona tiene que poder LEER el motivo —«tu plan no admite otro
 * acceso»— y reintentar sin volver a buscarla en la lista. El error lo
 * escribe el API en su prosa; la app no lo tapa con un «algo salió mal».
 */
export function StaffActionsSheet({
	businessId,
	member,
	onClose,
	onRotated,
}: {
	/** El negocio del acceso: lo necesitan las mutaciones para armar la ruta. */
	businessId: string;
	/** El acceso sobre el que se actúa. */
	member: BusinessMemberDto;
	/** Cierra la hoja. */
	onClose: () => void;
	/**
	 * Se llama cuando la rotación sale bien, con la tarjeta nueva.
	 *
	 * Quien monta la hoja puede usarla para anunciar el cambio o para
	 * refrescar lo que tenga al lado; la hoja no depende de que alguien la
	 * use.
	 */
	onRotated?: (card: BusinessMemberDeliveryCardDto) => void;
}) {
	const { colors } = useTheme();
	const {
		rotate,
		disable,
		enable,
		remove: removeAccess,
	} = useStaffMutations(businessId);

	// La acción que está esperando su confirmación. `null` es «no hay ninguna»:
	// es lo que se pinta cuando la hoja se abre.
	const [pending, setPending] = useState<StaffAccessAction | null>(null);
	// La tarjeta del PIN rotado. Mientras exista, la hoja se sustituye por ella.
	const [card, setCard] = useState<BusinessMemberDeliveryCardDto | null>(null);
	// El error de la última acción: lo escribe el API y se pinta tal cual.
	const [error, setError] = useState<string | null>(null);

	const isOwner = member.role === "owner";
	const isPaused = member.status === "disabled";
	// Con una mutación en vuelo no se ofrece otra: dos rotaciones seguidas
	// dejarían un PIN entregado que ya no vale, y dos pausas no dicen más que
	// una.
	const busy =
		rotate.isPending ||
		disable.isPending ||
		enable.isPending ||
		removeAccess.isPending;

	// La tarjeta REEMPLAZA a la hoja de acciones: son dos modales y sólo uno
	// puede estar abierto. Al cerrarla se cierra todo y la persona vuelve al
	// equipo —sin navegar a ninguna parte—.
	if (card) {
		return <RotatePinSheet card={card} onClose={onClose} />;
	}

	// El dueño no se administra desde aquí: la hoja se queda vacía.
	if (isOwner) return null;

	const fail = (cause: unknown) => {
		setError(toAppError(cause, strings.business.genericError).message);
	};

	const rotatePin = () => {
		setError(null);
		rotate
			.mutateAsync(member.id)
			.then((rotated) => {
				setCard(rotated);
				onRotated?.(rotated);
			})
			.catch(fail);
	};

	const pause = () => {
		setError(null);
		disable
			.mutateAsync(member.id)
			.then(() => onClose())
			.catch(fail);
	};

	const reactivate = () => {
		setError(null);
		enable
			.mutateAsync(member.id)
			.then(() => onClose())
			.catch(fail);
	};

	const giveBack = () => {
		setError(null);
		removeAccess
			.mutateAsync(member.id)
			.then(() => onClose())
			.catch(fail);
	};

	const confirm = () => {
		const action = pending;
		setPending(null);
		switch (action) {
			case "rotate":
				rotatePin();
				return;
			case "pause":
				pause();
				return;
			case "reactivate":
				reactivate();
				return;
			case "remove":
				giveBack();
				return;
			default:
				return;
		}
	};

	const goToEdit = () => {
		router.push(`/business/${businessId}/staff/${member.id}/edit` as Href);
		onClose();
	};

	return (
		<BottomSheetModal
			title={strings.business.staff.actionsTitle}
			onClose={onClose}
		>
			<View style={styles.actions}>
				{isPaused ? null : (
					<Button
						variant="outline"
						disabled={busy}
						onPress={goToEdit}
						style={styles.action}
					>
						{strings.business.staff.edit}
					</Button>
				)}

				{isPaused ? null : (
					<Button
						variant="outline"
						disabled={busy}
						onPress={() => setPending("rotate")}
						style={styles.action}
					>
						{strings.business.staff.actionRotate}
					</Button>
				)}

				{isPaused ? (
					<Button
						variant="outline"
						disabled={busy}
						onPress={() => setPending("reactivate")}
						style={styles.action}
					>
						{strings.business.staff.actionReactivate}
					</Button>
				) : (
					<Button
						variant="outline"
						disabled={busy}
						onPress={() => setPending("pause")}
						style={styles.action}
					>
						{strings.business.staff.actionPause}
					</Button>
				)}

				<Button
					variant="destructive"
					disabled={busy}
					onPress={() => setPending("remove")}
					style={styles.action}
				>
					{strings.business.staff.actionRemove}
				</Button>
			</View>

			{error ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{error}
				</AppText>
			) : null}

			<DisableAccessDialog
				action={pending}
				open={pending !== null}
				memberLabel={member.label}
				onConfirm={confirm}
				onCancel={() => setPending(null)}
			/>
		</BottomSheetModal>
	);
}

const styles = StyleSheet.create({
	actions: { gap: spacing.sm },
	action: { width: "100%" },
});
