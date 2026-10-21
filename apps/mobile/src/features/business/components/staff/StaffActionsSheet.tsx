import { type Href, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type {
	BusinessMemberDeliveryCardDto,
	BusinessMemberDto,
	BusinessMemberRole,
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
import { TransferOwnershipSheet } from "./TransferOwnershipSheet";

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
 * Porque el acceso del DUEÑO no se administra desde aquí: no se edita —el API
 * rechaza (`R0002`) un cambio de rol sobre el dueño— ni se pausa. Y tampoco se
 * transfiere a sí mismo: la propiedad se TRANSFIERE a otro acceso, y la
 * transferencia la pide el dueño —no se la pide a sí mismo—. La hoja se cierra
 * para él aunque se monte directamente —la tarjeta no ofrece el botón, y la
 * hoja tampoco ofrece acciones si el dueño llega a ella—: dos barreras para
 * el mismo hecho.
 *
 * ─── POR QUÉ EL TÍTULO Y LOS BOTONES NOMBRAN AL ACCESO ───────────────────────
 *
 * Porque la hoja se abre sobre UNA persona: sin su nombre, el lector de
 * pantalla anuncia «Rotar PIN», «Pausar», «Reactivar» y «Dar de baja» como
 * cuatro acciones sin objeto, y el título —«Acciones de Ana Torres»— es lo
 * único que dice de quién se trata.
 *
 * ─── POR QUÉ CADA MUTACIÓN PIDE CONFIRMACIÓN ──────────────────────────────────
 *
 * Porque las cuatro escriben en el acceso de una persona y tres de ellas
 * cortan algo: una pausa corta el acceso AHORA —y con él las sesiones
 * abiertas—, una baja lo deja sin poder volver a entrar, y una rotación deja
 * de valer el PIN que la persona tenía. Sin una ventana de por medio, un
 * toque-equivocado deja a un empleado fuera del negocio.
 *
 * ─── POR QUÉ LA BAJA SÓLO LA PIDE EL DUEÑO ───────────────────────────────────
 *
 * Porque el API lo dice con su prosa: «Dar de baja un acceso es del dueño del
 * negocio, no de un gerente» (`DELETE /businesses/:id/staff/:memberId`, §8).
 * Un gerente que pulses la baja llega hasta el diálogo de confirmación —donde
 * se dice lo que NO se recupera— y sólo entonces recibe un 403. Un botón que
 * el servidor va a rechazar es una puerta que se abre para encontrar un error,
 * y el error llega tarde: cuando la persona ya creyó que lo estaba haciendo.
 *
 * ─── POR QUÉ LA TRANSFERENCIA SÓLO LA VE EL DUEÑO ────────────────────────────
 *
 * Porque la propiedad la entrega QUIEN ES EL DUEÑO: la base exige que quien
 * llama sea el dueño vivo del negocio (`transfer_business_ownership` lee
 * `auth.uid()` y busca esa fila). Un gerente que la pidiera recibiría un 422
 * con el motivo, así que el botón no se le ofrece. Y un rol que todavía no se
 * sabe —la pantalla del equipo aún está cargando— NO la ofrece tampoco: la
 * puerta se cierra por defecto.
 *
 * ─── POR QUÉ EL RECEPTOR TIENE QUE ESTAR ACTIVO ───────────────────────────────
 *
 * Porque la base rechaza un receptor pausado o dado de baja («un acceso dado
 * de baja, pausado o de otro negocio no puede recibir la propiedad»). Un
 * botón que el servidor va a rechazar es una puerta que se abre para
 * encontrar un error.
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
	actorRole,
	onClose,
	onRotated,
}: {
	/** El negocio del acceso: lo necesitan las mutaciones para armar la ruta. */
	businessId: string;
	/** El acceso sobre el que se actúa. */
	member: BusinessMemberDto;
	/**
	 * El rol de QUIEN MIRA.
	 *
	 * No es el del acceso sobre el que se actúa: es el de la persona que tiene
	 * la hoja abierta. La transferencia la pide el dueño, y sin este dato la
	 * hoja no puede saber si puede ofrecerla. `undefined` es «todavía no se
	 * sabe», y en ese caso no se ofrece.
	 */
	actorRole: BusinessMemberRole | undefined;
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
	// La hoja de transferencia abierta: sustituye a esta, como la tarjeta.
	const [transferOpen, setTransferOpen] = useState(false);
	// El error de la última acción: lo escribe el API y se pinta tal cual.
	const [error, setError] = useState<string | null>(null);

	const isOwner = member.role === "owner";
	const isPaused = member.status === "disabled";
	// La transferencia la pide el DUEÑO y el receptor tiene que ser un acceso
	// ACTIVO. El dueño no llega aquí: la hoja se cierra para él antes.
	const canTransfer = actorRole === "owner" && !isPaused;
	// La BAJA también la pide el dueño: el API la leal al dueño y le responde
	// un 403 al gerente («Dar de baja un acceso es del dueño del negocio, no
	// de un gerente»). Un rol que todavía no se sabe NO la ofrece tampoco: la
	// puerta se cierra por defecto.
	const canRemove = actorRole === "owner";
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

	// La hoja de transferencia SUSTITUYE a la de acciones: son dos modales y
	// sólo uno puede estar abierto. Al cerrarla se cierra todo.
	if (transferOpen) {
		return (
			<TransferOwnershipSheet
				businessId={businessId}
				member={member}
				onClose={onClose}
			/>
		);
	}

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
			title={strings.business.staff.actionsTitle.replace(
				"{name}",
				member.label,
			)}
			onClose={onClose}
		>
			<View style={styles.actions}>
				{isPaused ? null : (
					<Button
						variant="outline"
						disabled={busy}
						// Cada botón dice A QUIÉN actúa: sin el objeto, el
						// lector de pantalla anuncia cuatro acciones sin
						// saber sobre quién.
						accessibilityLabel={strings.business.staff.editAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
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
						accessibilityLabel={strings.business.staff.actionRotateAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
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
						accessibilityLabel={strings.business.staff.actionReactivateAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
						onPress={() => setPending("reactivate")}
						style={styles.action}
					>
						{strings.business.staff.actionReactivate}
					</Button>
				) : (
					<Button
						variant="outline"
						disabled={busy}
						accessibilityLabel={strings.business.staff.actionPauseAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
						onPress={() => setPending("pause")}
						style={styles.action}
					>
						{strings.business.staff.actionPause}
					</Button>
				)}

				{canTransfer ? (
					<Button
						variant="outline"
						disabled={busy}
						// «Transferir la propiedad» a secas no dice A QUIÉN se
						// le transfiere: el lector de pantalla necesita el
						// objeto de una acción irreversible.
						accessibilityLabel={strings.business.staff.transferAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
						onPress={() => setTransferOpen(true)}
						style={styles.action}
					>
						{strings.business.staff.transferTrigger}
					</Button>
				) : null}

				{canRemove ? (
					<Button
						variant="destructive"
						disabled={busy}
						accessibilityLabel={strings.business.staff.actionRemoveAccessibilityLabel.replace(
							"{name}",
							member.label,
						)}
						onPress={() => setPending("remove")}
						style={styles.action}
					>
						{strings.business.staff.actionRemove}
					</Button>
				) : null}
			</View>

			{error ? (
				<AppText variant="bodySmall" style={{ color: colors.destructiveText }}>
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
