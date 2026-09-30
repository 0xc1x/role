import { BadRequestException, Injectable } from '@nestjs/common';
import type { RevenueStats, RevenueStatsQuery } from '@0xc1x/role-commons';
import { RevenueStatsMapper } from './revenue-stats.mapper';
import {
  RevenueStatsRepository,
  type RevenuePeriod,
} from './revenue-stats.repository';

/** Ventana por defecto: los últimos 30 días, contando hoy. */
export const REVENUE_PERIOD_DEFAULT_DAYS = 30;

/** `YYYY-MM-DD` en UTC. El reporte no tiene zona horaria configurable. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftUtcDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return toDateString(shifted);
}

/**
 * Resuelve la ventana pedida a una efectiva. Si falta `from` o `to`, se
 * completa con los últimos {@link REVENUE_PERIOD_DEFAULT_DAYS} días: el período
 * se devuelve en la respuesta para que el cliente nunca tenga que suponerlo.
 */
export function resolveRevenuePeriod(
  query: RevenueStatsQuery,
  now: Date = new Date(),
): RevenuePeriod {
  const to = query.to ?? toDateString(now);
  const from =
    query.from ?? shiftUtcDays(to, -(REVENUE_PERIOD_DEFAULT_DAYS - 1));

  // `YYYY-MM-DD` ordena lexicográficamente igual que por fecha.
  if (from > to) {
    throw new BadRequestException(
      `Período inválido: from (${from}) no puede ser posterior a to (${to})`,
    );
  }

  return { from, to };
}

@Injectable()
export class RevenueStatsService {
  constructor(private readonly repo: RevenueStatsRepository) {}

  async getRevenueStats(query: RevenueStatsQuery): Promise<RevenueStats> {
    const period = resolveRevenuePeriod(query);
    // Devengado y cobrado viajan en paralelo: son agregados distintos sobre
    // tablas distintas y ninguno espera al otro.
    const [accrued, collected] = await Promise.all([
      this.repo.accrued(period),
      this.repo.collected(period),
    ]);

    return RevenueStatsMapper.toDto({ period, accrued, collected });
  }
}
