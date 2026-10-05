import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import type { Announcement } from "@0c1x/role-commons";

import { Button } from "@/components/ui/button";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { withAlpha } from "@/src/core/theme/alpha";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";

import type { AnnouncementModal } from "../domain/announcement";

/**
 * El modal de UN aviso del operador: el `required` suelto, o una página del
 * lote de `info`.
 *
 * POR QUÉ HAY DOS CALLBACKS Y NO UNO — es la razón de que este archivo exista.
 *
 * Un `required` sale de la cola de dos maneras que NO son la misma: se lo
 * ENTENDIÓ —el acknowledgement escribe una fila que la base no deja borrar— o
 * se lo CERRÓ, que no escribe nada. Con un solo callback, cualquiera de las dos
 * se cablea al handler de la otra, y el caso que parece inocuo es el peor: un
 * "cerrar" que llama al acknowledge saca de la cola un aviso que nadie entendió
 * y, como `announcement_acknowledgements` no tiene policy de UPDATE ni de
 * DELETE, ese aviso no vuelve a aparecer nunca. Es la falla inversa exacta a la
 * que la migración prohíbe: "un `required` tiene que volver en cada apertura
 * hasta que la persona lo entienda".
 *
 * Por eso los dos gestos son props DISTINTAS y con PARÁMETRO distinto: `id` en
 * una, `ids` en la otra. Eso es lo que impide el cruce, y lo impide el
 * compilador: `(ids: string[]) => void` no acepta `(id: string) => …` ni al
 * revés, así que un cableado cruzado no llega a compilar. Que `onDismissInfo`
 * reciba una lista y no un id no es un detalle del llamador: es lo que impide
 * descartar uno del lote y devolver los otros en la próxima apertura.
 *
 * El `Promise<void>` de `onAcknowledge` NO juega ese papel —`Promise<void>` es
 * asignable a `void` sin error, así que el tipo de retorno no protege nada—.
 * Está porque el modal distingue "se guardó" de "no se guardó": sin eso, un fallo
 * de red se vería como un aviso entendido y el modal no podría reintentar.
 */
