/**
 * Serialización y descarga de CSV para los listados del back office.
 *
 * POR QUÉ ESTE HELPER ES GENÉRICO Y NO DE DOMINIO: el formato de un archivo no
 * sabe qué es un corte de pago. Solo sabe escapar, serializar y descargar, y lo
 * sabe bien: el escapado, el BOM y la neutralización de fórmulas son detalles que
 * se prueban una vez y no se pueden dejar a criterio de cada tabla.
 * Lo específico de cada dominio (qué columnas, en qué orden, cómo se formatea un
 * importe) vive junto a sus `*.columns.tsx`, en el mismo archivo y el mismo orden
 * que la tabla que el operador está mirando.
 */

/**
 * Excel no asume UTF-8 por defecto: sin BOM, «ó» y «ñ» llegan rotos
 * (`Pegatina mÃ¡s妎` en vez de `Mascarilla`). El BOM es lo que le dice "esto es
 * UTF-8" y no se ve al abrir el archivo.
 */
export const CSV_BOM = "\uFEFF";

/**
 * Inyección de fórmulas (OWASP CSV Injection).
 *
 * Una hoja de cálculo interpreta como fórmula toda celda de texto que empieza
 * por `=`, `+`, `-` o `@`. Como el back office exporta texto libre de terceros
 * (nombres de negocio, títulos de oferta, motivos), un `=HYPERLINK(...)` en un
 * nombre se ejecutaría al abrir el archivo, no al hacer clic. El apóstrofo
 * inicial lo convierte en texto y conserva el contenido.
 *
 * Solo se protege el texto: un número serializado (`-12.5`) es un literal
 * numérico, no una fórmula, y anteponerle apóstrofo volvería el dinero a la
 * columna en texto y rompería la suma. Por eso el prefijo se aplica al serializar
 * strings, no al formatear el valor final.
 *
 * `\s` cubre el espacio y el tabulador iniciales, que también se usan para
 * esconder el `=` de un filtro ingenuo.
 */
const FORMULA_LEAD = /^\s*[=+\-@]/;

/** Columna del CSV. El orden del array ES el orden de las columnas del archivo. */
export interface CsvColumn<T> {
	/** Texto de la cabecera. */
	label: string;
	/** Valor de la celda. Un valor crudo, no un texto ya maquetado. */
	value: (row: T) => unknown;
}

function stringify(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : "";
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? "" : value.toISOString();
	}
	return String(value);
}

/**
 * Serializa un valor a su celda CSV: sin comillas si no lo necesita, entre
 * comillas (dobles) si contiene coma, salto de línea o comilla.
 */
export function escapeCsvValue(value: unknown): string {
	const raw = stringify(value);
	const text =
		typeof value === "string" && FORMULA_LEAD.test(raw) ? `'${raw}` : raw;
	if (text === "") return "";
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * `columnas` en el orden en que se quieren ver, cabecera incluida.
 *
 * El BOM se antepone siempre: sin él el archivo abre con acentos rotos en
 * Excel, y el fallo se ve en los datos, no en el nombre del archivo.
 */
export function toCsv<T>(
	rows: readonly T[],
	columns: readonly CsvColumn<T>[],
): string {
	const lines = [columns.map((c) => escapeCsvValue(c.label)).join(",")];
	for (const row of rows) {
		lines.push(columns.map((c) => escapeCsvValue(c.value(row))).join(","));
	}
	return CSV_BOM + lines.join("\n");
}

/**
 * Nombre de archivo con la fecha del día: sin ella el operador descarga tres
 * versiones de `pagos.csv` y ya no sabe cuál es la última.
 */
export function csvFileName(prefix: string, now = new Date()): string {
	const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	return `${prefix}-${stamp}.csv`;
}

/**
 * Sin `document` no hay panel (SSR de TanStack Start): se sale callado en vez de
 * romper. El botón solo dispara esto desde un clic, así que en la práctica solo
 * lo alcanza un entorno de pruebas.
 */
export function downloadCsv(fileName: string, content: string): void {
	if (typeof document === "undefined") return;
	const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.append(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
