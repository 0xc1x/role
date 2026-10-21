export const businessesKeys = {
	all: ["businesses"] as const,
	lists: () => [...businessesKeys.all, "list"] as const,
	list: (params: unknown) => [...businessesKeys.lists(), params] as const,
	details: () => [...businessesKeys.all, "detail"] as const,
	detail: (id: string) => [...businessesKeys.details(), id] as const,
	emailSends: (id: string) =>
		[...businessesKeys.detail(id), "email-sends"] as const,
	locations: (id: string) =>
		[...businessesKeys.detail(id), "locations"] as const,
	/**
	 * El CONTEO de las sucursales activas.
	 *
	 * Es hijo de `locations` a propósito: la invalidación de las ubicaciones
	 * —la que dispara el alta, la edición y la baja de un punto de retiro—
	 * alcanza también al conteo, porque react-query invalida por prefijo. Un
	 * conteo que no se refrescara con la lista sería un número viejo.
	 */
	locationsCount: (id: string) =>
		[...businessesKeys.locations(id), "active-count"] as const,
};
