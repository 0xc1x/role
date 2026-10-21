import { type Href, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import type { BusinessMemberDto } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { useStaffMutations } from "@/src/features/business/hooks";

/**
 * La transferencia de la propiedad del negocio (Plan 4).
 *
 * ─── POR QUÉ ES UNA HOJA Y NO UN BOTÓN ────────────────────────────────────────
 *
 * Porque la propiedad no se cambia de un tap: cambia QUIÉN administra el
 * negocio, y quien la entrega tiene que leer antes qué pasa con los dos
 * accesos —el suyo y el que recibe—. Por eso la hoja dice las tres cosas:
 * quién queda como dueño, quién queda como gerente, y qué condición hereda el
 * dueño.
 *
 * ─── POR QUÉ EL AVISO HABLA DEL DUEÑO Y NO DEL QUE TRANSFIERE ─────────────────
 *
 * Porque después de la transferencia el que entrega es un GERENTE, y un
 * gerente sí puede borrar su cuenta: lo que no puede es el dueño. El aviso
 * dice la regla del rol —«un dueño no se puede pausar ni dar de baja, y no
 * puede borrar su cuenta mientras el negocio siga activo»— y no la de una
 * persona que ya no es dueño. Decir lo contrario sería mentir: el que
 * transfiere SÍ puede borrar su cuenta después.
 *
 * ─── POR QUÉ EL ÉXITO SE ANUNCIA CON LA RESPUESTA Y NO CON EL ACCESO ──────────
 *
 * Porque la respuesta trae las DOS membresías en su estado nuevo —el dueño
 * saliente y el nuevo— y lo que se dice es lo que devolvió el API: «ahora Ana
 * es el dueño; Rosa queda como gerente». Anunciar el nombre que la app suponía
 * sería anunciar una suposición.
 *
 * ─── Y POR QUÉ EL ERROR NO CIERRA LA HOJA ──────────────────────────────────────
 *
 * Porque la persona tiene que poder LEER el motivo —«el receptor tiene que ser
 * un acceso vivo de este negocio»— y reintentar sin volver a buscar el acceso
 * en la lista. El error lo escribe el API en su prosa; la app no lo tapa con un
 * «algo salió mal».
 */
export function TransferOwnershipSheet({
	businessId,
	member,
	onClose,
}: {
	/** El negocio al que se le transfiere la propiedad: lo necesita la ruta. */
	businessId: string;
	/** El acceso que va a RECIBIR la propiedad. */
	member: BusinessMemberDto;
	/** Cierra la hoja. */
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const { transferOwnership } = useStaffMutations(businessId);

	// El error de la última transferencia: lo escribió el API y se pinta tal
	// cual.
	const [error, setError] = useState<string | null>(null);
	// La transferencia en vuelo: mientras dura, el botón no admite otro toque.
	const [pending, setPending] = useState(false);

	const confirm = () => {
		// Una transferencia en vuelo no se repite: el botón está deshabilitado
		// mientras dura, y esta guarda es la segunda barrera.
		if (pending) return;
		setError(null);
		setPending(true);
		transferOwnership
			.mutateAsync(member.id)
			.then((response) => {
				// Los NOMBRES son los de la RESPUESTA: el API devuelve las dos
				// membresías ya con su rol nuevo.
				toast.success(
					strings.business.staff.transferSuccess
						.replace("{newOwner}", response.new_owner.label)
						.replace("{previousOwner}", response.previous_owner.label),
				);
				onClose();
				// El panel del negocio: el rol de quien está mirando cambió, y
				// el panel es donde se ve.
				router.replace(`/business/${businessId}` as Href);
			})
			.catch((cause: unknown) => {
				setError(
					toAppError(cause, strings.business.staff.transferError).message,
				);
			})
			.finally(() => setPending(false));
	};

	return (
		<BottomSheetModal
			title={strings.business.staff.transferSheetTitle.replace(
				"{name}",
				member.label,
			)}
			onClose={onClose}
			footer={
				<View style={styles.footer}>
					<Button
						variant="outline"
						onPress={onClose}
						style={styles.footerButton}
					>
						{strings.common.cancel}
					</Button>
					<Button
						disabled={pending}
						onPress={confirm}
						style={styles.footerButton}
					>
						{strings.business.staff.transferConfirm.replace(
							"{name}",
							member.label,
						)}
					</Button>
				</View>
			}
		>
			<View style={styles.body}>
				<AppText variant="bodyMedium">
					{strings.business.staff.transferBody.replace("{name}", member.label)}
				</AppText>

				{/* La condición del dueño: es lo que hay que saber ANTES de
				    confirmar, y por eso no va en un toast que se va. Es un
				    AVISO, no un fallo: por eso lleva el ámbar de la casa
				    (`warningText`), no el rojo. */}
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.warningText }}
				>
					{strings.business.staff.transferOwnerWarning}
				</AppText>

				{error ? (
					<AppText
						variant="bodySmall"
						style={{ color: colors.destructiveVibrant }}
					>
						{error}
					</AppText>
				) : null}
			</View>
		</BottomSheetModal>
	);
}

const styles = StyleSheet.create({
	body: { gap: spacing.sm },
	footer: { flexDirection: "row", gap: spacing.sm },
	footerButton: { flex: 1 },
});