export function AnnouncementDialog({
	modal,
	onAcknowledge,
	onDismissInfo,
}: {
	modal: AnnouncementModal;
	/**
	 * Registra el `required` como entendido. La promesa no es para distinguir los
	 * callbacks entre sí —eso lo da el `id` contra el `ids`— sino porque el modal
	 * necesita saber si la escritura se confirmó: sacar el aviso de la cola sin
	 * confirmación convertiría un fallo de red en un aviso entendido para
	 * siempre.
	 */
	onAcknowledge: (id: string) => Promise<void>;
	/** Descarta el LOTE de `info` entero, en un gesto y una sola escritura. */
	onDismissInfo: (ids: string[]) => void;
}) {
	const { colors } = useTheme();
	// Oculto sin resolver: el único camino que esconde el modal sin tocar la
	// cola. Lo usa el gesto de atrás de un `required`, y por eso el estado vive
	// acá y no en el layout —quien camina la cola no tiene que saber que
	// existe, y no puede adelantarse por error.
	const [hidden, setHidden] = useState(false);
	const [page, setPage] = useState(0);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Los hooks van antes de cualquier `return`: si no, el orden de hooks
	// cambiaría entre el modal visible y el escondido.
	if (hidden) return null;
	// `{ kind: "info", announcements: [] }` es legal para el tipo aunque
	// `buildModalSequence` no lo arme nunca —el lote solo se agrega si quedó
	// algo—. Montarlo sería una pantalla ocupada sin nada que decir, y el aviso
	// que se perdió de paso no se va a poder volver a mostrar.
	if (modal.kind === "info" && modal.announcements.length === 0) return null;

	const lote: Announcement[] = modal.kind === "info" ? modal.announcements : [];
	// La página se recorta contra el tamaño REAL del lote: una relectura puede
	// dejar la página 3 apuntando a un lote de dos, y sin el recorte el modal
	// pintaría un aviso que ya no está.
	const total = lote.length;
	const index = total > 0 ? Math.min(page, total - 1) : 0;
	const aviso: Announcement =
		modal.kind === "required" ? modal.announcement : lote[index];
	// El `total > 0` no es decorativo: con `kind: "required"` el lote es `[]`, así
	// que sin él `0 >= -1` daría `true` y un `required` quedaría etiquetado como
	// última página del lote. Hoy es inofensivo porque tanto el handler como la
	// etiqueta cortan antes por `kind`, pero es una bomba: reordenar esos
	// ternarios y el `required` se cierra con la etiqueta del lote.
	const ultimaPagina = total > 0 && index >= total - 1;

	/**
	 * El gesto de atrás del sistema —el botón físico de Android y el `Escape`
	 * del navegador— con la misma división por severidad que el botón.
	 *
	 * Un `required` se ESCONDE y vuelve: no hay acknowledgement ni descarte, así
	 * que la cola sigue con el mismo aviso en cabeza y el siguiente `required`
	 * no se muestra. Por eso D7 no se rompe: el aviso no bloquea la app y
	 * tampoco se pierde. Un `info` se descarta entero, porque descartar un
	 * informativo no deja nada que recordar y el gesto no puede ser el descarte
	 * de media parte del lote.
	 *
	 * "Vuelve" no significa solo en el próximo arranque. `hidden` es estado de
	 * ESTA instancia: si la cabeza de la cola cambia de identidad —otro `required`
	 * de mayor prioridad aparece, o el que estaba primero se entiende— el host
	 * monta el modal con otra `key`, la instancia anterior se descarta con su
	 * `hidden`, y cuando el mismo aviso vuelva a ser cabeza de la cola se monta
	 * de nuevo y se ve. La ventana real es "hasta que vuelva a ser cabeza de la
	 * cola, o hasta el próximo arranque", que es más corta que la que parecía.
	 */
	const handleRequestClose = () => {
		if (modal.kind === "required") {
			setHidden(true);
			return;
		}
		onDismissInfo(lote.map((a) => a.id));
	};

	/**
	 * Un solo botón, y su etiqueta declara la intención: avanzar o descartar.
	 *
	 * Descartar en la primera página dejaría avisos sin haberlos mostrado nunca,
	 * y descartar el de la página visible dejaría los otros para la próxima
	 * apertura —el único aviso que no volvería sería el que la persona llegó a
	 * ver, que es justo al revés de lo razonable.
	 */
	const handlePrimary = () => {
		if (modal.kind === "required") {
			void handleAcknowledge();
			return;
		}
		if (ultimaPagina) {
			onDismissInfo(lote.map((a) => a.id));
			return;
		}
		setPage(index + 1);
	};

	/**
	 * El único camino que saca un `required` de la cola.
	 *
	 * El modal NO se esconde al terminar bien ni al fallar: lo saca el
	 * acknowledgement cuando el servidor confirma, y si la escritura falla
	 * `acknowledge` no toca el caché, así que este modal sigue montado con el
	 * motivo y el botón para reintentar. Esconderse en el fallo sería dejar a la
	 * persona con un aviso que desaparece sin quedar registrado y que vuelve
	 * después sin explicación.
	 */
	async function handleAcknowledge() {
		setPending(true);
		setError(null);
		try {
			await onAcknowledge(aviso.id);
		} catch (e) {
			setError(toAppError(e, strings.announcements.acknowledgeFailed).message);
		} finally {
			setPending(false);
		}
	}

	return (
		<Modal
			transparent
			visible
			animationType="fade"
			onRequestClose={handleRequestClose}
		>
			{/*
			  El fondo es una superficie INERTE: no es un `Pressable`, así que no
			  hay gesto de "tocar afuera para cerrar". Con un fondo tocable el
			  `required` tendría una salida, y esa salida se parecería a entenderlo
			  sin serlo.
			*/}
			<View
				style={[
					styles.backdrop,
					{ backgroundColor: withAlpha(colors.scrim, 0.55) },
				]}
			>
				<View
					style={[
						styles.card,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
						},
					]}
				>
					{/* El `body` llega a 2000 caracteres por el CHECK de la tabla, así
					    que el cuerpo scrollea y el botón queda siempre alcanzable: un
					    aviso obligatorio con el botón debajo del pliegue es un aviso
					    que se cierra sin leerse. */}
					<ScrollView
						style={styles.body}
						contentContainerStyle={styles.bodyContent}
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.meta}>
							<AppText
								variant="labelSmall"
								weight="bold"
								style={{ color: colors.mutedForeground }}
							>
								{modal.kind === "required"
									? strings.announcements.requiredBadge
									: strings.announcements.infoBadge}
							</AppText>
							{modal.kind === "info" && total > 1 ? (
								<AppText
									variant="labelSmall"
									style={{ color: colors.mutedForeground }}
								>
									{strings.announcements.pageCount
										.replace("{n}", String(index + 1))
										.replace("{total}", String(total))}
								</AppText>
							) : null}
						</View>

						<AppText variant="h3" weight="bold">
							{aviso.title}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{aviso.body}
						</AppText>

						{modal.kind === "required" ? (
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.announcements.requiredHint}
							</AppText>
						) : null}
					</ScrollView>

					{error ? <Notice message={error} /> : null}

					<Button fullWidth size="lg" loading={pending} onPress={handlePrimary}>
						{modal.kind === "required"
							? strings.announcements.acknowledge
							: ultimaPagina
								? strings.announcements.dismissBatch
								: strings.announcements.nextPage}
					</Button>
				</View>
			</View>
		</Modal>
	);
}

/**
 * El motivo de un acknowledgement que no se pudo guardar.
 *
 * Va dentro del modal y no en un toast a propósito: el aviso sigue en pantalla
 * —no se escondió— y lo que la persona puede hacer con este motivo es
 * reintentar. Un toast que se va solo deja el botón ahí sin explicación de por
 * qué no alcanzó.
 *
 * `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` es lo que hace
 * que el lector de pantalla lo anuncie apenas aparece, sin obligar a recorrer el
 * modal para encontrar qué falló.
 */
function Notice({ message }: { message: string }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.notice,
				{
					backgroundColor: colors.destructiveSurface,
					borderColor: colors.destructiveBorder,
				},
			]}
			accessibilityRole="alert"
			accessibilityLiveRegion="polite"
		>
			<AppText variant="bodySmall" style={{ color: colors.destructiveVibrant }}>
				{message}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: spacing.xl,
	},
	card: {
		width: "100%",
		maxWidth: 440,
		// Content-driven con tope: `flexGrow: 0` porque un padre sin altura
		// definida colapsa a 0 el `flex: 1` de Yoga en nativo, y el aviso se
		// vería como una caja vacía.
		maxHeight: "88%",
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.xl,
		gap: spacing.md,
	},
	body: { flexGrow: 0, flexShrink: 1 },
	bodyContent: { gap: spacing.sm },
	meta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	notice: {
		borderWidth: 1,
		borderRadius: radii.md,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
	},
});
