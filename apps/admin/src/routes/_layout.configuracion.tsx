import { ListAppConfigQuerySchema } from "@0xc1x/role-commons";
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
import { appConfigColumns } from "@/features/app-config";
import { AppConfigCreateDrawer } from "@/features/app-config/components/app-config-create-drawer";
import {
	appConfigListOptions,
	useAppConfigList,
} from "@/features/app-config/queries/app-config.queries";

export const Route = createFileRoute("/_layout/configuracion")({
	validateSearch: (raw) => ListAppConfigQuerySchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(appConfigListOptions(deps)),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Configuración | Rolé",
			},
			{
				name: "description",
				content:
					"Gestiona los valores dinámicos de la plataforma Rolé: contacto, tarifas, comisiones, reglas y links",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error } = useAppConfigList(search);
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
						category: search.category,
						active: search.active,
					},
				});
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [
		searchInput,
		search.search,
		search.limit,
		search.category,
		search.active,
		navigate,
	]);

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
							: "Error al cargar la configuración"}
					</p>
					<Button
						variant="outline"
						onClick={() =>
							navigate({
								search: {
									page: 1,
									limit: 20,
									search: undefined,
									category: undefined,
									active: undefined,
								},
							})
						}
					>
						Reintentar
					</Button>
				</div>
			</div>
		);
	}

	const configs = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Configuración de la plataforma</h1>
				</header>
				<div className="flex items-center gap-4">
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar por clave o etiqueta..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<AppConfigCreateDrawer />
				</div>
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Valores consumidos por mobile (Supabase directo), landing (API) y la
				API.
			</p>
			<div className="mt-4">
				<DataTable
					columns={appConfigColumns}
					data={configs}
					meta={meta}
					onPageChange={(page) =>
						navigate({
							search: {
								page,
								limit: search.limit,
								search: search.search,
								category: search.category,
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
								category: search.category,
								active: search.active,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
