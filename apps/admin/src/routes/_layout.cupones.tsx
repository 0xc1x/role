import { ListCouponsQuerySchema } from "@0xc1x/role-commons";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	CouponCreateDrawer,
	couponsColumns,
	useCouponsList,
} from "@/features/coupons";
import { formatApiError } from "@/lib/api/notify";

const couponsSearchSchema = ListCouponsQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.resenas.tsx`.
 *
 * Este route sí tenía `loader: ensureQueryData(couponsListOptions(deps))`, y
 * medido en el e2e convertía la rama `isError` del componente en código
 * muerto: el loader corre en el servidor Vite durante el SSR, un fallo ahí
 * escapa al `errorComponent` de la ruta en vez de entrar al `isError`, y ninguna
 * ruta del panel define `errorComponent`. Con `/coupons` en 500 el panel
 * entero se sustituía por el "Something went wrong!" por defecto de TanStack
 * Router — sin barra lateral, sin el mensaje de este archivo y sin el
 * "Reintentar" que el operador necesita para reintentar. El componente ya
 * resuelve los tres estados; el loader era lo que impedía llegar al tercero.
 */
export const Route = createFileRoute("/_layout/cupones")({
	validateSearch: (raw) => couponsSearchSchema.parse(raw),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Cupones | Role",
			},
			{
				name: "description",
				content:
					"Gestiona los cupones de tu plataforma desde el panel de administración Role",
			},
		],
	}),
});

type ScopeFilter = "all" | "global" | "business";

function scopeToGlobal(scope: ScopeFilter): boolean | undefined {
	if (scope === "global") return true;
	if (scope === "business") return false;
	return undefined;
}

function globalToScope(global: boolean | undefined): ScopeFilter {
	if (global === true) return "global";
	if (global === false) return "business";
	return "all";
}

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } = useCouponsList(search);

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
						is_active: search.is_active,
						global: search.global,
					},
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [
		searchInput,
		search.search,
		search.limit,
		search.is_active,
		search.global,
		navigate,
	]);

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (isError) {
		return (
			<div className="px-6 py-4">
				<div className="flex flex-col items-center gap-4">
					<p className="text-destructive">
						{formatApiError(error, "Error al cargar cupones")}
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

	const coupons = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Panel de Cupones</h1>
				</header>
				<div className="flex items-center gap-4">
					<Select
						value={globalToScope(search.global)}
						onValueChange={(v) => {
							if (!v) return;
							navigate({
								search: {
									page: 1,
									limit: search.limit,
									search: search.search,
									is_active: search.is_active,
									global: scopeToGlobal(v as ScopeFilter),
								},
							});
						}}
					>
						<SelectTrigger className="w-40" aria-label="Filtrar por ámbito">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							<SelectItem value="global">Globales</SelectItem>
							<SelectItem value="business">Por negocio</SelectItem>
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar cupones..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<CouponCreateDrawer />
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={couponsColumns}
					data={coupons}
					meta={meta}
					onPageChange={(page) =>
						navigate({
							search: {
								page,
								limit: search.limit,
								search: search.search,
								is_active: search.is_active,
								global: search.global,
							},
						})
					}
					onLimitChange={(limit) =>
						navigate({
							search: {
								page: 1,
								limit,
								search: search.search,
								is_active: search.is_active,
								global: search.global,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
