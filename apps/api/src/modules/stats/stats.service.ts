import { Injectable } from '@nestjs/common';
import { count, eq, inArray } from 'drizzle-orm';
import type { PlatformStats } from '@0xc1x/role-commons';
import { Inject } from '@nestjs/common';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { businesses, orders, profiles } from '../../database/schema';

/** Estados que cuentan como "comida salvada" (orden entregada al usuario). */
const MEALS_SAVED_STATUSES = ['completed', 'picked_up'] as const;

/** TTL corto: el endpoint es público (hero de landing) y son 3 count(*) sin índice útil. */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class StatsService {
  private cache: { value: PlatformStats; expiresAt: number } | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async getPlatformStats(): Promise<PlatformStats> {
    if (this.cache && Date.now() < this.cache.expiresAt) {
      return this.cache.value;
    }
    const stats = await this.computePlatformStats();
    this.cache = { value: stats, expiresAt: Date.now() + CACHE_TTL_MS };
    return stats;
  }

  private async computePlatformStats(): Promise<PlatformStats> {
    const [usersRow] = await this.db.select({ count: count() }).from(profiles);
    const [businessesRow] = await this.db
      .select({ count: count() })
      .from(businesses)
      .where(eq(businesses.is_active, true));
    const [mealsRow] = await this.db
      .select({ count: count() })
      .from(orders)
      .where(inArray(orders.status, [...MEALS_SAVED_STATUSES]));

    return {
      users: usersRow?.count ?? 0,
      businesses: businessesRow?.count ?? 0,
      meals_saved: mealsRow?.count ?? 0,
    };
  }
}
