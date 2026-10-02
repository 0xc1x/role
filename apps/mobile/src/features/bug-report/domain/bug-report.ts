import { Errors } from "@/src/core/error/app-error";

import { strings } from "@/src/core/i18n/strings";

/**
 * Vocabulario de la captura adjunta a un reporte de errores.
 *
 * Los tres MIME salen del bucket `bug_report_images`
 * (`allowed_mime_types`), no de una preferencia del cliente: si mañana el bucket
 * acepta otro formato, la lista se cambia acá y en la migración, en el mismo
 * commit, porque son las dos puntas de un mismo acuerdo.
 */
export type ReportImageContentType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Bucket PRIVADO de capturas (`public = false`).
 *
 * El nombre va acá y no repetido en el `.from()` porque el path del objeto se
 * arma con este mismo valor, y un bucket y otro distintos en el mismo archivo es
 * exactamente la clase de bug que nadie encuentra.
 */
export const REPORT_BUCKET = "bug_report_images";

/**
 * Tope por archivo, en bytes. Sale de `file_size_limit` del bucket
 * (5.242.880 = 5 MB), NO de una constante de la app.
 *
 * POR QUÉ SE VALIDA ACÁ Y NO SOLO EN EL SERVIDOR, cuando
 * `business/data/repository.ts::uploadImage` NO valida tamaño y se apoya en que
 * Storage rechace: ahí una fotoRejected no cuesta nada, el usuario ya está en la
 * pantalla de publicación y puede reintentarlo. Acá el usuario ya escribió el
 * resumen y la descripción, y un rechazo del servidor llega DESPUÉS de haber
 * subido bytes: perder la pantalla por un byte de más es un costo que el cliente
 * puede evitar antes de gastar la red.
 */
export const MAX_REPORT_IMAGE_BYTES = 5_242_880;

/**
 * Captura ya leída de disco, con su MIME VERIFICADO por magic bytes.
 *
 * El `contentType` no es el que declaró el picker: es el que salió de
 * `detectImageContentType`. Un string sin firma reconocible nunca llega a
 * construirse (ver `localImageFromBytes`), así que este tipo no puede mentir.
 */
export interface LocalImage {
	bytes: ArrayBuffer;
	contentType: ReportImageContentType;
}

/** Extensión del objeto en el bucket, derivada del MIME ya verificado. */
export function extensionFor(contentType: ReportImageContentType): string {
	switch (contentType) {
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/jpeg":
			return "jpg";
	}
}

/**
 * Sniffing por magic bytes. Devuelve `null` si la firma no es de una imagen
 * reconocida.
 *
 * ES LO MISMO que `detectImageContentType` en
 * `features/business/data/repository.ts`, y está duplicado a propósito: cruzar
 * de un módulo de feature a otro para una función de veinte líneas ata el buzón
 * de errores a la publicación de productos, y las dos van a divergir (el bucket
 * de producto admite más formatos que éste). La forma, no el nombre, es la que
 * se reusa.
 *
 * NO se confía en el `mimeType` que devuelve `expo-image-picker`: lo fija el
 * que exportó el archivo, y en Android un `.jpg` renombrado desde cualquier
 * cosa llega como `image/jpeg`. Los primeros bytes no se renombran.
 */
export function detectImageContentType(
	bytes: ArrayBuffer,
): ReportImageContentType | null {
	if (bytes.byteLength < 3) return null;
	const data = new Uint8Array(bytes);

	// JPEG: FF D8 FF. El tercer byte separa el SOI de un marcador, y por eso el
	// prefijo completo de tres.
	if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
		return "image/jpeg";
	}
	// PNG: 89 50 4E 47. Los cuatro, porque `50 4E` a secas es un prefijo de
	// cualquier formato de archivo.
	if (
		data.byteLength >= 4 &&
		data[0] === 0x89 &&
		data[1] === 0x50 &&
		data[2] === 0x4e &&
		data[3] === 0x47
	) {
		return "image/png";
	}
	// WebP: un contenedor RIFF (bytes 0-3) cuya etiqueta de formato (bytes 8-11)
	// es WEBP. Los bytes 4-7 son el tamaño del contenedor, que no se mira.
	if (
		data.byteLength >= 12 &&
		String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...data.slice(8, 12)) === "WEBP"
	) {
		return "image/webp";
	}
	return null;
}

/**
 * Valida el resumen y devuelve el texto recortado.
 *
 * El recorte no es cosmetía: lo que se inserta en `value.summary` es lo que sale
 * en la columna del panel, así que sin recortar un espacio inicial sobreviviría
 * hasta el listado. Y sin el corte a vacío, una fila con `"   "` llegaría al
 * buzón del operador como un reporte sin texto.
 *
 * NO hay `.max()` de longitud, y es deliberado: el schema de lectura en commons
 * no lo tiene y no puede perder texto que el usuario sí puede leer. El tope de
 * caracteres, si algún día hace falta, es regla de escritura y vive acá.
 */
export function normalizeSummary(summary: string): string {
	const trimmed = summary.trim();
	if (!trimmed) throw Errors.validation(strings.bugReport.errorSummaryRequired);
	return trimmed;
}

