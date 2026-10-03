import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { ImagePlus, X } from "lucide-react-native";
import { toast } from "sonner-native";

import { Button } from "@/components/ui/button";
import { strings } from "@/src/core/i18n/strings";
import { Errors } from "@/src/core/error/app-error";
import { toAppError } from "@/src/core/error/mapper";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText, BottomSheetModal, TextField } from "@/src/core/ui";
import {
	MAX_REPORT_IMAGE_BYTES,
	MAX_REPORT_IMAGES,
	type LocalImage,
	readLocalImage,
	submitBugReport,
} from "@/src/features/bug-report";
import { pickWebImage } from "@/src/features/business/utils/pick-image";

/**
 * Una captura adjunta.
 *
 * `uri` y `image` son las dos mitades de lo mismo y las dos se usan: la URI
 * es lo que se PINTA (la miniatura que el usuario revisa para confirmar que
 * adjuntó la captura correcta) y los bytes son lo que se ENVÍA. Un `blob:` en
 * web no se puede volver a leer después del `fetch` de `readLocalImage`, así
 * que la URI no es redundante con los bytes: es la única referencia a la
 * imagen que queda en la pantalla.
 */
interface Capture {
	uri: string;
	image: LocalImage;
}

/**
 * Lo que devuelve el picker: la URI y el tamaño que ÉL declara.
 *
 * `fileSize` es una pista y no una medida: el veredicto lo da
 * `localImageFromBytes` sobre los bytes. Sirve para no leer de disco lo que ya
 * se sabe que se va a rechazar.
 */
interface PickedAsset {
	uri: string;
	fileSize?: number;
}

/**
 * La captura del picker, con la misma bifurcación nativo/web que
 * `ProductForm.pickImage`. En web `expo-image-picker` abre el diálogo con un
 * click sintético sin user activation y nunca abre, así que el input nativo
 * de `pick-image.ts` es el que funciona ahí.
 *
 * LO QUE NO SE DUPLICA: el tope de escrituras. Acá se avisa, y el corte de
 * verdad lo hace `assertReportImageCount` adentro de `submitBugReport`, que
 * corre antes de subir la primera captura. El picker es una puerta, no una
 * frontera.
 */
async function pickCaptures(): Promise<PickedAsset[]> {
	if (Platform.OS === "web") {
		const uri = await pickWebImage();
		return uri ? [{ uri }] : [];
	}
	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes: ["images"],
		quality: 0.8,
		allowsMultipleSelection: true,
		selectionLimit: MAX_REPORT_IMAGES,
	});
	if (result.canceled) return [];
	return result.assets.map((asset) => ({
		uri: asset.uri,
		fileSize: asset.fileSize,
	}));
}

/**
 * El formulario del buzón de reportes de errores.
 *
 * LA REGLA QUE ORGANIZA TODO EL COMPONENTE: el texto que escribió el usuario
 * no se pierde nunca. Ningún camino de esta pantalla vacía `summary` ni
 * `description`, y el que cierra el ciclo es `handleSubmit`, que no limpia
 * nada ni en el éxito ni en el error —el éxito cierra el sheet, y el error
 * pinta el motivo y deja el texto donde está, listo para reintentar—.
 *
 * POR QUÉ EL ERROR NO SE MUESTRA EN EL `error` DEL CAMPO: `TextField` pinta su
 * `error` como texto bajo la caja, y un error de subida no pertenece a ningún
 * campo en particular. Va en una caja con `accessibilityRole="alert"` arriba
 * del formulario, que es lo que anuncia el lector de pantalla sin obligar al
 * usuario a recorrer los campos para encontrar el culpable.
 */
