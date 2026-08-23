import { useQuery } from "@tanstack/react-query";

import { fetchRandomTip } from "./data/repository";
import type { DailyTip } from "./domain/tip";

export const RANDOM_TIP_QUERY_KEY = ["tips", "random"] as const;

/**
 * Consejo del día: uno aleatorio entre los activos en cada carga.
 * `null` mientras carga o si no hay consejos → el banner se oculta.
 */
export function useRandomTip() {
  return useQuery({
    queryKey: RANDOM_TIP_QUERY_KEY,
    queryFn: fetchRandomTip,
    // Contenido gestionado desde admin; refresca al reiniciar la app.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}
