import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  deviceTokens,
  profiles,
  pushNotifications,
  pushTemplates,
} from '../../database/schema';

export type PushTemplateRow = typeof pushTemplates.$inferSelect;
export type PushNotificationRow = typeof pushNotifications.$inferSelect;
export type PushTokenRow = typeof deviceTokens.$inferSelect;

export interface PushListFilter {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
}

export type ListTokensFilter = PushListFilter & { platform?: 'ios' | 'android' | 'web' };

/** Usuario con su nombre para renderizar variables por destinatario. */
export interface ProfileName {
  user_id: string;
  full_name: string | null;
}

/** Acceso drizzle a push_templates, push_notifications y device_tokens. */
@Injectable()
export class PushNotificationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ─── Plantillas ────────────────────────────────────────────────────

  async listTemplates(f: PushListFilter) {
    // Grid muestra inactivas; solo oculta eliminadas.
    const filters: SQL[] = [isNull(pushTemplates.deleted_at)];
    if (f.active !== undefined)
      filters.push(eq(pushTemplates.is_active, f.active));
    if (f.search) filters.push(ilike(pushTemplates.name, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await this.db
      .select({ c: count() })
      .from(pushTemplates)
      .where(where);
    const rows = await this.db
      .select()
      .from(pushTemplates)
      .where(where)
      .orderBy(desc(pushTemplates.created_at))
      .limit(f.limit)
      .offset((f.page - 1) * f.limit);
    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  async findTemplateById(id: string): Promise<PushTemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(pushTemplates)
      .where(and(eq(pushTemplates.id, id), isNull(pushTemplates.deleted_at)))
      .limit(1);
    return row ?? null;
  }

  insertTemplate(values: typeof pushTemplates.$inferInsert) {
    return this.db.insert(pushTemplates).values(values).returning();
  }

  async updateTemplate(
    id: string,
    values: Partial<typeof pushTemplates.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(pushTemplates)
      .set({ ...values, updated_at: new Date() })
      .where(eq(pushTemplates.id, id))
      .returning();
    return row ?? null;
  }

  async deleteTemplate(id: string) {
    const [row] = await this.db
      .update(pushTemplates)
      .set({
        deleted_at: new Date(),
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(pushTemplates.id, id))
      .returning({ id: pushTemplates.id });
    return row != null;
  }

  // ─── Historial de envíos ───────────────────────────────────────────

  async listNotifications(
    f: PushListFilter & { type?: string },
  ) {
    const filters: SQL[] = [];
    if (f.type) filters.push(eq(pushNotifications.type, f.type));
    if (f.search) filters.push(ilike(pushNotifications.title, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    const [totalRow] = await this.db
      .select({ c: count() })
      .from(pushNotifications)
      .where(where);
    const rows = await this.db
      .select()
      .from(pushNotifications)
      .where(where)
      .orderBy(desc(pushNotifications.created_at))
      .limit(f.limit)
      .offset((f.page - 1) * f.limit);
    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  async findNotificationById(id: string): Promise<PushNotificationRow | null> {
    const [row] = await this.db
      .select()
      .from(pushNotifications)
      .where(eq(pushNotifications.id, id))
      .limit(1);
    return row ?? null;
  }

  insertNotification(values: typeof pushNotifications.$inferInsert) {
    return this.db.insert(pushNotifications).values(values).returning();
  }

  // ─── Dispositivos (device_tokens) ──────────────────────────────────

  async listTokens(f: ListTokensFilter) {
    const filters: SQL[] = [];
    if (f.platform) filters.push(eq(deviceTokens.platform, f.platform));
    if (f.active !== undefined)
      filters.push(eq(deviceTokens.is_active, f.active));
    if (f.search) {
      const term = `%${f.search}%`;
      const searchFilter = or(
        ilike(profiles.email, term),
        ilike(profiles.full_name, term),
        ilike(deviceTokens.token, term),
      );
      if (searchFilter) filters.push(searchFilter);
    }
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ c: count() })
      .from(deviceTokens)
      .innerJoin(profiles, eq(profiles.id, deviceTokens.user_id))
      .where(where);
    const rows = await this.db
      .select({
        id: deviceTokens.id,
        user_id: deviceTokens.user_id,
        user_email: profiles.email,
        user_full_name: profiles.full_name,
        token: deviceTokens.token,
        platform: deviceTokens.platform,
        is_active: deviceTokens.is_active,
        created_at: deviceTokens.created_at,
        updated_at: deviceTokens.updated_at,
      })
      .from(deviceTokens)
      .innerJoin(profiles, eq(profiles.id, deviceTokens.user_id))
      .where(where)
      .orderBy(desc(deviceTokens.updated_at))
      .limit(f.limit)
      .offset((f.page - 1) * f.limit);
    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  async updateToken(id: string, values: { is_active: boolean }) {
    const [row] = await this.db
      .update(deviceTokens)
      .set({ ...values, updated_at: new Date() })
      .where(eq(deviceTokens.id, id))
      .returning({
        id: deviceTokens.id,
        user_id: deviceTokens.user_id,
        token: deviceTokens.token,
        platform: deviceTokens.platform,
        is_active: deviceTokens.is_active,
        created_at: deviceTokens.created_at,
        updated_at: deviceTokens.updated_at,
      });
    return row ?? null;
  }

  // ─── Audiencia ─────────────────────────────────────────────────────

  /** Cuenta cuántos de estos usuarios tienen al menos un token activo. */
  async countUsersWithActiveTokens(userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const rows = await this.db
      .selectDistinct({ user_id: deviceTokens.user_id })
      .from(deviceTokens)
      .where(
        and(
          inArray(deviceTokens.user_id, userIds),
          eq(deviceTokens.is_active, true),
        ),
      );
    return rows.length;
  }

  /** Nombres de perfil para renderizar `{{nombre}}` por destinatario. */
  async findProfileNames(userIds: string[]): Promise<ProfileName[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        user_id: profiles.id,
        full_name: profiles.full_name,
      })
      .from(profiles)
      .where(inArray(profiles.id, userIds));
  }

  /**
   * Usuarios de la audiencia con push habilitado (sin fila = permitido,
   * false = excluido). Mismo criterio que NotificationsRepository.
   */
  async filterPushEnabled(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const prefs = await this.db
      .select({
        user_id: consumerNotificationPreferences.user_id,
        push_enabled: consumerNotificationPreferences.push_enabled,
      })
      .from(consumerNotificationPreferences)
      .where(inArray(consumerNotificationPreferences.user_id, userIds));
    const prefMap = new Map(prefs.map((p) => [p.user_id, p.push_enabled]));
    return userIds.filter((id) => prefMap.get(id) !== false);
  }

  /** Usuarios eliminados (sin fila en profiles) para purgarlos de la audiencia. */
  async filterExistingUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(inArray(profiles.id, userIds));
    return rows.map((r) => r.id);
  }
}
