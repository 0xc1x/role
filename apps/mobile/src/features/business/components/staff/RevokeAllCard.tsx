import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type {
	BusinessMemberRole,
	RevokeBusinessAccessResponseDto,
} from "@0xc1x/role-commons";
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
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
import { useStaffMutations } from "@/src/features/business/hooks";

/**
 * El corte de emergencia: todos los accesos del negocio, de una vez.
 *
 * ─── POR QUÉ ES UNA TARJETA Y NO UN BOTÓN SUELTO ─────────────────────────────
 *
 * Porque es la operación más DESTRUCTIVA del panel y necesita decir lo que
 * hace antes de que alguien la pulse: corta los accesos de todo el equipo y
 * con ellos las sesiones abiertas. Un botón suelto obliga a leer la prosa de
 * un diálogo que aparece después del toque; una tarjeta la dice ANTES, y el
 * diálogo la repite por si acaso.
 *
 * ─── Y POR QUÉ EL EMPLEADO NO LA VE ──────────────────────────────────────────
 *
 * Porque el empleado no administra el equipo: el API le contesta un 403
 * («Un empleado no administra los accesos del negocio»). Ocultar el botón es
 * UX, NO seguridad —la puerta de verdad está en el servidor—, pero un botón
 * que el servidor va a rechazar es una puerta que se abre para encontrar un
 * error. El dueño y el gerente sí la ven.
 *
 * ─── Y POR QUÉ EL GERENTE VE EL AVISO DE SU PROPIO ACCESO ────────────────────
 *
 * Porque el corte incluye a QUIEN LLAMA: el API corta los accesos que quien
 * llama administra, y un gerente administra el suyo. Sólo el dueño queda
 * fuera (`owner_skipped`). Si el gerente no lo sabe antes de confirmar, se
 * queda encerrado fuera de su propio negocio sin entender por qué.
 *
 * ─── Y POR QUÉ EL RESULTADO SE PINTA EN LA TARJETA Y NO EN UN TOAST ──────────
 *
 * Porque un toast se va y el dato NO: el conteo de accesos cortados es la
 * respuesta que el API acaba de dar, y quien cortó necesita saber cuántos se
 * cortaron —y si el dueño se salvó— para decirlo después. La tarjeta se queda
 * con el resultado; y si el corte falla, se queda con el mensaje del error en
 * vez de taparlo con un texto genérico.
 */
export function RevokeAllCard({
	businessId,
	role,
}: {
	/** El negocio al que se le corta el equipo: lo necesitan las rutas. */
	businessId: string;
	/** El rol de quien mira: el empleado no administra y no ve la tarjeta. */
	role: BusinessMemberRole;
}) {
	const { colors } = useTheme();
	const { revokeAll } = useStaffMutations(businessId);

	// Si la ventana de confirmación está abierta.
	const [open, setOpen] = useState(false);
	// La respuesta del último corte: la tarjeta la pinta y no se va.
	const [result, setResult] = useState<RevokeBusinessAccessResponseDto | null>(
		null,
	);
	// El error del último corte: lo escribió el API y se pinta tal cual.
	const [error, setError] = useState<string | null>(null);
	// El corte en vuelo: mientras dura, el botón no admite otro toque.
	const [pending, setPending] = useState(false);

	// El empleado no administra el equipo: no hay corte que ofrecerle. Los
	// hooks ya se llamaron —todos, siempre, en el mismo orden— y esto es lo
	// único que se sale antes de pintar.
	if (role === "staff") return null;

	const fail = (cause: unknown) => {
		setError(toAppError(cause, strings.business.genericError).message);
	};

	const confirm = () => {
		// Un corte en vuelo no se repite: el botón está deshabilitado mientras
		// dura, y esta guarda es la segunda barrera.
		if (pending) return;
		setPending(true);
		// La ventana se cierra al confirmar: el resultado vive en la tarjeta.
		setOpen(false);
		setError(null);
		setResult(null);
		revokeAll
			.mutateAsync()
			.then((response) => setResult(response))
			.catch(fail)
			.finally(() => setPending(false));
	};

	// El conteo es el de la respuesta, no una frase fija: «se cortaron tres» y
	// «se pidieron tres» no son lo mismo.
	const count = result?.disabled.length ?? 0;
	const resultText = !result
		? null
		: count === 0
			? strings.business.staff.revokeAllResultEmpty
			: count === 1
				? strings.business.staff.revokeAllResultOne
				: strings.business.staff.revokeAllResult.replace(
						"{count}",
						String(count),
					);

	// La confirmación dice lo que pasa y lo que NO pasa: que se van TODOS los
	// accesos del negocio, que con ellos se van las sesiones abiertas, y —si
	// quien corta es un gerente— que también se va el suyo.
	const description = [
		strings.business.staff.revokeAllBody,
		role === "manager" ? strings.business.staff.revokeAllManagerWarning : null,
	]
		.filter((part) => part !== null)
		.join(" ");

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.destructiveSurface,
					borderColor: colors.destructiveBorder,
				},
			]}
		>
			<AppText variant="h4" weight="bold">
				{strings.business.staff.revokeAllHeading}
			</AppText>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{strings.business.staff.revokeAllBody}
			</AppText>

			<Button
				variant="destructive"
				disabled={pending}
				// «Cortar todos los accesos» a secas no dice de QUÉ negocio: el
				// lector de pantalla necesita el objeto.
				accessibilityLabel={strings.business.staff.revokeAllAccessibilityLabel}
				onPress={() => setOpen(true)}
				style={styles.button}
			>
				{strings.business.staff.revokeAllTitle}
			</Button>

			{resultText ? (
				<AppText variant="bodySmall" weight="semiBold">
					{resultText}
				</AppText>
			) : null}

			{result?.owner_skipped ? (
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.staff.revokeAllResultOwnerSkipped}
				</AppText>
			) : null}

			{error ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{error}
				</AppText>
			) : null}

			<AlertDialog
				open={open}
				onOpenChange={(next) => {
					if (!next) setOpen(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{strings.business.staff.revokeAllTitle}
						</AlertDialogTitle>
						<AlertDialogDescription>{description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.cancel}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={confirm}
							disabled={pending}
							// El corte DESTRUYE: su botón se pinta como el
							// «Dar de baja» de la hoja de acciones, para que el
							// dedo sepa lo que está a punto de perder.
							style={{ backgroundColor: colors.destructive }}
						>
							<Text
								// El fondo destructivo trae SU texto: el de por
								// defecto (`primaryForeground`) es casi negro en
								// modo oscuro y sobre el fondo del corte no se
								// lee —2:1—.
								style={{ color: colors.destructiveForeground }}
							>
								{strings.business.staff.revokeAllTitle}
							</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.md,
		gap: spacing.sm,
		marginBottom: spacing.lg,
	},
	button: { width: "100%" },
});
