import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { DataTable } from "@/components/data-table/data-table";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	CouponCreateDrawer,
	couponsColumns,
	couponsListOptions,
	useCouponsList,
} from "@/features/coupons";

const booleanSearch = z
	.union([z.boolean(), z.enum(["true", "false"])])
	.optional()
	.transform((v) => {
		if (v === undefined) return undefined;
		if (typeof v === "boolean") return v;
		return v === "true";
	});

const couponsSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
	search: z.string().optional(),
	is_active: booleanSearch,
	// true → solo globales; false → solo de negocio; undefined → todos.
	global: booleanSearch,
});

export const Route = createFileRoute("/_layout/cupones")({
	validateSearch: (raw) => couponsSearchSchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(couponsListOptions(deps)),
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
	const { data, isLoading, isError, error } = useCouponsList(search);

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
						{error instanceof Error ? error.message : "Error al cargar cupones"}
					</p>
					<Button
						variant="outline"
						onClick={() =>
							navigate({
								search: {
									page: 1,
									limit: 10,
									is_active: undefined,
									global: undefined,
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
