import {
	PLATFORM_CURRENCY,
	type RevenueStats,
	type RevenueStatsQuery,
} from "@0xc1x/role-commons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenueStats } from "@/features/stats/queries/stats.queries";
import { formatApiError } from "@/lib/api/notify";
import { formatMoney, formatRate } from "@/lib/money";

/**
 * Días por defecto de la ventana. ESPEJA el default del servidor
 * (`REVENUE_PERIOD_DEFAULT_DAYS`, apps/api): los inputs se prellenan con la misma
 * ventana que pediría la API si el panel no mandara nada, así que el operador ve
 * desde el primer render qué período está mirando y el servidor nunca resuelve
 * una ventana distinta a la que la pantalla promete.
 */
export const REVENUE_PERIOD_DEFAULT_DAYS = 30;

/** `YYYY-MM-DD` en UTC: el contrato del período son días calendario en UTC. */
function utcDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/**
 * Últimos {@link REVENUE_PERIOD_DEFAULT_DAYS} días contando hoy, en UTC. Los
 * bordes se calculan en UTC y no con setters locales: la ventana del reporte es
 * UTC, y un borde corrido por zona horaria mostraría un día que el servidor no
 * incluye.
 */
export function defaultRevenuePeriod(
	now: Date = new Date(),
): Required<RevenueStatsQuery> {
	const to = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const from = new Date(to);
	from.setUTCDate(from.getUTCDate() - (REVENUE_PERIOD_DEFAULT_DAYS - 1));
	return { from: utcDay(from), to: utcDay(to) };
}

function MoneyRow({
	label,
	amount,
	emphasis,
}: {
	label: string;
	amount: number;
	emphasis?: boolean;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span
				className={emphasis ? "font-semibold tabular-nums" : "tabular-nums"}
			>
				{formatMoney(amount)}
			</span>
		</div>
	);
}

/**
 * Una cifra de conteo, junto a las de dinero. Comparte forma con {@link MoneyRow}
 * pero NO usa `formatMoney`: un conteo de órdenes con "USD" al frente sería tan
 * engañoso como un importe sin unidad.
 */
function CountRow({ label, count }: { label: string; count: number }) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span className="tabular-nums">{count}</span>
		</div>
	);
}

/**
 * DEVENGADO — lo que la plataforma ganó por las órdenes COMPLETADAS creadas en
 * el período (eje `orders.created_at`).
 *
 * El rótulo dice "devengado" y no "ingresos" a propósito: el dinero se ganó, pero
 * todavía no salió de la plataforma. Presentarlo junto al cobrado como dos
 * "ingresos" es exactamente la confusión que este reporte existe para evitar.
 */
