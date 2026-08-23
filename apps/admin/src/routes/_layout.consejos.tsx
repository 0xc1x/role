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
import { Skeleton } from "@/components/ui/skeleton";
import {
	TipCreateDrawer,
	tipsColumns,
	tipsListOptions,
	useTipsList,
} from "@/features/tips";

const tipsSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
	search: z.string().optional(),
	active: z
		.union([z.boolean(), z.enum(["true", "false"])])
		.optional()
		.transform((v) => {
			if (v === undefined) return undefined;
			if (typeof v === "boolean") return v;
			return v === "true";
		}),
});

export const Route = createFileRoute("/_layout/consejos")({
	validateSearch: (raw) => tipsSearchSchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(tipsListOptions(deps)),
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
	const { data, isLoading, isError, error } = useTipsList(search);

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
							: "Error al cargar consejos"}
					</p>
					<Button
						variant="outline"
						onClick={() =>
							navigate({
								search: { page: 1, limit: 10, active: undefined },
							})
						}
					>
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
