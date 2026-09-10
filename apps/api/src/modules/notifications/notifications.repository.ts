import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  deviceTokens,
} from '../../database/schema';

export type PushTarget = {
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
};

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findActiveTokens(userIds: string[]): Promise<PushTarget[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        user_id: deviceTokens.user_id,
        token: deviceTokens.token,
        platform: deviceTokens.platform,
      })
      .from(deviceTokens)
      .where(
        and(
          inArray(deviceTokens.user_id, userIds),
          eq(deviceTokens.is_active, true),
        ),
      );
    return rows as PushTarget[];
  }

  async deactivateToken(token: string): Promise<void> {
    await this.db
      .update(deviceTokens)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(deviceTokens.token, token));
  }

  async cleanupOldTokens(): Promise<number> {
    const rows = await this.db
      .delete(deviceTokens)
      .where(
        and(
          eq(deviceTokens.is_active, false),
          sql`${deviceTokens.updated_at} < now() - interval '90 days'`,
        ),
      )
      .returning({ id: deviceTokens.id });
    return rows.length;
  }

  /** Filtra userIds respetando consumer_notification_preferences (sin fila = permitido, false = excluido). */
  async filterByConsumerPrefs(
    userIds: string[],
    flag: keyof typeof consumerNotificationPreferences._.columns,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    // No pref row => allowed; false => excluded. Use left join semantics via NOT EXISTS pattern via subquery.
    // Fetch prefs for those users
    const prefs = await this.db
      .select()
      .from(consumerNotificationPreferences)
      .where(inArray(consumerNotificationPreferences.user_id, userIds));

    const prefMap = new Map(prefs.map((p) => [p.user_id, p as Record<string, unknown>]));
    return userIds.filter((id) => {
      const pref = prefMap.get(id);
      if (!pref) return true; // sin fila = permitido
      return (pref[flag as string] as boolean) !== false;
    });
  }

  /**
   * Excluye los usuarios cuyo quiet-hours cubre la hora actual del servidor.
   * 1 query para todo el lote (antes: 1 SELECT por usuario en el fanout).
   * Sin fila o sin ventana configurada = permitido.
   */
  async filterNotInQuietHours(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({
        user_id: consumerNotificationPreferences.user_id,
        from: consumerNotificationPreferences.quiet_hours_from,
        to: consumerNotificationPreferences.quiet_hours_to,
      })
      .from(consumerNotificationPreferences)
      .where(inArray(consumerNotificationPreferences.user_id, userIds));
    const quietMap = new Map(rows.map((r) => [r.user_id, r]));

    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    // Simple range check (does not handle overnight wrap, ponytail simplification)
    return userIds.filter((id) => {
      const row = quietMap.get(id);
      if (!row?.from || !row?.to) return true;
      return !(cur >= row.from && cur <= row.to);
    });
  }
}
