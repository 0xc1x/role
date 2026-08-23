import { ListCommissionsQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
	commissionsColumns,
	commissionsListOptions,
	useCommissionsList,
} from "@/features/commissions";

export const Route = createFileRoute("/_layout/comisiones")({
	validateSearch: (raw) => ListCommissionsQuerySchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(commissionsListOptions(deps)),
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
	const { data, isLoading, isError, error } = useCommissionsList(search);

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
		return (
			<div className="px-6 py-4 space-y-4">
				<div className="flex items-center justify-between">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-10 w-32" />
				</div>
				<Skeleton className="h-6 w-24" />
				<div className="space-y-2">
					{[1, 2, 3, 4, 5].map((n) => (
						<Skeleton key={n} className="h-12 w-full" />
					))}
				</div>
			</div>
		);
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
					<Button
						variant="outline"
						onClick={() =>
							navigate({ search: { page: 1, limit: 20, search: undefined } })
						}
					>
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
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Comisiones</h1>
				</header>
				<div className="flex items-center gap-4">
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
