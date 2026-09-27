import { PLATFORM_CURRENCY } from "@0xc1x/role-commons";

/**
 * Rótulos de dinero del panel.
 *
 * TODOS los importes salen de acá. La razón no es estética: el contrato de
 * dinero (`RevenueStats`, `PayoutDto`) no lleva campo de moneda, así que el
 * rótulo es la única parte de la cifra que dice en qué unidad está. Con
 * `style: "currency"` a secas, `es-EC` rinde "$1.234,50" y un "$" sin código no
 * distingue USD de MXN ni de COP: el operador concilia contra una unidad que el
 * panel nunca afirmó. `currencyDisplay: "code"` deja la unidad legible en la
 * propia cifra, y la unidad sale de `PLATFORM_CURRENCY`.
 *
 * El formatter se construye a nivel de módulo (es la parte cara; formatear es
 * barato), igual que `lib/dates.ts` con su `DateTimeFormat`.
 */

const moneyFmt = new Intl.NumberFormat("es-EC", {
	style: "currency",
	currency: PLATFORM_CURRENCY,
	currencyDisplay: "code",
});

const rateFmt = new Intl.NumberFormat("es-EC", {
	style: "percent",
	maximumFractionDigits: 2,
});

/** `1234.5` → `"USD 1.234,50"`. La unidad viaja en la cifra, no en un rótulo aparte. */
export function formatMoney(amount: number): string {
	return moneyFmt.format(amount);
}

/**
 * Comisión efectiva del período: la API la manda como fracción (`0.1333`).
 * Se formatea como porcentaje, que es como la lee un operador.
 */
export function formatRate(fraction: number): string {
	return rateFmt.format(fraction);
}
