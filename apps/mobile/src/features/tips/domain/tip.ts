/**
 * Proyección móvil de un consejo activo (PostgREST).
 * No duplica la entidad de commons: solo los campos que la UI consume.
 */
export interface DailyTip {
  id: string;
  content: string;
}

interface TipRow {
  id: string;
  content: string;
}

export function toTip(row: TipRow): DailyTip {
  return {
    id: row.id,
    content: row.content,
  };
}

export type { TipRow };
