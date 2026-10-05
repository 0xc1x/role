import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Href } from "expo-router";

import { Button } from "@/components/ui/button";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import {
	AppText,
	EmptyState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
	type BadgeTone,
} from "@/src/core/ui";

import type {
	AnnouncementListItem,
	AnnouncementListState,
} from "../domain/announcement";
import { useAnnouncementList } from "../hooks";

/**
 * El rótulo y el tono del chip de cada estado.
 *
 * ES UN `Record` DEL ESTADO Y NO UN `switch`, y por el mismo motivo que
 * `badgeToneColors`: la completitud del `Record` es lo que hace que `tsc` deje de
 * compilar cuando el dominio agrega un estado. Un `switch` con `default` dejaría
 * pasar el estado nuevo como un gris cualquiera y el aviso nuevo se vería como
 * si no tuviera nada que decir.
 *
 * Y el tono sale del ESTADO y no de la severidad, porque el chip responde
 * «¿qué hice con esto?» y no «¿cuánto pesa?». Un `info` sin leer no es un
 * problema y no lleva un tono de alarma; un `required` pendiente sí es una
 * obligación abierta, pero no lo grita por color: lo dice con los dos botones
 * que tiene abajo, que es la forma en que la fila se distingue de un `info`
 * pendiente sin necesitar un segundo rótulo.
 */
const CHIP: Record<AnnouncementListState, { label: string; tone: BadgeTone }> =
	{
		pending: { label: strings.announcements.statePending, tone: "info" },
		acknowledged: {
			label: strings.announcements.stateAcknowledged,
			tone: "success",
		},
		dismissed: { label: strings.announcements.stateDismissed, tone: "neutral" },
	};

/**
 * Una fila: el aviso entero y el estado que tiene para esta persona.
 *
 * EL CUERPO VA COMO NODO DE TEXTO, y la razón de decirlo es que la regla no se
 * negocia por pantalla: nunca `dangerouslySetInnerHTML`, nunca markdown. Acá no
 * hay riesgo de XSS como en la landing —el texto que el operador escribe llega
 * como string y React lo escapa— pero la misma regla porque la excepción que se
 * concede una vez es la que aparece en la pantalla siguiente. Lo que el operador
 * escribió se muestra tal cual, sin interpretar nada.
 *
 * Los dos botones salen de `canAcknowledge` y `canDismiss`, no de recalcular la
 * severidad acá: esa decisión ya está tomada en el dominio y volver a tomarla
 * en el componente es la segunda copia de la regla —y de las dos copias solo se
 * corrige la que nadie mira—. Por eso un `info` pendiente no muestra ninguno: su
 * descarte vive en el modal, que es donde está su gesto, y una fila de `info` con
 * botones sugeriría que se puede resolver desde acá algo que no tiene resolución.
 */
