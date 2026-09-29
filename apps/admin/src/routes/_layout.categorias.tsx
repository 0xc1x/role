import { ListCategoriesQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table/data-table";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	CategoryCreateDrawer,
	categoriesColumns,
	useCategoriesList,
} from "@/features/categories";
import { formatApiError } from "@/lib/api/notify";

const categoriesSearchSchema = ListCategoriesQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.cupones.tsx`
 * y `_layout.contactos.tsx`.
 *
 * Este route sí tenía
 * `loader: ensureQueryData(categoriesListOptions(deps))`, y con
 * `/categories/admin` en 500 el fallo del loader escapaba al `errorComponent`
 * (que ninguna ruta define) en vez de entrar a la rama `isError` de
 * `RouteComponent`, dejando el panel entero sustituido por el "Something went
 * wrong!" por defecto de TanStack Router — sin barra lateral, sin sección y sin
 * el "Reintentar" de más abajo. Medido, no supuesto.
 *
 * Y el `loader` además hacía que la request la emitiera el proceso Node de Vite
 * durante el SSR, donde `page.route()` no llega: un override de
 * `/categories/admin` en `stubApi(page, …)` no lo consultaba nadie, así que el
 * test de esta sección afirmaba contra el fixture de éxito sin poder ejercitar
 * el error. Sin `loader`, `useCategoriesList` corre en el navegador y la rama
 * `isError` es alcanzable desde un test.
 */
export const Route = createFileRoute("/_layout/categorias")({
	validateSearch: (raw) => categoriesSearchSchema.parse(raw),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Categorías | Role",
			},
			{
				name: "description",
				content:
					"Gestiona las categorías de tu plataforma desde el panel de administración Role",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } =
		useCategoriesList(search);

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
						active: search.active,
					},
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput, search.search, search.limit, search.active, navigate]);

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (isError) {
		return (
			<div className="px-6 py-4">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive">
						{formatApiError(error, "Error al cargar categorías")}
					</p>
					{/* Reintentar navegaba con un search limpio: eso cambiaba la key de
					    la query y además borraba los filtros que el operador tenía
					    puesta. Reintentar es refetchar la misma consulta. */}
					<Button variant="outline" onClick={() => void refetch()}>
						Reintentar
					</Button>
				</div>
			</div>
		);
	}

	const categories = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Panel de Categorías</h1>
				</header>
				<div className="flex items-center gap-4">
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar categorías..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<CategoryCreateDrawer />
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={categoriesColumns}
					data={categories}
					meta={meta}
					onPageChange={(page) =>
						navigate({
							search: {
								page,
								limit: search.limit,
								search: search.search,
								active: search.active,
							},
						})
					}
					onLimitChange={(limit) =>
						navigate({
							search: {
								page: 1,
								limit,
								search: search.search,
								active: search.active,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
