import { ListOffersQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
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
import { useOffersList } from "@/features/offers";
import { offersApi } from "@/features/offers/api/offers.api";
import {
	offersColumns,
	offersCsvColumns,
} from "@/features/offers/tables/offers.columns";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { formatApiError } from "@/lib/api/notify";

/**
 * `available_only` sale de la URL a propósito: el estado visible lo decide el
 * operador, no un default invisible del contrato.
 *
 * "Inactivas" NO se puede pedir al servidor: `GET /offers` solo filtra por
 * `available_only` y `business_id`, no por `is_active`. Se filtra la página
 * cargada y la UI lo dice — un filtro de página presentado como total global
 * sería un "0 resultados" sobre 40 ofertas.
 */
const schema = ListOffersQuerySchema.omit({ available_only: true }).extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
	state: z.enum(["all", "available", "inactive"]).optional().default("all"),
});

const OFFER_STATE_LABELS: Record<
	NonNullable<z.infer<typeof schema>["state"]>,
	string
> = {
	all: "Todas",
	available: "Publicables ahora",
	inactive: "Inactivas",
};

/**
 * «Inactivas» no se puede exportar, y el botón lo dice en vez de exportar una
 * página: `GET /offers` no acepta `is_active`, así que un recorrido de páginas
 * devolvería el conjunto COMPLETO de ofertas, no las inactivas. Entregarlo como
 * si fuera el filtro activo es peor que no entregarlo — el operador moderaría
 * contra un archivo con ofertas publicadas mezcladas.
 */
const EXPORT_SIN_FILTRO_SERVIDOR =
	"«Inactivas» no se puede exportar: la API no permite filtrar por is_active, así que el archivo incluiría también las ofertas publicadas.";

export const Route = createFileRoute("/_layout/ofertas")({
	validateSearch: (raw) => schema.parse(raw),
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	// Se parsea con el schema del contrato para que los defaults del servidor
	// (`radius_km`, etc.) queden garantizados por el tipo. Vive en una variable
	// y no dentro del `useQuery` porque la exportación debe recortar exactamente
	// el mismo conjunto que la tabla.
	const listQuery = useMemo(
		() =>
			ListOffersQuerySchema.parse({
				business_id: search.business_id,
				category_id: search.category_id,
				available_only: search.state === "available",
				page: search.page,
				limit: search.limit,
			}),
		[
			search.business_id,
			search.category_id,
			search.state,
			search.page,
			search.limit,
		],
	);
	const { data, isLoading, isError, error, refetch } = useOffersList(listQuery);

	const fetched = useMemo(() => data?.data ?? [], [data]);
	// Solo en el estado "inactivas" el filtro es del cliente; en los otros dos
	// el servidor ya devuelve exactamente ese conjunto.
	const rows = useMemo(
		() =>
			search.state === "inactive"
				? fetched.filter((offer) => !offer.is_active)
				: fetched,
		[fetched, search.state],
	);
	const pageScoped = search.state === "inactive";

	if (isLoading) {
		return (
			<div className="px-6 py-4 space-y-4">
				<Skeleton className="h-8 w-48" />
				{[1, 2, 3, 4, 5].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	}
	if (isError) {
		return (
			<div className="px-6 py-4">
				<p className="text-destructive">{formatApiError(error, "Error")}</p>
				<Button variant="outline" onClick={() => void refetch()}>
					Reintentar
				</Button>
			</div>
		);
	}

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-bold text-xl">Ofertas</h1>
				<div className="flex items-center gap-2">
					<ExportCsvButton
						fileName="ofertas"
						columns={offersCsvColumns}
						total={pageScoped ? 0 : (data?.meta.total ?? 0)}
						loadRows={() => fetchAllPages(offersApi.list, listQuery)}
						disabledReason={pageScoped ? EXPORT_SIN_FILTRO_SERVIDOR : undefined}
					/>
					<Select
						value={search.state}
						onValueChange={(v) =>
							navigate({
								search: {
									...search,
									state: v as typeof search.state,
									page: 1,
								},
							})
						}
					>
						<SelectTrigger className="w-56" aria-label="Estado">
							<SelectValue>
								{OFFER_STATE_LABELS[search.state] ?? "Todas"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todas</SelectItem>
							<SelectItem value="available">Publicables ahora</SelectItem>
							<SelectItem value="inactive">Inactivas</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
			{pageScoped ? (
				<p className="text-muted-foreground mt-2 text-sm">
					«Inactivas» se filtra sobre la página cargada ({rows.length} de{" "}
					{fetched.length}). La API no permite filtrar por `is_active`.
				</p>
			) : null}
			<div className="mt-4">
				<DataTable
					columns={offersColumns}
					data={rows}
					meta={data?.meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>
		</div>
	);
}