function AnnouncementRow({
	item,
	acknowledge,
	silence,
}: {
	item: AnnouncementListItem;
	acknowledge: (id: string) => Promise<void>;
	silence: (id: string) => void;
}) {
	const { colors } = useTheme();
	const chip = CHIP[item.state];
	// El estado del acknowledgement vive en la fila y no en la lista: el fallo es
	// de UN aviso y el mensaje tiene que señalarlo, sin tapar el resto.
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Entender el aviso y, si la escritura falla, dejarlo visible con el motivo.
	 *
	 * El `catch` no es decorativo: `acknowledge` rechaza cuando el servidor no
	 * confirma, y sin esto la promesa se iría sin manejar y la persona vería una
	 * fila «Pendiente» después de haber tocado «Entendido», sin ninguna
	 * explicación de por qué no alcanzó. Es el mismo camino que el dialog: la
	 * lista no escribe, solo informa.
	 */
	async function handleAcknowledge() {
		setPending(true);
		setError(null);
		try {
			await acknowledge(item.announcement.id);
		} catch (e) {
			setError(toAppError(e, strings.announcements.acknowledgeFailed).message);
		} finally {
			setPending(false);
		}
	}

	return (
		<View
			style={[
				styles.card,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<View style={styles.cardHead}>
				<AppText variant="h4" weight="bold" style={styles.cardTitle}>
					{item.announcement.title}
				</AppText>
				<StatusBadge label={chip.label} tone={chip.tone} />
			</View>

			<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
				{item.announcement.body}
			</AppText>

			{item.canAcknowledge || item.canDismiss ? (
				<>
					<View style={styles.actions}>
						{item.canAcknowledge ? (
							<Button
								size="sm"
								loading={pending}
								onPress={() => void handleAcknowledge()}
							>
								{strings.announcements.acknowledge}
							</Button>
						) : null}
						{item.canDismiss ? (
							<Button
								size="sm"
								variant="outline"
								onPress={() => silence(item.announcement.id)}
							>
								{strings.announcements.silence}
							</Button>
						) : null}
					</View>
					{/* La explicación del silencio va solo donde está el botón: en una
					    fila sin gesto no hay nada que aclarar, y repetirla en cada
					    fila convierte la pantalla en un muro de texto. */}
					{item.canDismiss ? (
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{strings.announcements.silenceHint}
						</AppText>
					) : null}
				</>
			) : null}

			{/* `alert` + región viva es lo que hace que el lector de pantalla lo
			    anuncie apenas aparece, sin obligar a recorrer la lista para
			    encontrar qué falló. Mismo criterio que el aviso del modal. */}
			{error ? (
				<View
					style={[
						styles.error,
						{
							backgroundColor: colors.destructiveSurface,
							borderColor: colors.destructiveBorder,
						},
					]}
					accessibilityRole="alert"
					accessibilityLiveRegion="polite"
				>
					<AppText
						variant="bodySmall"
						style={{ color: colors.destructiveVibrant }}
					>
						{error}
					</AppText>
				</View>
			) : null}
		</View>
	);
}

/**
 * La pantalla de «ver todos»: los avisos de esta persona, en el orden en que
 * llegaron, con el estado de cada uno y los dos gestos que corresponden.
 *
 * El ORDEN es el que vino de la consulta y la lista no lo toca. El modal pone
 * los `required` primero; esta pantalla no, y no es una contradicción: es el
 * orden que la persona ya vio al abrir la app y el que espera encontrar después
 * de venir a buscarlos. Reordenar por severidad acá sería una tercera copia de
 * D9/D10.
 *
 * `fallback` lo pasa la ruta y no se calcula acá porque depende del rol —el
 * default de `ScreenHeader` es la home del consumidor, y mandaría al dueño de un
 * negocio a una pantalla que no es suya—, y el rol lo sabe la ruta, que es
 * donde viven los guards.
 */
export function AnnouncementList({ fallback }: { fallback: Href }) {
	const { colors } = useTheme();
	const { items, acknowledge, silence, isLoading, isError, refetch } =
		useAnnouncementList();

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={strings.announcements.listTitle}
					fallback={fallback}
				/>

				{/* El orden de las tres ramas importa y no es intercambio: antes de
				    que la consulta resuelva `items` está vacío, así que preguntar por
				    la lista primero pintaría «no tenés avisos» en cada apertura. */}
				{isError ? (
					<View style={styles.center}>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground, textAlign: "center" }}
						>
							{strings.announcements.listFailed}
						</AppText>
						<Button variant="outline" onPress={() => void refetch()}>
							{strings.common.retry}
						</Button>
					</View>
				) : isLoading ? (
					<LoadingView />
				) : items.length === 0 ? (
					<EmptyState
						title={strings.announcements.listEmptyTitle}
						message={strings.announcements.listEmptyMessage}
					/>
				) : (
					items.map((item) => (
						<AnnouncementRow
							key={item.announcement.id}
							item={item}
							acknowledge={acknowledge}
							silence={silence}
						/>
					))
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
	center: {
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.xl,
	},
	card: {
		borderWidth: 1,
		borderRadius: radii.lg,
		padding: spacing.lg,
		gap: spacing.sm,
	},
	cardHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	cardTitle: { flex: 1 },
	actions: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	error: {
		borderWidth: 1,
		borderRadius: radii.md,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		marginTop: spacing.xs,
	},
});
