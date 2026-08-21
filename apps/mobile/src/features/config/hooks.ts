import { getConfigValue } from "@0xc1x/role-commons";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchAppConfig } from "./api";

export const APP_CONFIG_QUERY_KEY = ["app-config"] as const;

/** Query options de la configuración global (se precarga en la splash screen). */
export const appConfigQueryOptions = {
  queryKey: APP_CONFIG_QUERY_KEY,
  queryFn: fetchAppConfig,
  // La config cambia rara vez; con refetch al reiniciar la app basta.
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  retry: 1,
};

/**
 * Hook de lectura de un valor de configuración con fallback seguro.
 * Si la carga falló u aún no termina, devuelve el fallback (la app
 * nunca se bloquea por config).
 */
export function useConfigValue(key: string, fallback: string): string;
export function useConfigValue(key: string, fallback: number): number;
export function useConfigValue(key: string, fallback: boolean): boolean;
export function useConfigValue(
  key: string,
  fallback: string | number | boolean,
): string | number | boolean {
  const { data } = useQuery(appConfigQueryOptions);
  return getConfigValue(data, key, fallback as string);
}

/** Acceso crudo al mapa completo (para pantallas que leen varias claves). */
export function useAppConfig(): UseQueryResult<
  Awaited<ReturnType<typeof fetchAppConfig>>,
  Error
> {
  return useQuery(appConfigQueryOptions);
}
