import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	payoutsListOptions,
	useGeneratePayouts,
	useMarkPaid,
	usePayoutsList,
} from "@/features/payouts/queries/payouts.queries";

const pagosSearchSchema = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().min(1).max(100).optional().default(20),
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
	const pay = useMarkPaid();

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
			<div className="mt-4 w-full max-w-full overflow-x-auto border rounded-lg">
				<table className="w-full text-sm">
					<thead className="bg-muted">
						<tr>
							<th className="p-2 text-left">Negocio</th>
							<th className="p-2">Período</th>
							<th className="p-2 text-right">Bruto</th>
							<th className="p-2 text-right">Fee</th>
							<th className="p-2 text-right">Neto</th>
							<th className="p-2">Estado</th>
							<th className="p-2"></th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 && (
							<tr>
								<td
									colSpan={7}
									className="p-4 text-center text-muted-foreground"
								>
									Sin cortes aún
								</td>
							</tr>
						)}
						{rows.map((r) => (
							<tr key={r.id} className="border-t">
								<td className="p-2 font-medium">
									{(r as { business_name?: string | null }).business_name ??
										r.business_id.slice(0, 8)}
								</td>
								<td className="p-2 text-center">
									{r.period_start} → {r.period_end}
								</td>
								<td className="p-2 text-right">${r.gross_amount.toFixed(2)}</td>
								<td className="p-2 text-right text-muted-foreground">
									${r.platform_fee.toFixed(2)}
								</td>
								<td className="p-2 text-right font-medium">
									${r.net_amount.toFixed(2)}
								</td>
								<td className="p-2">
									<span className="text-xs px-2 py-0.5 rounded bg-muted">
										{r.status}
									</span>
								</td>
								<td className="p-2">
									{r.status === "pending" && (
										<Button
											size="sm"
											variant="outline"
											onClick={() => pay.mutate(r.id)}
											disabled={pay.isPending}
										>
											Marcar pagado
										</Button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{meta && (
				<div className="flex gap-2 mt-3">
					<Button
						variant="outline"
						disabled={search.page <= 1}
						onClick={() =>
							navigate({ search: { ...search, page: search.page - 1 } })
						}
					>
						Anterior
					</Button>
					<span className="py-2 text-sm">
						{search.page} / {Math.ceil(meta.total / meta.limit) || 1}
					</span>
					<Button
						variant="outline"
						disabled={search.page >= Math.ceil(meta.total / meta.limit)}
						onClick={() =>
							navigate({ search: { ...search, page: search.page + 1 } })
						}
					>
						Siguiente
					</Button>
				</div>
			)}
		</div>
	);
}