/**
 * La descripción es opcional, así que en blanco se normaliza a `null` y no a
 * `""`. El schema de commons la declara `nullish` y el panel la pinta como
 * columna: una cadena vacía se vería como una descripción que el usuario escribió
 * y no escribió.
 */
export function normalizeDescription(
	description: string | undefined,
): string | null {
	const trimmed = description?.trim();
	return trimmed ? trimmed : null;
}

/**
 * Bytes crudas → `LocalImage`, o error antes de gastar un byte de red.
 *
 * El orden de las dos validaciones es el que importa: el TAMAÑO se mira antes
 * que el MIME, porque un archivo de 40 MB es un caso más común y más caro de
 * resolver, y el sniff de sus primeros bytes no informa nada que no informs de
 * una imagen de 6 MB. Se rechaza el peor caso primero.
 */
export function localImageFromBytes(bytes: ArrayBuffer): LocalImage {
	if (bytes.byteLength > MAX_REPORT_IMAGE_BYTES) {
		throw Errors.validation(strings.bugReport.errorImageTooLarge);
	}
	const contentType = detectImageContentType(bytes);
	if (!contentType) {
		throw Errors.validation(strings.bugReport.errorImageNotSupported);
	}
	return { bytes, contentType };
}

/**
 * `Platform.OS` → el `origin` que la policy de insert ADMITE.
 *
 * LA POLICY MANDA, y esto es lo que obliga el mapeo: la única policy de insert
 * sobre `app_store` acepta `('ios','android','pwa')`. `web` NO está, aunque sea
 * un valor del enum `entry_origin` y aunque `Platform.OS` devuelva exactamente
 * `"web"` en el navegador. Mandar `web` no produce un reporte raro: produce una
 * violación de policy, o sea que EN WEB no se podría guardar ningún reporte.
 *
 * Por eso el PWA mapea a `pwa`: el enum tiene los dos nombres y la policy
 * admite el que describe al cliente móvil instalado como web app, que es el
 * canal que el PWA realmente es. `web` queda para un futuro escritor de otra
 * superficie (la landing), que sí tendría que migrar la policy antes.
 *
 * `state` y `origin` no tienen DEFAULT en la base, y esa es la segunda mitad del
 * asunto: si el insert los omite, la policy los evalúa a NULL y falla. Por eso
 * el repositorio los manda siempre, y este mapper es lo que garantiza que el
 * valor sea uno de los tres admitidos.
 *
 * Lo que NO se hace acá: preguntarle al usuario. El canal es un dato de la
 * plataforma, no una preferencia, y por eso no entra en la firma de
 * `submitBugReport` — un cliente que puede declarar su propio origen es un
 * cliente que puede escribir en otro canal.
 */
/**
 * Tope de capturas por reporte, en ESCRITURA.
 *
 * EL NÚMERO ESTÁ REPETIDO A PROPÓSITO, y es el mismo que el `.max(5)` de
 * `BugReportValueSchema` (lectura). No es una coincidencia ni una constante
 * compartida a futuro: hoy los dos tienen que decir 5.
 *
 * POR QUÉ HAY UN TOPE DE ESCRITURA CUANDO EL DE LECTURA NO DEBERÍA SER UNO.
 * El de lectura existe para proteger el recurso del servidor —el API firma una
 * URL por imagen y N capturas son N llamadas a Storage con service role— y por
 * eso el schema acepta que la fila se marque ilegible: es el precio de no
 * dejar crecer ese vector. El de escritura protege el TEXTO DEL USUARIO, que es otra
 * cosa: sin este tope, un usuario que adjunta 6 capturas obtiene una fila que
 * SÍ entra a la base y que el operador ve como `readable: false`. Perdía el
 * resumen y la descripción sin que nadie le dijera por qué. El reporte malo
 * tiene que seguir existiendo; el reporte invisible no puede ser el precio de
 * un contador.
 *
 * Y por eso el rechazo es `validation` con un mensaje que dice el número: el
 * usuario puede quitar una captura y reintentar. El picker de la pantalla
 * (Task 8) puede y debe avisar antes, pero no es la única puerta: esta función
 * es la frontera, y una frontera sin tope deja pasar la fila ilegible.
 */
export const MAX_REPORT_IMAGES = 5;

/**
 * Rechaza el exceso de capturas ANTES de subir la primera.
 *
 * El orden es el que da valor a la función: subir y después contar deja cinco
 * objetos huérfanos en el bucket y ninguna fila, que es el peor de los dos
 * mundos. Por eso valida el largo de una vez y no dentro del loop de subida.
 */
export function assertReportImageCount(count: number): void {
	if (count > MAX_REPORT_IMAGES) {
		throw Errors.validation(strings.bugReport.errorTooManyImages);
	}
}

export function reportOriginFor(os: string): "ios" | "android" | "pwa" {
	if (os === "ios") return "ios";
	if (os === "android") return "android";
	// Web, PWA y cualquier plataforma futura: el único valor no-nativo que la
	// policy admite. Un escritorio que reportara quedaría como `pwa`, que es
	// mentiroso pero es la única forma honesta de que la fila exista.
	return "pwa";
}
