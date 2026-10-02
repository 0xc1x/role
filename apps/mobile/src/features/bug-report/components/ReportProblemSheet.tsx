import { useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImagePlus, Undo2 } from "lucide-react-native";

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

/** Una captura adjunta, con la URI que la entregó el picker. */
interface Capture {
	uri: string;
	image: LocalImage;
}

/**
 * El picker devuelve la URI; la frontera los bytes. Se guardan las dos porque
 * `submitBugReport` habla en bytes (no puede validar tamaño sin leerlos) y
 * porque la URI es lo único que identifica la captura ante el usuario.
 */
interface PickedAsset {
	uri: string;
	/**
	 * Tamaño declarado por el picker, si lo declara. Es una pista, no una
	 * medida: el veredicto lo da `localImageFromBytes` sobre los bytes.
	 */
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

	if (!visible) return null;

	const handleAddCaptures = async () => {
		if (sendingRef.current) return;
		const slots = MAX_REPORT_IMAGES - captures.length;
		// Puerta, no frontera: si el usuario ya llenó los cinco lugares, ni se
		// abre el picker. El número en pantalla (`imageCount`) y el mensaje le
		// dicen por qué.
		if (slots <= 0) {
			setImageError(strings.bugReport.errorTooManyImages);
			return;
		}
		setImageError(null);
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
		for (const asset of picked) {
			try {
				// El descarte por tamaño declarado es la razón de que
				// `MAX_REPORT_IMAGE_BYTES` esté exportado: leer 40 MB del disco
				// para después rechazar la captura es trabajo tirado. El error
				// que se levanta es el mismo `validation` con el mismo copy que
				// levanta `localImageFromBytes` leyendo los bytes de verdad, así
				// que el atajo del picker no puede divergir del veredicto. Cuando
				// el picker no declara tamaño, el corte igual cae adentro de
				// `localImageFromBytes`.
				if (
					asset.fileSize !== undefined &&
					asset.fileSize > MAX_REPORT_IMAGE_BYTES
				) {
					throw Errors.validation(strings.bugReport.errorImageTooLarge);
				}
				read.push({ uri: asset.uri, image: await readLocalImage(asset.uri) });
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
		// El recorte va sobre lo NUEVO y contra los lugares que quedaban, no sobre
		// la lista entera: recortarla entera dejaría fuera las capturas que el
		// usuario ya adjuntó y el contador quedaría mintiendo.
		//
		// El picker nativo puede devolver más de lo que sobraba (seleccionó cinco
		// con tres lugares libres) y sin este recorte el envío llevaría más de
		// `MAX_REPORT_IMAGES`, que `assertReportImageCount` rechaza: el reporte
		// entero se perdería, resumen y descripción incluidos, por un par de
		// capturas de más.
		if (read.length > 0)
			setCaptures((prev) => [...prev, ...read.slice(0, slots)]);
		setImageError(firstFailure);
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
				{captures.length > 0 ? (
					<Button
						variant="ghost"
						size="icon"
						hitSlop={8}
						accessibilityRole="button"
						aria-label={strings.bugReport.removeImage}
						onPress={() => setCaptures((prev) => prev.slice(0, -1))}
						icon={<Undo2 size={16} color={colors.mutedForeground} />}
					/>
				) : null}
			</View>

			<Button
				variant="outline"
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
});
