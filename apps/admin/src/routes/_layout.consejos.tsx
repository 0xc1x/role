import { ListTipsQuerySchema } from "@0xc1x/role-commons";
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
import { TipCreateDrawer, tipsColumns, useTipsList } from "@/features/tips";

const tipsSearchSchema = ListTipsQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

/**
 * SIN `loader` A PROPÓSITO — el mismo motivo documentado en `_layout.resenas.tsx`
 * y `_layout.cupones.tsx`.
 *
 * Con `loader: ensureQueryData(...)` un fallo del API escapa al
 * `errorComponent` de la ruta en vez de entrar a la rama `isError` de este
 * componente, y ninguna ruta del panel define `errorComponent`: con
 * `/tips/admin` en 500 el panel entero se sustituía por el "Something went
 * wrong!" por defecto de TanStack Router, sin el mensaje de abajo y sin su
 * "Reintentar". Medido, no supuesto.
 */
export const Route = createFileRoute("/_layout/consejos")({
	validateSearch: (raw) => tipsSearchSchema.parse(raw),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Consejos | Role",
			},
			{
				name: "description",
				content:
					"Gestiona los consejos de tu plataforma desde el panel de administración Role",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error, refetch } = useTipsList(search);

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
						{error instanceof Error
							? error.message
							: "Error al cargar consejos"}
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

	const tips = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Panel de Consejos</h1>
				</header>
				<div className="flex items-center gap-4">
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar consejos..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<TipCreateDrawer />
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={tipsColumns}
					data={tips}
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
