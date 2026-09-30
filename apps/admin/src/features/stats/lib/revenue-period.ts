import type { RevenueStatsQuery } from "@0xc1x/role-commons";

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
 *
 * Vive fuera del componente porque es aritmética de calendario, no JSX: el
 * archivo de la sección tiene que exportar solo componentes para que el refresco
 * en caliente no tire el período que el operador está mirando.
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
