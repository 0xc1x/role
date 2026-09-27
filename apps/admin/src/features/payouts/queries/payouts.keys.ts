import { createListOnlyKeys } from "@/lib/query/keys";

export const payoutsKeys = {
	...createListOnlyKeys<unknown>("payouts"),
	/**
	 * Los totales son una consulta distinta de la página, pero comparten prefijo a
	 * propósito: `invalidateQueries({ queryKey: payoutsKeys.all })` los refresca
	 * junto con la lista cuando un corte se marca pagado. El filtro viaja en la key
	 * —los totales de "pagados" y de "pendientes" no son el mismo número.
	 */
	totals: (params?: unknown) =>
		["payouts", "totals", (params ?? {}) as unknown] as const,
};
