import { supabase } from "@/core/supabase/client";

import { toTip, type DailyTip, type TipRow } from "../domain/tip";

/**
 * Lee un consejo aleatorio activo vía RPC (RLS: active + no eliminadas).
 * El admin los gestiona; el móvil solo consume.
 */
export async function fetchRandomTip(): Promise<DailyTip | null> {
  const { data, error } = await supabase.rpc("get_random_tip");

  if (error) throw new Error(error.message);

  return data ? toTip(data as TipRow) : null;
}
