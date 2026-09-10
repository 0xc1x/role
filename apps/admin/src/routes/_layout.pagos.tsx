import { ListPayoutsQuerySchema } from "@0xc1x/role-commons";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DataTable } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	payoutsColumns,
	payoutsListOptions,
	useGeneratePayouts,
	usePayoutsList,
} from "@/features/payouts";

const pagosSearchSchema = ListPayoutsQuerySchema.extend({
	limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export const Route = createFileRoute("/_layout/pagos")({
	validateSearch: (raw) => pagosSearchSchema.parse(raw),
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(payoutsListOptions(deps)),
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data, isLoading, isError } = usePayoutsList(search);
	const gen = useGeneratePayouts();

	if (isLoading)
		return (
			<div className="p-6 space-y-2">
				<Skeleton className="h-8 w-40" />
				{[1, 2, 3].map((n) => (
					<Skeleton key={n} className="h-12 w-full" />
				))}
			</div>
		);
	if (isError)
		return <div className="p-6 text-destructive">Error al cargar pagos</div>;

	const rows = data?.data ?? [];
	const meta = data?.meta;

	return (
		<div className="px-6 py-4">
			<div className="flex items-center justify-between">
				<h1 className="font-bold text-xl">Pagos a negocios</h1>
				<Button onClick={() => gen.mutate()} disabled={gen.isPending}>
					{gen.isPending ? "Generando..." : "Generar cortes"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground mt-1">
				Cortes quincenales · fee congelado por orden · cron 1 y 16 a las 03:00
			</p>
			<div className="mt-4">
				<DataTable
					columns={payoutsColumns}
					data={rows}
					meta={meta}
					onPageChange={(page) => navigate({ search: { ...search, page } })}
					onLimitChange={(limit) =>
						navigate({ search: { ...search, page: 1, limit } })
					}
				/>
			</div>
		</div>
	);
}
