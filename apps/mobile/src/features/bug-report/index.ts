/**
 * Buzón de reportes de errores desde la app.
 *
 * Lo que la Task 8 (la pantalla) consume son dos funciones: `readLocalImage`
 * para traer los bytes de una URI del picker, y `submitBugReport` para enviar.
 *
 * SOBRE QUÉ SE EXPORTA Y QUÉ NO, porque el comentario es la especificación de
 * esta frontera:
 *
 *  - `REPORT_BUCKET` y `MAX_REPORT_IMAGE_BYTES` SÍ se exportan, y no para que
 *    quien llame construya paths. Se exportan para que el picker de la pantalla
 *    pueda discouraging capturas grandes ANTES de leerlas a bytes, que es
 *    cheaper que descubrir el exceso después de bajarlas del disco. Los usa de
 *    lectura, no de escritura: el path lo arma `submitBugReport`, que es el
 *    único que sabe el uid y el nombre del folder.
 *  - `namespace` NO se exporta. Es `'bug_report'` y está fijo en el
 *    repositorio: es el ÚNICO namespace que el cliente puede escribir según la
 *    policy, y sacarlo del alcance del llamador es lo que impide que alguien
 *    escriba en la bandeja de contactos.
 *  - `reportOriginFor` se exporta por testabilidad, no porque la pantalla
 *    pueda elegir el origen. El canal es un dato de plataforma; si la pantalla
 *    pudiera declararlo, un cliente podría reportar en otro canal.
 *
 * O sea: se exportan los LÍMITES porque la pantalla los necesita para no
 * desperdiciar red, y no se exporta lo que la pantalla no tiene derecho a
 * decidir.
 */
export {
	detectImageContentType,
	MAX_REPORT_IMAGE_BYTES,
	MAX_REPORT_IMAGES,
	REPORT_BUCKET,
	reportOriginFor,
} from "./domain/bug-report";
export type {
	LocalImage,
	ReportImageContentType,
} from "./domain/bug-report";
export { readLocalImage, submitBugReport } from "./data/repository";
export type { SubmitBugReportInput } from "./data/repository";
