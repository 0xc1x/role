import {
	ListPayoutsQuerySchema,
	PAYOUT_STATUSES,
	type PayoutStatus,
} from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { BusinessFilter } from "@/components/business-filter";
import { DataTable } from "@/components/data-table/data-table";
import { ExportCsvButton } from "@/components/data-table/export-csv-button";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
	GeneratePayoutsDialog,
	payoutsApi,
	payoutsColumns,
	payoutsCsvColumns,
	useGeneratePayouts,
	usePayoutsList,
} from "@/features/payouts";
import { PayoutsTotalsRow } from "@/features/payouts/components/payouts-totals-row";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { formatApiError } from "@/lib/api/notify";
import { payoutStatusLabel } from "@/lib/labels";

// El contrato ya declara `business_id` y `status` en el listado; el `.extend`
// solo baja el page size al de las tablas (10).
const pagosSearchSchema = ListPayoutsQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.cupones.tsx`
 * y `_layout.contactos.tsx`.
 *
 * Este route sí tenía
 * `loader: ensureQueryData(payoutsListOptions(deps))`, y con `/payouts` en 500
 * el fallo del loader escapaba al `errorComponent` (que ninguna ruta define)
 * en vez de entrar a la rama `isError` de `RouteComponent`, dejando el panel
 * entero sustituido por el "Something went wrong!" por defecto de TanStack
 * Router — sin barra lateral, sin sección y sin el "Reintentar" de más abajo.
 * Medido, no supuesto.
 *
 * La consecuencia para el e2e es la parte que de verdad importa: un `loader`
 * corre en el proceso Node de Vite durante el SSR, así que la request la hace
 * el servidor y `page.route()` no la ve. Un override de `/payouts` en
 * `stubApi(page, …)` era un override que nadie consultaba, y el test de esta
 * sección afirmaba contra el fixture de éxito sin poder ejercitar el error.
 * Sin `loader`, `usePayoutsList` corre en el navegador, la request sí pasa por
 * `page.route()`, y la rama `isError` es alcanzable desde un test.
 */
export const Route = createFileRoute("/_layout/pagos")({
	validateSearch: (raw) => pagosSearchSchema.parse(raw),
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } = usePayoutsList(search);
	const gen = useGeneratePayouts();
	const [confirmOpen, setConfirmOpen] = useState(false);

	// Cambiar un filtro vuelve a la página 1: quedarse en la página 4 de un filtro
	// nuevo muestra una lista vacía y parece que el filtro no encontró nada.
	const patch = (next: Partial<typeof search>) =>
		navigate({ search: { ...search, ...next, page: 1 } });

	if (isLoading)
		return (
			<div className="p-6 space-y-2">
				<Skeleton className="h-8 w-40" />
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	if (isError)
		return (
			<div className="px-6 py-4">
				<p className="text-destructive">
					{formatApiError(error, "Error al cargar pagos")}
				</p>
				<Button variant="outline" onClick={() => void refetch()}>
					Reintentar
				</Button>
			</div>
		);

	const rows = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="font-bold text-xl">Pagos a negocios</h1>
				<div className="flex flex-wrap items-center gap-3">
					<Select
						value={search.status ?? "all"}
						onValueChange={(v) =>
							patch({ status: v === "all" ? undefined : (v as PayoutStatus) })
						}
					>
						<SelectTrigger className="w-48" aria-label="Estado">
							{/* Con children explícitos: sin ellos el trigger muestra el
							    enum crudo (`processing`) en vez de la etiqueta. */}
							<SelectValue>
								{search.status
									? payoutStatusLabel(search.status)
									: "Todos los estados"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos los estados</SelectItem>
							{PAYOUT_STATUSES.map((status) => (
								<SelectItem key={status} value={status}>
									{payoutStatusLabel(status)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<BusinessFilter
						value={search.business_id}
						onChange={(business_id) => patch({ business_id })}
						searchLabel="Buscar negocio para filtrar los pagos"
					/>
					<ExportCsvButton
						fileName="pagos"
						columns={payoutsCsvColumns}
						total={meta?.total ?? 0}
						loadRows={() => fetchAllPages(payoutsApi.list, search)}
					/>
					<Button onClick={() => setConfirmOpen(true)} disabled={gen.isPending}>
						{gen.isPending ? <Spinner /> : null}
						{gen.isPending ? "Generando..." : "Generar cortes"}
					</Button>
				</div>
			</div>
			<p className="text-sm text-muted-foreground mt-1">
				Cortes quincenales · fee congelado por orden · cron 1 y 16 a las 03:00
			</p>
			<div className="mt-4 space-y-4">
				{/* Los totales van ANTES de la tabla y repiten el filtro activo en su
				    rótulo: una fila de totales debajo de una tabla paginada se lee
				    sola como el total de las filas visibles, y eso no es lo que
				    suma. El componente recorre las páginas del filtro completo. */}
				<PayoutsTotalsRow query={search} filteredTotal={meta?.total ?? 0} />
				<DataTable
					columns={payoutsColumns}
					data={rows}
					meta={meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>

			<GeneratePayoutsDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				isPending={gen.isPending}
				onConfirm={() => {
					gen.mutate(undefined, { onSettled: () => setConfirmOpen(false) });
				}}
			/>
		</div>
	);
}
