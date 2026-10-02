import { File } from "expo-file-system";
import { Platform } from "react-native";

import { Errors } from "@/src/core/error/app-error";
import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { supabase } from "@/src/core/supabase/client";

import {
	assertReportImageCount,
	extensionFor,
	localImageFromBytes,
	normalizeDescription,
	normalizeSummary,
	type LocalImage,
	reportOriginFor,
	REPORT_BUCKET,
} from "../domain/bug-report";

/**
 * Namespace del buzón. Viaja constante y no entra en la firma de
 * `submitBugReport`: es el ÚNICO `namespace` que el cliente puede escribir, y
 * sacarlo del alcance del llamador es lo que impide que un cliente directedo a
 * la bandeja de contactos.
 */
const BUG_REPORT_NAMESPACE = "bug_report";

export interface SubmitBugReportInput {
	summary: string;
	description?: string;
	/**
	 * Capturas ya leídas a bytes. `submitBugReport` NO recibe URIs porque no
	 * puede validar tamaño sin leer los bytes: el límite de 5 MB se comprueba
	 * sobre el contenido, no sobre el nombre del archivo.
	 */
	images: LocalImage[];
}

/**
 * Identificador único por captura dentro del reporte.
 *
 * `crypto.randomUUID` es lo que da Expo en los tres plataformas; el fallback es
 * para el caso de que no exista, y NO es criptográfico: solo tiene que evitar
 * que dos capturas del mismo reporte se pisen en el bucket, y lo que las separa
 * de verdad es el folder scopeado al uid.
 */
function captureId(): string {
	// `?.` y no acceso directo: Hermes NO garantiza `globalThis.crypto`, y
	// `orders/data/repository.ts:133` accede directo y trunca cuando falta. La
	// forma segura es la de `profile/data/repository.ts:269`.
	const webCrypto = globalThis.crypto as
		| { randomUUID?: () => string }
		| undefined;
	if (typeof webCrypto?.randomUUID === "function")
		return webCrypto.randomUUID();
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Lee los bytes de una URI de imagen y los valida como `LocalImage`.
 *
 * La bifurcación nativo/web es la MISMA de `uploadImage` en
 * `business/data/repository.ts` y el motivo está en el picker, no en el
 * protocolo: en web `expo-image-picker` devuelve URIs `blob:`/`data:` que
 * `File` no puede abrir, así que hay que `fetch`earlas. En nativo la URI es un
 * archivo de disco y `File` la abre directo.
 *
 * LA ASIMETRÍA DEL `!response.ok` ES ACEPTABLE, y a propósito. Solo la rama web
 * tiene estado HTTP que mirar: `fetch` resuelve con 404 y cuerpo de error, así
 * que sin ese chequeo una URI muerta produciría bytes que no son una imagen y el
 * fallo aparecería como "formato no soportado", que manda al usuario a retocar
 * una captura que en realidad no existe. En nativo no hay equivalente que
 * revisar: `File` lanza o devuelve el archivo, no hay respuesta que inspeccionar,
 * y su error ya es un `Error` que `toAppError` mapea a la taxonomía. Una guarda
 * simétrica en nativo sería código que nunca cambia de rama.
 */
export async function readLocalImage(uri: string): Promise<LocalImage> {
	let bytes: ArrayBuffer;
	if (Platform.OS === "web") {
		const response = await fetch(uri);
		if (!response.ok) {
			throw toAppError(
				new Error(`fetch imagen: ${response.status}`),
				strings.bugReport.errorImageNotSupported,
			);
		}
		bytes = await response.arrayBuffer();
	} else {
		bytes = await new File(uri).arrayBuffer();
	}
	return localImageFromBytes(bytes);
}

/**
 * Sube una captura al bucket privado y devuelve la RUTA que se guarda en la
 * fila.
 *
 * Se devuelve la ruta y NO una URL, y la diferencia es el punto entero de que
 * el bucket sea privado: una ruta no descarga nada sin la firma que emite el
 * API. Una URL pública aquí sería un agujero con el texto del bug dentro.
 */
async function uploadCapture(
	ownerId: string,
	image: LocalImage,
): Promise<string> {
	// Defensa en profundidad: `submitBugReport` es la única puerta y ya recibe
	// `LocalImage` validados por tipo, pero el límite de tamaño y el sniffing se
	// vuelven a correr acá porque son una regla de escritura que no depende del
	// que compiló la llamada.
	const validated = localImageFromBytes(image.bytes);
	const path = `${ownerId}/report/${captureId()}.${extensionFor(validated.contentType)}`;

	const { error } = await supabase.storage
		.from(REPORT_BUCKET)
		.upload(path, validated.bytes, {
			contentType: validated.contentType,
			upsert: false,
		});
	if (error) {
		throw toAppError(error, strings.bugReport.errorImageUploadFailed);
	}
	return path;
}

/**
 * Escribe un reporte de error en `app_store` desde el móvil.
 *
 * POR QUÉ ESTE CAMINO Y NO EL API: es la regla del monorepo —el móvil es
 * consumidor directo de Supabase y RLS es la frontera de datos—, y la base lo
 * habilitó: la única policy de insert sobre `app_store` es para `authenticated`
 * y es la que este código cumple. Un bug reportado tiene que llegar aunque el
 * API esté caído, que es exactamente cuando más se reporta.
 *
 * EL ORDEN ES LOAD-BEARING: primero el bucket, después la fila. Al revés la
 * fila apuntaría a capturas que todavía no existen, y el operador abriría un
 * reporte sin evidencia. Y si una captura falla, no se inserta nada: es
 * preferible un reporte que el usuario reintenta a uno que llega incompleto.
 *
 * `reporter_id` NO viaja, a propósito. El trigger `stamp_bug_reporter` lo sella
 * con `auth.uid()` en un BEFORE INSERT. Mandarlo no rompe nada —el trigger lo
 * sobreescribe— pero haría creer que es input del cliente, que es justo el
 * error que el trigger previene: un cliente podría escribir en el buzón de
 * contactos y hacerme pasar por otro.
 *
 * Lo mismo con `state` y `origin`: ninguno tiene default, así que omitirlos
 * haría que la policy los evaluara a NULL y fallara la inserción entera, con un
 * error de policy en vez de algo legible. Se mandan siempre.
 */
export async function submitBugReport(
	input: SubmitBugReportInput,
): Promise<void> {
	const summary = normalizeSummary(input.summary);
	const description = normalizeDescription(input.description);
	// El tope de capturas va AQUÍ y no solo en el picker de la pantalla: el picker
	// es una puerta, esta función es la frontera, y una frontera sin tope escribe
	// filas que el schema de lectura va a marcar ilegibles — con el texto del
	// usuario dentro de una fila que el operador nunca ve.
	assertReportImageCount(input.images.length);

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user?.id) {
		throw Errors.unauthorized(strings.bugReport.errorNotSignedIn);
	}

	const paths: string[] = [];
	for (const image of input.images) {
		paths.push(await uploadCapture(user.id, image));
	}

	const { error } = await supabase.from("app_store").insert({
		namespace: BUG_REPORT_NAMESPACE,
		value: {
			summary,
			description,
			images: paths,
			at: new Date().toISOString(),
		},
		delivery_status: "PENDIENTE",
		state: "ABIERTO",
		origin: reportOriginFor(Platform.OS),
	});
	if (error) {
		throw toAppError(error, strings.bugReport.errorSubmitFailed);
	}
}
