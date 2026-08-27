import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  consumerNotificationPreferences,
  profiles,
  userConsents,
  userPreferences,
} from '../../database/schema';

export type ProfileRow = typeof profiles.$inferSelect;

export interface ListProfilesFilter {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  /** Solo perfiles con esta categoría habilitada y suscripción activa. */
  subscribedTo?: string;
}

/**
 * Solo lectura/edición: la creación y el borrado de cuentas viven en
 * Supabase Auth (trigger handle_new_user crea el perfil).
 */
@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(
    f: ListProfilesFilter,
  ): Promise<{ rows: ProfileRow[]; total: number }> {
    const filters: SQL[] = [];
    if (f.role) filters.push(eq(profiles.role, f.role as ProfileRow['role']));
    if (f.search) {
      const term = `%${f.search}%`;
      filters.push(
        or(ilike(profiles.email, term), ilike(profiles.full_name, term))!,
      );
    }
    // Subscripción activa a la categoría (sin join: subquery simple).
    if (f.subscribedTo) {
      filters.push(
        sql`id in (
          select user_id from marketing_preferences
          where is_subscribed and ${f.subscribedTo} = any(categories)
        )`,
      );
    }
    const where = filters.length ? and(...filters) : undefined;

    const [totalRow] = await this.db
      .select({ c: count() })
      .from(profiles)
      .where(where);
    const rows = await this.db
      .select()
      .from(profiles)
      .where(where)
      .orderBy(desc(profiles.created_at))
      .limit(f.limit)
      .offset((f.page - 1) * f.limit);

    return { rows, total: Number(totalRow?.c ?? 0) };
  }

  async findById(id: string): Promise<ProfileRow | null> {
    const [row] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .limit(1);
    return row ?? null;
  }

  async update(
    id: string,
    values: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'city' | 'role'>>,
  ): Promise<ProfileRow | null> {
    const [row] = await this.db
      .update(profiles)
      .set({ ...values, updated_at: new Date() })
      .where(eq(profiles.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Espejo de los triggers `create_user_preferences` +
   * `consumer_notification_preferences` + `create_default_consents`
   * (ADR-0008). Idempotente: ON CONFLICT DO NOTHING como el SQL.
   */
  async insertRegistrationDefaults(userId: string): Promise<void> {
    const tx = this.db;
    await tx
      .insert(userPreferences)
      .values({ user_id: userId })
      .onConflictDoNothing();
    await tx
      .insert(consumerNotificationPreferences)
      .values({ user_id: userId })
      .onConflictDoNothing();
    await tx
      .insert(userConsents)
      .values([
        { user_id: userId, consent_type: 'analytics', granted: false },
        { user_id: userId, consent_type: 'marketing', granted: false },
        { user_id: userId, consent_type: 'notifications', granted: true },
      ])
      .onConflictDoNothing();
  }
}
