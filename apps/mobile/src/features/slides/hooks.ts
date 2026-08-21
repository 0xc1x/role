import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchPromoSlides } from "./data/repository";
import type { PromoSlide } from "./domain/slide";

export const PROMO_SLIDES_QUERY_KEY = ["slides", "promo"] as const;

export const promoSlidesQueryOptions = {
  queryKey: PROMO_SLIDES_QUERY_KEY,
  queryFn: fetchPromoSlides,
  // Contenido gestionado desde admin; refresca al reiniciar la app.
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: 1,
};

/**
 * Slides activas para el carrusel del home.
 * `[]` mientras carga o si no hay contenido → el componente se oculta.
 */
export function usePromoSlides(): UseQueryResult<PromoSlide[], Error> {
  return useQuery(promoSlidesQueryOptions);
}
