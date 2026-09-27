import type { PayoutDto } from "@0xc1x/role-commons";

/**
 * Totales de un conjunto de cortes de pago.
 *
 * El alcance NO lo decide esta función: decide qué se suma, y el que decide
 * cuántas filas llegan es el recorrido de páginas. Por eso `rows` es explícito en
 * la firma —llamarla con la página visible y llamarla con el filtro entero dan el
 * mismo tipo y resultados distintos, que es la trampa.
 */
export interface PayoutTotals {
	/** Cortes efectivamente sumados. Si no es `meta.total`, el total es parcial. */
	count: number;
	gross_amount: number;
	platform_fee: number;
	net_amount: number;
}

/** Redondeo a 2 decimales: `numeric` de Postgres es exacto y el doble no. */
function money(value: number): number {
	return Math.round(value * 100) / 100;
}

export const EMPTY_PAYOUT_TOTALS: PayoutTotals = {
	count: 0,
	gross_amount: 0,
	platform_fee: 0,
	net_amount: 0,
};

/** Suma bruta de los importes de los cortes recibidos. */
export function sumPayoutTotals(rows: PayoutDto[]): PayoutTotals {
	return rows.reduce<PayoutTotals>(
		(acc, row) => ({
			count: acc.count + 1,
			gross_amount: money(acc.gross_amount + row.gross_amount),
			platform_fee: money(acc.platform_fee + row.platform_fee),
			net_amount: money(acc.net_amount + row.net_amount),
		}),
		EMPTY_PAYOUT_TOTALS,
	);
}