function AccruedBlock({ accrued }: { accrued: RevenueStats["accrued"] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Devengado</CardTitle>
				<CardDescription>
					Ganado por órdenes completadas creadas en el período. Todavía no es
					dinero pagado: sale de la plataforma en un corte posterior.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<MoneyRow label="Bruto vendido" amount={accrued.gross_amount} />
				<MoneyRow
					label="Ingreso de la plataforma"
					amount={accrued.platform_fees}
					emphasis
				/>
				<MoneyRow label="Neto de los negocios" amount={accrued.business_net} />
				<div className="flex items-baseline justify-between gap-4">
					<span className="text-sm text-muted-foreground">
						Comisión efectiva
					</span>
					<span className="tabular-nums">
						{formatRate(accrued.effective_commission_rate)}
					</span>
				</div>
				<div className="mt-4 border-t pt-2 space-y-2">
					<CountRow label="Órdenes creadas" count={accrued.orders.total} />
					<CountRow label="Completadas" count={accrued.orders.completed} />
					<CountRow label="Canceladas" count={accrued.orders.cancelled} />
					<CountRow label="Vencidas" count={accrued.orders.expired} />
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * COBRADO — dinero que efectivamente salió de la plataforma, contado por
 * `payouts.paid_at` (eje del PAGO, no de la orden).
 *
 * Por eso `collected` no tiene por qué igualar a `accrued` en la misma ventana, y
 * esa diferencia es información: es dinero devengado que todavía no salió de la
 * plataforma. De ahí el bloque de pendiente.
 */
function CollectedBlock({
	collected,
}: {
	collected: RevenueStats["collected"];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Cobrado</CardTitle>
				<CardDescription>
					Dinero que salió de la plataforma a los negocios, contado por la fecha
					del pago. Es menor que lo devengado cuando los cortes van atrasados.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				<MoneyRow label="Bruto liquidado" amount={collected.gross_amount} />
				<MoneyRow
					label="Comisión cobrada"
					amount={collected.platform_fees}
					emphasis
				/>
				<MoneyRow
					label="Neto pagado a negocios"
					amount={collected.business_net}
				/>
				<div className="mt-4 border-t pt-2 space-y-2">
					<CountRow label="Cortes pagados" count={collected.paid_payouts} />
					<MoneyRow
						label={`Neto pendiente de pago (${collected.outstanding_payouts} corte(s))`}
						amount={collected.outstanding_business_net}
					/>
					<CountRow label="Cortes fallidos" count={collected.failed_payouts} />
				</div>
			</CardContent>
		</Card>
	);
}

/** Las dos caras del reporte, una junto a la otra y sin fusionar sus cifras. */
function MoneySummary({ revenue }: { revenue: RevenueStats }) {
	return (
		<>
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<AccruedBlock accrued={revenue.accrued} />
				<CollectedBlock collected={revenue.collected} />
			</div>
			<p className="text-xs text-muted-foreground">
				Devengado y cobrado no se suman: el devengado cuenta por la fecha de la
				orden y el cobrado por la fecha del pago. Todos los importes están en la
				moneda de la plataforma ({PLATFORM_CURRENCY}).
			</p>
		</>
	);
}

function MoneySkeleton() {
	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{[1, 2].map((n) => (
					<Card key={n}>
						<CardHeader>
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-full" />
						</CardHeader>
						<CardContent className="space-y-2">
							{[1, 2, 3].map((m) => (
								<Skeleton key={m} className="h-5 w-full" />
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

/**
 * Sección de dinero del panel.
 *
 * UNA decisión de montaje: la ventana vive en estado local y NO en la URL. A
 * diferencia de los filtros de un listado —que el operador quiere compartir y
 * volver a abrir— la ventana de un panel es una lectura momentánea, y meterla en
 * el search haría que `/home` dejara de ser el inicio. La ventana EFECTIVA que se
 * está mirando siempre se muestra, y sale de `period` en la respuesta, no de lo
 * que el operador tecleó: si el servidor resolviera otra, la pantalla lo diría.
 *
 * Una métrica de dinero sin dato NUNCA es 0, por la misma razón que el resto del
 * panel: "USD 0,00" con la API caída se lee como "no ganamos nada". Si la query
 * falla, la sección entera muestra el error con su `requestId` y un reintento, en
 * vez de una fila de ceros que el operador conciliaría contra la nada.
 */
export function MoneySection() {
	const [period, setPeriod] = useState<Required<RevenueStatsQuery>>(() =>
		defaultRevenuePeriod(),
	);
	const {
		data: revenue,
		isLoading,
		isError,
		error,
		refetch,
	} = useRevenueStats(period);

	return (
		<section aria-labelledby="dinero-title" className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h2 id="dinero-title" className="text-xl font-semibold">
						Dinero
					</h2>
					<p className="text-sm text-muted-foreground">
						Devengado por negocio completado y efectivamente cobrado a los
						negocios. Son dos números distintos y no se suman.
					</p>
				</div>
				<div className="flex items-end gap-3">
					<div className="space-y-1">
						<Label htmlFor="revenue-from">Desde</Label>
						<Input
							id="revenue-from"
							type="date"
							className="w-40"
							value={period.from}
							onChange={(e) =>
								setPeriod((p) => ({ ...p, from: e.target.value }))
							}
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="revenue-to">Hasta</Label>
						<Input
							id="revenue-to"
							type="date"
							className="w-40"
							value={period.to}
							onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
						/>
					</div>
					{isError ? (
						<Button variant="outline" onClick={() => void refetch()}>
							Reintentar
						</Button>
					) : null}
				</div>
			</div>

			{isLoading ? (
				<MoneySkeleton />
			) : isError ? (
				<p className="text-destructive text-sm">
					{formatApiError(error, "No se pudo cargar el reporte de dinero")}
				</p>
			) : revenue ? (
				<>
					<p className="text-xs text-muted-foreground">
						{`Período aplicado: ${revenue.period.from} → ${revenue.period.to} (días UTC).`}
					</p>
					<MoneySummary revenue={revenue} />
				</>
			) : null}
		</section>
	);
}
