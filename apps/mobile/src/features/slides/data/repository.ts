import { supabase } from "@/core/supabase/client";

import { isInValidityWindow, toPromoSlide, type PromoSlide, type SlideRow } from "../domain/slide";

/** Tipos de slide que alimentan el carrusel promocional del home. */
const PROMO_SLIDE_TYPES = ["ad", "info", "sponsor"] as const;

/**
 * Lee slides activas directamente de Supabase (RLS: active + no eliminadas).
 * El admin las gestiona; el móvil solo consume.
 */
export async function fetchPromoSlides(): Promise<PromoSlide[]> {
  const { data, error } = await supabase
    .from("slides")
    .select(
      "id, title, caption, badge_text, cta_label, redirect_url, image_url, text_color, button_color, type, priority, active, start_at, end_at",
    )
    .eq("active", true)
    .is("deleted_at", null)
    .in("type", [...PROMO_SLIDE_TYPES])
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message);

  return ((data ?? []) as SlideRow[])
    .filter((row) => isInValidityWindow(row))
    .map(toPromoSlide);
}
