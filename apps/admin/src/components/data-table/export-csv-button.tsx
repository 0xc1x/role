import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatApiError } from "@/lib/api/notify";
import { type CsvColumn, csvFileName, downloadCsv, toCsv } from "@/lib/csv";

interface ExportCsvButtonProps<T> {
	/** Prefijo del archivo; la fecha la agrega el helper. */
	fileName: string;
	/** Columnas del CSV, en el mismo orden que la tabla. */
	columns: readonly CsvColumn<T>[];
	/** Trae el conjunto completo del filtro activo. Lanza `ApiClientError` si la API falla. */
	loadRows: () => Promise<T[]>;
	/** `meta.total` de la página cargada: el tamaño real del conjunto filtrado. */
	total: number;
	/** Explica por qué no se puede exportar. Ausente = se puede. */
	disabledReason?: string;
}

/**
 * Exporta a CSV el conjunto filtrado completo de un listado.
 *
 * POR QUÉ VIVE EN `components/data-table` y no en `features/`: cinco dominios lo
 * usan con la misma mecánica (recorrer páginas, serializar, avisar) y ninguno
 * tiene algo propio que aportar. Lo específico de cada uno son las columnas, y
 * eso viaja por prop desde su `*.columns.tsx`.
 *
 * El conteo va en la etiqueta porque el alcance es la decisión del operador: un
 * botón que dice "Exportar" y entrega 10 de 4.000 filas se lee como "se exportó
 * todo" y se concilia mal.
 *
 * Es de solo lectura. No trae selección ni acciones en lote a propósito: la
 * tabla las eliminó hasta que exista `getRowId` y una toolbar con acciones ya
 * confirmadas (ver el comentario de `rowSelection` en `data-table.tsx`).
 */
export function ExportCsvButton<T>({
	fileName,
	columns,
	loadRows,
	total,
	disabledReason,
}: ExportCsvButtonProps<T>) {
	const [isPending, setIsPending] = useState(false);
	const isBlocked = disabledReason !== undefined || total === 0;

	const onClick = async () => {
		setIsPending(true);
		try {
			const rows = await loadRows();
			downloadCsv(csvFileName(fileName), toCsv(rows, columns));
			// El conteo exportado, no el anunciado: si el conjunto cambió
			// durante el recorrido, este es el número que hay que conciliar.
			toast.success(`Se exportaron ${rows.length} fila(s) a CSV`);
		} catch (error) {
			// Mismo notifier que el resto del panel: el operador recibe el
			// `requestId` para que soporte lo cruce con los logs.
			toast.error(formatApiError(error, "No se pudo exportar a CSV"));
		} finally {
			setIsPending(false);
		}
	};

	return (
		<Button
			variant="outline"
			size="sm"
			disabled={isBlocked || isPending}
			title={disabledReason}
			aria-label={
				disabledReason ?? `Exportar ${total} fila(s) del filtro actual a CSV`
			}
			onClick={() => void onClick()}
		>
			{isPending ? <Spinner /> : <Download />}
			{isPending
				? "Exportando..."
				: disabledReason
					? "Exportar CSV"
					: `Exportar CSV (${total})`}
		</Button>
	);
}
