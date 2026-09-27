import type { ListPayoutsQuery } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayoutsTotals } from "@/features/payouts/queries/payouts.queries";
import { formatApiError } from "@/lib/api/notify";
import { formatMoney } from "@/lib/money";

/**
 * Fila de totales de los cortes de pago.
 *
 * ALCANCE, y por qué hay que decirlo en la pantalla: la suma es del CONJUNTO
 * FILTRADO, recorrido página por página, no de las filas que se ven. Una fila de
 * totales debajo de una tabla paginada se lee sola como "el total de lo que veo",
 * y esa lectura es la que hay que impedir: por eso el rótulo dice "conjunto
 * filtrado" y, cuando el filtro abarca más páginas que las mostradas, dice
 * cuántas. `count` en la fila es el número de filas realmente sumadas, así que un
 * recorrido incompleto se nota en la propia tarjeta en vez de pasar por un total.
 *
 * Los importes llevan la moneda de la plataforma (constante de `commons`), no la
 * del negocio ni un símbolo suelto.
 */
export function PayoutsTotalsRow({
	query,
	filteredTotal,
}: {
	/** El mismo search de la tabla: los totales se filtran igual que la lista. */
	query: ListPayoutsQuery;
	/** `meta.total` de la lista: cuántos cortes dice el servidor que hay. */
	filteredTotal: number;
}) {
	const {
		data: totals,
		isLoading,
		isError,
		error,
		refetch,
	} = usePayoutsTotals(query);

	const limit = query.limit ?? 20;
	const isPaged = filteredTotal > limit;

	return (
		<div
			data-testid="payouts-totals"
			className="rounded-4xl bg-card p-4 ring-1 ring-foreground/5 dark:ring-foreground/10"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<p className="text-sm font-medium">Totales del conjunto filtrado</p>
				{isLoading ? (
					<Skeleton className="h-4 w-40" />
				) : (
					<p className="text-xs text-muted-foreground">
						{isPaged
							? `Suma de los ${filteredTotal} cortes del filtro, en todas las páginas (esta vista muestra ${limit}).`
							: `Suma de los ${filteredTotal} corte(s) del filtro.`}
					</p>
				)}
			</div>

			{isError ? (
				<div className="mt-2 flex items-center gap-3">
					<p className="text-sm text-destructive">
						{formatApiError(error, "No se pudieron calcular los totales")}
					</p>
					<Button variant="outline" size="sm" onClick={() => void refetch()}>
						Reintentar
					</Button>
				</div>
			) : totals ? (
				<dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
					<TotalCell label="Cortes sumados" value={String(totals.count)} />
					<TotalCell label="Bruto" value={formatMoney(totals.gross_amount)} />
					<TotalCell
						label="Fee de plataforma"
						value={formatMoney(totals.platform_fee)}
					/>
					<TotalCell label="Neto" value={formatMoney(totals.net_amount)} />
				</dl>
			) : null}
		</div>
	);
}

function TotalCell({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}
