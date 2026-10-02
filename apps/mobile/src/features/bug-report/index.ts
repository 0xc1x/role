/**
 * Buzón de reportes de errores desde la app.
 *
 * Lo que se exporta es lo que la Task 8 (la pantalla) va a consumir: leer
 * bytes de una URI, y enviar el reporte. El namespace, la policy y el bucket
 * son de la base —este módulo no los elige— así que no se exportan como
 * constantes que alguien pueda reusar mal.
 */
export {
	detectImageContentType,
	MAX_REPORT_IMAGE_BYTES,
	REPORT_BUCKET,
	reportOriginFor,
} from "./domain/bug-report";
export type {
	LocalImage,
	ReportImageContentType,
} from "./domain/bug-report";
export { readLocalImage, submitBugReport } from "./data/repository";
export type { SubmitBugReportInput } from "./data/repository";
