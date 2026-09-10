import type { AppConfigMap } from "@0xc1x/role-commons";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";

/**
 * Lee la configuración pública directamente de Supabase (RLS permite
 * `active AND is_public` a anon). Mobile no pasa por la API BFF.
 */
export async function fetchAppConfig(): Promise<AppConfigMap> {
  const { data, error } = await supabase
    .from("app_config")
    .select("key, value")
    .eq("active", true)
    .eq("is_public", true);

  if (error) throw toAppError(error);

  const map: AppConfigMap = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }
  return map;
}
