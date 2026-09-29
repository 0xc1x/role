import { ListCommissionsQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { ExportCsvButton } from "@/components/data-table/export-csv-button";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	commissionsApi,
	commissionsColumns,
	commissionsCsvColumns,
	useCommissionsList,
} from "@/features/commissions";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.resenas.tsx`
 * y `_layout.cupones.tsx`.
 *
 * Con `loader: ensureQueryData(...)` un fallo del API escapa al
 * `errorComponent` de la ruta en vez de entrar a la rama `isError` de este
 * componente, y ninguna ruta del panel define `errorComponent`: con
 * `/commissions` en 500 el panel entero se sustituía por el "Something went
 * wrong!" por defecto de TanStack Router, sin el mensaje de abajo y sin su
 * "Reintentar". Medido, no supuesto.
 */
export const Route = createFileRoute("/_layout/comisiones")({
	validateSearch: (raw) => ListCommissionsQuerySchema.parse(raw),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Comisiones | Rolé",
			},
			{
				name: "description",
				content:
					"Gestiona la comisión de cada negocio del panel de administración Rolé",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } =
		useCommissionsList(search);

	const [searchInput, setSearchInput] = useState(search.search ?? "");

	useEffect(() => {
		setSearchInput(search.search ?? "");
	}, [search.search]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (searchInput !== (search.search ?? "")) {
				navigate({
					search: {
						page: 1,
						limit: search.limit,
						search: searchInput || undefined,
					},
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput, search.search, search.limit, navigate]);

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (isError) {
		return (
			<div className="px-6 py-4">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive">
						{error instanceof Error
							? error.message
							: "Error al cargar comisiones"}
					</p>
					{/* `navigate` con el mismo search lo deduplica y la query errored
					    queda bajo la misma key: el botón de recuperación no hacía nada. */}
					<Button variant="outline" onClick={() => void refetch()}>
						Reintentar
					</Button>
				</div>
			</div>
		);
	}

	const commissions = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between gap-4">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Comisiones</h1>
				</header>
				<div className="flex items-center gap-4">
					<ExportCsvButton
						fileName="comisiones"
						columns={commissionsCsvColumns}
						total={meta?.total ?? 0}
						loadRows={() => fetchAllPages(commissionsApi.list, search)}
					/>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar negocios..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
				</div>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				No se puede cambiar la comisión de un negocio con pagos pendientes de
				procesar.
			</p>
			<div className="mt-4">
				<DataTable
					columns={commissionsColumns}
					data={commissions}
					meta={meta}
					onPageChange={(page) =>
						navigate({
							search: {
								page,
								limit: search.limit,
								search: search.search,
							},
						})
					}
					onLimitChange={(limit) =>
						navigate({
							search: {
								page: 1,
								limit,
								search: search.search,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
