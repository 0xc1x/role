import {
	BUG_TRIAGE_STATES,
	type BugReportListItemDto,
	type BugTriageState,
	ENTRY_ORIGINS,
	type EntryOrigin,
	type ListBugReportsQuery,
} from "@0xc1x/role-commons";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BugReportDrawer } from "@/features/bug-reports/components/bug-report-drawer";
import { useBugReportList } from "@/features/bug-reports/queries/bug-reports.queries";
import { createBugReportsColumns } from "@/features/bug-reports/tables/bug-reports.columns";
import { formatApiError } from "@/lib/api/notify";
import { bugTriageStateLabel, entryOriginLabel } from "@/lib/labels";

/**
 * Buzón de reportes de error con filtro por triaje y por origen.
 *
 * La columna se llama "Triaje" y no "Estado" a propósito. En la bandeja de
 * contactos "Estado" es el de la ENTREGA del aviso de correo, y copiando el
 * nombre acá el operador leería "Abierto" como "el aviso todavía no llegó"
 * cuando significa "el equipo todavía no lo tocó". Son ejes ortogonales: por eso
 * el listado no trae la columna de entrega (que además no significa nada en esta
 * bandeja, ver `bug-reports.columns.tsx`) y por eso esta se llama Triaje.
 *
 * Los dos filtros viajan al servidor, no se filtran en el cliente: la API pagina
 * sobre `app_store` con un LIMIT, y filtrar 20 filas en el navegador daría una
 * respuesta que cambia según la página — "no hay reportes" cuando lo hay es el
 * peor defecto posible en una bandeja de triaje.
 */
export function BugReportsList({
	page = 1,
	limit = 20,
	state,
	origin,
	onPageChange,
	onFilterChange,
}: {
	page?: number;
	limit?: number;
	state?: BugTriageState;
	origin?: EntryOrigin;
	onPageChange: (page: number) => void;
	onFilterChange: (filtros: {
		state?: BugTriageState;
		origin?: EntryOrigin;
	}) => void;
}) {
	// `satisfies` y no un cast: los filtros se narrowean a la unión del contrato
	// sin que haya que mentirle al compilador. Un token fuera de vocabulario no
	// puede llegar por esta puerta, y la ruta además los valida con
	// `ListBugReportsQuerySchema`.
	const { data, isLoading, isError, error, refetch } = useBugReportList({
		page,
		limit,
		state,
		origin,
	} satisfies ListBugReportsQuery);
	const [abierto, setAbierto] = useState<BugReportListItemDto | null>(null);

	const columnas = useMemo(() => createBugReportsColumns(setAbierto), []);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div className="space-y-4">
				{/* Con `requestId` detrás del "·": es lo único que correlaciona este
				    fallo con la petición en los logs del servidor. */}
				<p className="text-destructive">
					{formatApiError(error, "No se pudieron cargar los reportes")}
				</p>
				{/* `refetch()` y no un `navigate` a la página 1: la query errored
				    vive bajo la MISMA key, así que volver a navegar a un search
				    idéntico no la vuelve a pedir y el botón no reintenta nada. */}
				<Button variant="outline" onClick={() => refetch()}>
					Reintentar
				</Button>
			</div>
		);
	}

	const filas = data?.data ?? [];

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-end gap-2">
				<Select
					value={state ?? "all"}
					// `find` contra el contrato, no un cast del string del selector:
					// un token que el panel no conoce se traduce en "sin filtro", que
					// es la única lectura honesta — y la misma disciplina que el mapper
					// de la API aplica con `state`.
					onValueChange={(v) =>
						onFilterChange({
							state: BUG_TRIAGE_STATES.find((s) => s === v),
							origin,
						})
					}
				>
					<SelectTrigger className="w-52" aria-label="Triaje">
						<SelectValue placeholder="Triaje" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos los triajes</SelectItem>
						{/* Del contrato, no de una lista local: un estado nuevo en
						    commons aparece en el filtro sin tocar esta vista. */}
						{BUG_TRIAGE_STATES.map((s) => (
							<SelectItem key={s} value={s}>
								{bugTriageStateLabel(s)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{/* El origen lo fija la policy de insert de la base (`ios`,
				    `android`, `pwa`), no el cliente: la lista sale del enum del
				    contrato y el panel no la puede inventar. */}
				<Select
					value={origin ?? "all"}
					// Igual que arriba: `find` y no cast.
					onValueChange={(v) =>
						onFilterChange({
							state,
							origin: ENTRY_ORIGINS.find((o) => o === v),
						})
					}
				>
					<SelectTrigger className="w-48" aria-label="Origen">
						<SelectValue placeholder="Origen" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todos los orígenes</SelectItem>
						{/* Del enum del contrato, no de una lista local: `web` está
						    aunque hoy ningún escritor pueda asignarlo (la policy de
						    insert solo admite ios/android/pwa), y la lista del selector
						    tiene que ser la del contrato y no la de lo que existe hoy. */}
						{ENTRY_ORIGINS.map((o) => (
							<SelectItem key={o} value={o}>
								{entryOriginLabel(o)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{filas.length === 0 ? (
				<p className="text-muted-foreground py-8 text-center text-sm">
					No hay reportes de error con este filtro.
				</p>
			) : (
				<DataTable
					columns={columnas}
					data={filas}
					meta={data?.meta}
					onPageChange={onPageChange}
					onLimitChange={() => onPageChange(1)}
				/>
			)}

			<BugReportDrawer
				id={abierto?.id ?? null}
				isOpen={abierto !== null}
				onClose={() => setAbierto(null)}
			/>
		</div>
	);
}
