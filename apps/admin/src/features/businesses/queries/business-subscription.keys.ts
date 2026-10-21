/**
 * Las claves de la suscripción del negocio y del catálogo de planes.
 *
 * Cuelgan de `["businesses", "subscription"]` y NO de `businessesKeys.detail(...)`:
 * la ficha del negocio y su plan son dos lecturas del mismo negocio, y
 * invalidar una no tiene que arrastrar a la otra. Un `["businesses"]` general
 * las invalidaría a las dos.
 *
 * El catálogo va bajo su propia rama —`["businesses", "subscription", "plans"]`—
 * porque es la MISMA lectura para todos los negocios: no tiene una fila por
 * negocio, y por eso no cuelga de `detail(...)`.
 */
export const businessSubscriptionKeys = {
	all: ["businesses", "subscription"] as const,
	detail: (id: string) =>
		[...businessSubscriptionKeys.all, "detail", id] as const,
	plans: () => [...businessSubscriptionKeys.all, "plans"] as const,
};
