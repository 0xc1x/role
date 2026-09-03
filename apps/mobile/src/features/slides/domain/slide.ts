/**
 * Proyección móvil de una slide activa (PostgREST).
 * No duplica la entidad de commons: solo los campos que la UI consume.
 */
import type { SlideType } from "@0xc1x/role-commons";

export interface PromoSlide {
  id: string;
  title: string;
  caption: string;
  badgeText: string | null;
  ctaLabel: string | null;
  redirectUrl: string | null;
  /** Solo type === 'coupon': código que el CTA copia al portapapeles. */
  couponCode: string | null;
  imageUrl: string | null;
  textColor: string | null;
  buttonColor: string | null;
  /** El CTA reacciona al tipo: cupón copia, ruta interna navega, URL abre externo. */
  type: SlideType;
  /** type === 'sponsor' muestra el badge "Sponsoreado". */
  isSponsored: boolean;
}

interface SlideRow {
  id: string;
  title: string;
  caption: string;
  badge_text: string | null;
  cta_label: string | null;
  redirect_url: string | null;
  coupon_code: string | null;
  image_url: string | null;
  text_color: string | null;
  button_color: string | null;
  type: string;
  priority: number;
  active: boolean;
  start_at: string | null;
  end_at: string | null;
}

export function toPromoSlide(row: SlideRow): PromoSlide {
  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    badgeText: row.badge_text,
    ctaLabel: row.cta_label,
    redirectUrl: row.redirect_url,
    couponCode: row.coupon_code,
    imageUrl: row.image_url,
    textColor: row.text_color,
    buttonColor: row.button_color,
    // `type` es texto libre en la tabla; el repositorio filtra a tipos conocidos.
    type: row.type as SlideType,
    isSponsored: row.type === "sponsor",
  };
}

/** Ventana de vigencia: descarta slides fuera de start_at/end_at. */
export function isInValidityWindow(
  row: Pick<SlideRow, "start_at" | "end_at">,
  now: Date = new Date(),
): boolean {
  if (row.start_at && new Date(row.start_at) > now) return false;
  if (row.end_at && new Date(row.end_at) < now) return false;
  return true;
}

export type { SlideRow };