export function ReportProblemSheet({
	visible,
	onClose,
}: {
	visible: boolean;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const [summary, setSummary] = useState("");
	const [description, setDescription] = useState("");
	const [captures, setCaptures] = useState<Capture[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [imageError, setImageError] = useState<string | null>(null);
	// El estado de carga NO es la frontera del envío: se pinta en el botón
	// (`loading`) y no se usa para decidir si se puede volver a tocar. El
	// `sendingRef` de abajo es el que decide, y es síncrono.
	const [sending, setSending] = useState(false);
	// Guard síncrono, no un estado: dos toques en el mismo frame se comparten la
	// clausura de `sending`, así que un chequeo por estado dejaría pasar el
	// segundo. Es el mismo motivo por el que `SocialAuthButtons.handlePress`
	// lleva `busyRef` al lado de su estado de carga.
	const sendingRef = useRef(false);
	// El otro guard síncrono, y por la misma razón: la ventana del picker
	// nativo es de segundos, mucho más larga que un envío, y dos toques ahí
	// abren dos `handleAddCaptures` a la vez. Un estado no alcanza porque el
	// estado solo se refresca en el re-render, que todavía no ocurrió.
	const pickingRef = useRef(false);

	if (!visible) return null;

	const handleAddCaptures = async () => {
		// El envío gana: durante la subida el formulario no se toca.
		if (sendingRef.current || pickingRef.current) return;
		const slots = MAX_REPORT_IMAGES - captures.length;
		// Puerta, no frontera: si el usuario ya llenó los cinco lugares, ni se
		// abre el picker. El número en pantalla (`imageCount`) y el mensaje le
		// dicen por qué.
		if (slots <= 0) {
			setImageError(strings.bugReport.errorTooManyImages);
			return;
		}
		pickingRef.current = true;
		setImageError(null);
		try {
			let picked: PickedAsset[];
			try {
				picked = await pickCaptures();
			} catch (e) {
				setImageError(
					toAppError(e, strings.bugReport.errorImageNotSupported).message,
				);
				return;
			}
			if (picked.length === 0) return;

			const read: Capture[] = [];
			let firstFailure: string | null = null;
			// react-doctor-disable-next-line react-doctor/async-await-in-loop -- sequential on purpose: this reads each file's BYTES into memory, so awaiting them together would hold every picked image at once, which on a low-end phone is the OOM this loop exists to avoid
			for (const asset of picked) {
				try {
					// El descarte por tamaño declarado es la razón de que
					// `MAX_REPORT_IMAGE_BYTES` esté exportado: leer 40 MB del disco
					// para después rechazar la captura es trabajo tirado. El error
					// que se levanta es el mismo `validation` con el mismo copy que
					// levanta `localImageFromBytes` leyendo los bytes de verdad, así
					// que el atajo del picker no puede divergir del veredicto.
					// Cuando el picker no declara tamaño, el corte igual cae adentro
					// de `localImageFromBytes`.
					if (
						asset.fileSize !== undefined &&
						asset.fileSize > MAX_REPORT_IMAGE_BYTES
					) {
						throw Errors.validation(strings.bugReport.errorImageTooLarge);
					}
					read.push({
						uri: asset.uri,
						// react-doctor-disable-next-line react-doctor/async-await-in-loop -- SECUENCIAL A PROPÓSITO: esto lee los BYTES del archivo a memoria, así que awaitearlos juntos tendría todas las capturas en memoria al mismo tiempo, que en un teléfono de gama baja es el OOM que el loop de arriba existe para evitar. El costo —una captura por vez— es deliberado; un Promise.all pasaría el gate y empeoraría el comportamiento en el dispositivo real
						image: await readLocalImage(asset.uri),
					});
				} catch (e) {
					// UNA captura mala no descarta las buenas ni el texto: el reporte
					// se manda igual con lo que se pudo leer, y el motivo queda a la
					// vista para que el usuario decida si reintenta esa sola.
					firstFailure ??= toAppError(
						e,
						strings.bugReport.errorImageNotSupported,
					).message;
				}
			}

			if (read.length > 0) {
				// EL TOPE SE CORTA ADENTRO DEL UPDATER, y no con el `slots` de
				// arriba. `slots` se calculó ANTES de esperar al picker: si
				// cualquier otra cosa agrega capturas mientras este await está
				// abierto, `slots` quedó viejo y dos manos suman sobre el mismo
				// margen.
				//
				// El `pickingRef` de arriba ya cierra esa puerta para los toques
				// de este botón, y el corte va acá igual porque el tope es una
				// regla de escritura que no depende de qué compiló la llamada:
				// es el mismo contrato que el `slots <= 0` de arriba y que el
				// `assertReportImageCount` del repositorio, y los tres tienen que
				// decir 5.
				//
				// Recorta contra `prev`, que es el estado real, y no contra la
				// lista entera: recortar la entera dejaría fuera las capturas que
				// el usuario ya adjuntó y el contador quedaría mintiendo.
				setCaptures((prev) => {
					const room = MAX_REPORT_IMAGES - prev.length;
					return room > 0 ? [...prev, ...read.slice(0, room)] : prev;
				});
			}
			setImageError(firstFailure);
		} finally {
			pickingRef.current = false;
		}
	};

	const handleSubmit = async () => {
		if (sendingRef.current) return;
		// El resumen es el ancla del schema de lectura del API: sin él la fila
		// se marca ilegible y el operador no ve nada. `normalizeSummary` lo
		// exige de nuevo adentro del repositorio, que es la frontera; acá solo
		// se evita gastar el gesto de envío en un formulario que no puede
		// llegar.
		if (!summary.trim()) {
			setError(strings.bugReport.errorSummaryRequired);
			return;
		}
		sendingRef.current = true;
		setSending(true);
		setError(null);
		try {
			await submitBugReport({
				summary,
				description,
				images: captures.map((capture) => capture.image),
			});
			// El éxito cierra y nada más: si limpiara los campos acá, un
			// reintento posterior del mismo usuario arrancaría con un formulario
			// vacío y sin explicación de por qué.
			// El toast va ANTES del cierre porque `onClose` desmonta el sheet, y
			// el `Toaster` está en el layout raíz: si se disparara después, el
			// componente que lo dispara ya no estaría montado.
			toast.success(strings.bugReport.submitted);
			onClose();
		} catch (e) {
			// acá no se toca `summary` ni `description`: el texto se queda. Es
			// el punto entero de este catch.
			setError(toAppError(e, strings.bugReport.errorSubmitFailed).message);
		} finally {
			sendingRef.current = false;
			setSending(false);
		}
	};

	return (
		<BottomSheetModal title={strings.bugReport.title} onClose={onClose}>
			{error ? <ErrorNote message={error} /> : null}

			<TextField
				label={strings.bugReport.summaryLabel}
				hint={strings.bugReport.summaryHint}
				value={summary}
				onChangeText={setSummary}
			/>
			<TextField
				label={strings.bugReport.descriptionLabel}
				hint={strings.bugReport.descriptionHint}
				value={description}
				onChangeText={setDescription}
				multiline
				numberOfLines={4}
			/>

			<View style={styles.capturesHeader}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.bugReport.imageCount
						.replace("{n}", String(captures.length))
						.replace("{max}", String(MAX_REPORT_IMAGES))}
				</AppText>
			</View>

			{/* Las miniaturas son la razón de que `Capture` guarde la URI. Sin
			    ellas el usuario adjunta hasta cinco archivos, no ve ninguno y no
			    puede quitar uno en particular: tendría que adivinar cuál sobra.
			    La `Image` es de `expo-image` y no `react-native` porque es la que
			    resuelve las URIs `file://` de nativo y `blob:` de web. */}
			{captures.length > 0 ? (
				<View style={styles.thumbnails}>
					{/* La key es la URI y no el índice a propósito: quitar una
					    miniatura del medio tiene que sacar ESA de la lista y no
					    shiftingar las siguientes. El índice como key haría que
					    React reutilizara el nodo de la que se quedó con el
					    contenido de la otra. La URI es única por captura: el picker
					    nativo devuelve una por archivo y `pickWebImage` una por
					    `URL.createObjectURL`. */}
					{captures.map((capture, index) => (
						<CaptureThumb
							key={capture.uri}
							capture={capture}
							index={index}
							onRemove={() =>
								setCaptures((prev) => prev.filter((_, i) => i !== index))
							}
						/>
					))}
				</View>
			) : null}

			<Button
				variant="outline"
				// NO se deshabilita al llegar a cinco: deshabilitado no explica
				// nada, y el contador de arriba es el que informa que ya no hay
				// lugar. El botón se sigue dejando tocar y es el `slots <= 0`
				// del handler el que responde con el motivo, así que el usuario
				// sabe por qué su toque no abrió nada.
				disabled={sending}
				accessibilityRole="button"
				accessibilityLabel={strings.bugReport.addImage}
				onPress={() => void handleAddCaptures()}
				icon={<ImagePlus size={16} color={colors.foreground} />}
			>
				{strings.bugReport.addImage}
			</Button>

			{imageError ? <ErrorNote message={imageError} /> : null}

			<Button
				fullWidth
				loading={sending}
				accessibilityRole="button"
				accessibilityLabel={strings.bugReport.submit}
				onPress={() => void handleSubmit()}
			>
				{strings.bugReport.submit}
			</Button>
		</BottomSheetModal>
	);
}

/**
 * Una miniatura con su botón de quitar.
 *
 * El botón va con `accessibilityLabel` y no con `aria-label` para que los tres
 * botones de la pantalla usen la misma grafía. Los dos atributos funcionan en
 * RN y RNW, y `accessibilityLabel` es el que se propaga al `alt`/`aria-label`
 * del input en web, que es lo mismo que hace `TextField` con su `label`.
 *
 * El label lleva el número de la captura porque hay varios botones iguales: sin
 * índice, el lector de pantalla anuncia cinco veces "Quitar captura" y el
 * usuario no puede saber cuál va a quitar.
 */
function CaptureThumb({
	capture,
	index,
	onRemove,
}: {
	capture: Capture;
	index: number;
	onRemove: () => void;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.thumb,
				{ borderColor: colors.borderSolid, backgroundColor: colors.muted },
			]}
		>
			<Image
				source={{ uri: capture.uri }}
				style={styles.thumbImage}
				contentFit="cover"
				accessibilityLabel={strings.bugReport.captureAlt.replace(
					"{n}",
					String(index + 1),
				)}
			/>
			<Pressable
				onPress={onRemove}
				accessibilityRole="button"
				accessibilityLabel={strings.bugReport.removeImage.replace(
					"{n}",
					String(index + 1),
				)}
				hitSlop={6}
				style={[styles.thumbRemove, { backgroundColor: colors.background }]}
			>
				<X size={12} color={colors.foreground} />
			</Pressable>
		</View>
	);
}

