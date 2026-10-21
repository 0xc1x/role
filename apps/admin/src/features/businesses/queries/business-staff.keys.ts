/**
 * Las claves del roster del equipo.
 *
 * Cuelgan de `["businesses", "staff"]` y NO de `businessesKeys.detail(...)`: la
 * ficha del negocio y el roster son dos lecturas del mismo negocio, y
 * invalidar una no tiene que arrastrar a la otra. Un `["businesses"]` general
 * las invalidaría a las dos.
 */
export const businessStaffKeys = {
	all: ["businesses", "staff"] as const,
	list: (id: string) => [...businessStaffKeys.all, "list", id] as const,
};
