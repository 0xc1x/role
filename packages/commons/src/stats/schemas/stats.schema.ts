import { z } from 'zod';

/**
 * Métricas reales de la plataforma, calculadas en la API a partir de
 * profiles / businesses / orders. Consumidas por la landing (hero, about).
 */
export const PlatformStatsSchema = z.object({
  /** Usuarios registrados (perfiles activos). */
  users: z.number().int().nonnegative(),
  /** Negocios publicados y activos. */
  businesses: z.number().int().nonnegative(),
  /** Comidas salvadas: órdenes completadas/recogidas. */
  meals_saved: z.number().int().nonnegative(),
});

export type PlatformStats = z.infer<typeof PlatformStatsSchema>;