/**
 * La caja de un error de la pantalla, sea del resumen o de una captura.
 *
 * `accessibilityRole="alert"` + `accessibilityLiveRegion="polite"` es lo que
 * hace que el lector de pantalla anuncie el motivo apenas aparece: sin eso el
 * texto se pinta y el usuario tiene que volver a recorrer el formulario para
 * encontrar qué falló. Va como componente propio y no inline dos veces porque
 * las dos cajas tienen que ser idénticas también en a11y.
 */
function ErrorNote({ message }: { message: string }) {
	const { colors } = useTheme();
	// El mensaje llega tal cual, sin resolver placeholders: los errores de esta
	// pantalla los arma el dominio y su copy ya viene cerrado. Los `{n}` de los
	// labels de las miniaturas sí se resuelven acá adentro, en el punto que los
	// compone.
	return (
		<View
			style={[
				styles.errorBox,
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
	errorBox: {
		borderWidth: 1,
		borderRadius: radii.md,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
	},
	capturesHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	// Las miniaturas van en una fila que envuelve: son de ancho fijo para que
	// los botones de quitar no se mueven al agregar otra, y con `flexWrap` las
	// que no entran bajan de renglón en vez de desbordar el sheet.
	thumbnails: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	thumb: {
		width: 64,
		height: 64,
		borderRadius: radii.md,
		borderWidth: 1,
		overflow: "hidden",
	},
	thumbImage: { width: "100%", height: "100%" },
	thumbRemove: {
		position: "absolute",
		top: 2,
		right: 2,
		width: 20,
		height: 20,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
});
