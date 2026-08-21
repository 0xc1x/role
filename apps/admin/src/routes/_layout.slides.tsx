import {
	ListSlidesQuerySchema,
	SLIDE_TYPES,
	type SlideType,
} from "@0xc1x/role-commons";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { slidesColumns } from "@/features/slides";
import { SlideCreateDrawer } from "@/features/slides/components/slide-create-drawler";
import {
	slidesListOptions,
	useSlideList,
} from "@/features/slides/queries/slides.queries";

export const Route = createFileRoute("/_layout/slides")({
	validateSearch: (raw) => ListSlidesQuerySchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(slidesListOptions(deps)),
	component: RouteComponent,
	head: () => ({
		meta: [
			{
				title: "Slides | Role",
			},
			{
				name: "description",
				content:
					"Gestiona las slides de tu plataforma desde el panel de administración Role",
			},
		],
	}),
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError, error } = useSlideList(search);
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
							: "Error al cargar categorías"}
					</p>
					<Button
						variant="outline"
						onClick={() =>
							navigate({
								search: {
									page: 1,
									limit: 10,
									search: search.search,
									type: search.type,
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

	const slides = data?.data ?? [];
	const meta = data?.meta;
	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<header className="flex items-center">
					<h1 className="font-bold text-xl">Panel de Slides</h1>
				</header>
				<div className="flex items-center gap-4">
					<Select
						value={search.type ?? "all"}
						onValueChange={(v) =>
							navigate({
								search: {
									page: 1,
									limit: search.limit,
									search: search.search,
									type: v === "all" ? undefined : (v as SlideType),
									active: search.active,
								},
							})
						}
					>
						<SelectTrigger className="w-40" aria-label="Filtrar por tipo">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos los tipos</SelectItem>
							{SLIDE_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{t}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<InputGroup className="max-w-sm">
						<InputGroupAddon align="inline-start">
							<Search className="size-4 text-muted-foreground" />
						</InputGroupAddon>
						<InputGroupInput
							placeholder="Buscar slides..."
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</InputGroup>
					<SlideCreateDrawer />
				</div>
			</div>
			<div className="mt-4">
				<DataTable
					columns={slidesColumns}
					data={slides}
					meta={meta}
					onPageChange={(page) =>
						navigate({
							search: {
								page,
								limit: search.limit,
								search: search.search,
								type: search.type,
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
								type: search.type,
								active: search.active,
							},
						})
					}
				/>
			</div>
		</div>
	);
}
