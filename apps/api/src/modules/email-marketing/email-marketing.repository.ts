import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  arrayContains,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import {
  campaigns,
  emailComponents,
  emailSends,
  emailTemplates,
  marketingPreferences,
  segmentUsers,
  segments,
} from '../../database/schema';

export type DbExecutor = Database;

export type ComponentRow = typeof emailComponents.$inferSelect;
export type TemplateRow = typeof emailTemplates.$inferSelect;
export type SegmentRow = typeof segments.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type SendRow = typeof emailSends.$inferSelect;

// ponytail: la tabla llega como any porque el helper `one` es genérico.
type AnyTable = any;

export interface ListFilter {
  page: number;
  limit: number;
  search?: string;
  active?: boolean;
}

/** Filtro de listSegments por categoría (extensión específica). */
export type ListSegmentsFilter = ListFilter & { category?: string };

/**
 * Único repository del módulo: CRUD de componentes/plantillas/segmentos/
 * campañas/envíos más las queries de soporte (destinatarios, cola, stats).
 */
@Injectable()
export class EmailMarketingRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ─── Componentes ───────────────────────────────────────────────────

  async listComponents(f: ListFilter) {
    // Grid muestra inactivos; solo oculta eliminados.
    const filters: SQL[] = [isNull(emailComponents.deleted_at)];
    if (f.active !== undefined)
      filters.push(eq(emailComponents.is_active, f.active));
    if (f.search) filters.push(ilike(emailComponents.name, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return this.paginate(emailComponents, where, f);
  }

  async findComponentById(id: string): Promise<ComponentRow | null> {
    const [row] = await this.db
      .select()
      .from(emailComponents)
      .where(
        and(eq(emailComponents.id, id), isNull(emailComponents.deleted_at)),
      )
      .limit(1);
    return (row as ComponentRow) ?? null;
  }

  insertComponent(values: typeof emailComponents.$inferInsert) {
    return this.db.insert(emailComponents).values(values).returning();
  }

  async updateComponent(
    id: string,
    values: Partial<typeof emailComponents.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(emailComponents)
      .set({ ...values, updated_at: new Date() })
      .where(eq(emailComponents.id, id))
      .returning();
    return row ?? null;
  }

  async deleteComponent(id: string) {
    const [row] = await this.db
      .update(emailComponents)
      .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
      .where(eq(emailComponents.id, id))
      .returning({ id: emailComponents.id });
    return row != null;
  }

  // ─── Plantillas ────────────────────────────────────────────────────

  async listTemplates(f: ListFilter) {
    // Grid muestra inactivos; solo oculta eliminados.
    const filters: SQL[] = [isNull(emailTemplates.deleted_at)];
    if (f.active !== undefined)
      filters.push(eq(emailTemplates.is_active, f.active));
    if (f.search) filters.push(ilike(emailTemplates.name, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return this.paginate(emailTemplates, where, f);
  }

  async findTemplateById(id: string): Promise<TemplateRow | null> {
    const [row] = await this.db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deleted_at)))
      .limit(1);
    return (row as TemplateRow) ?? null;
  }

  insertTemplate(values: typeof emailTemplates.$inferInsert) {
    return this.db.insert(emailTemplates).values(values).returning();
  }

  async updateTemplate(
    id: string,
    values: Partial<typeof emailTemplates.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(emailTemplates)
      .set({ ...values, updated_at: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return row ?? null;
  }

  async deleteTemplate(id: string) {
    const [row] = await this.db
      .update(emailTemplates)
      .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning({ id: emailTemplates.id });
    return row != null;
  }

  // ─── Segmentos ─────────────────────────────────────────────────────

  async listSegments(f: ListSegmentsFilter) {
    // Grid muestra inactivos; solo oculta eliminados.
    const filters: SQL[] = [isNull(segments.deleted_at)];
    if (f.category) filters.push(eq(segments.category, f.category));
    if (f.active !== undefined) filters.push(eq(segments.is_active, f.active));
    if (f.search) filters.push(ilike(segments.name, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return this.paginate(segments, where, f);
  }

  async findSegmentById(id: string): Promise<SegmentRow | null> {
    const [row] = await this.db
      .select()
      .from(segments)
      .where(and(eq(segments.id, id), isNull(segments.deleted_at)))
      .limit(1);
    return (row as SegmentRow) ?? null;
  }

  insertSegment(values: typeof segments.$inferInsert) {
    return this.db.insert(segments).values(values).returning();
  }

  async updateSegment(
    id: string,
    values: Partial<typeof segments.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(segments)
      .set({ ...values, updated_at: new Date() })
      .where(eq(segments.id, id))
      .returning();
    return row ?? null;
  }

  async deleteSegment(id: string) {
    const [row] = await this.db
      .update(segments)
      .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
      .where(eq(segments.id, id))
      .returning({ id: segments.id });
    return row != null;
  }

  /** Soft delete de campaña: desaparece del grid sin romper email_sends. */
  async deleteCampaign(id: string) {
    const [row] = await this.db
      .update(campaigns)
      .set({
        deleted_at: new Date(),
        status: 'cancelled',
        updated_at: new Date(),
      })
      .where(and(eq(campaigns.id, id), eq(campaigns.status, 'draft')))
      .returning({ id: campaigns.id });
    return row != null;
  }

  getSegmentUserIds(segmentId: string): Promise<string[]> {
    return this.db
      .select({ id: segmentUsers.user_id })
      .from(segmentUsers)
      .where(eq(segmentUsers.segment_id, segmentId))
      .then((rows) => rows.map((r) => r.id));
  }

  /** Reemplaza todos los miembros de un segmento estático (edición). */
  async replaceSegmentUsers(segmentId: string, userIds: string[]) {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(segmentUsers)
        .where(eq(segmentUsers.segment_id, segmentId));
      if (userIds.length > 0) {
        await tx
          .insert(segmentUsers)
          .values(
            userIds.map((user_id) => ({ segment_id: segmentId, user_id })),
          );
      }
    });
    const [row] = await this.db
      .select({ c: count() })
      .from(segmentUsers)
      .where(eq(segmentUsers.segment_id, segmentId));
    await this.updateSegment(segmentId, {
      estimated_count: Number(row?.c ?? 0),
    });
  }

  async addSegmentUsers(segmentId: string, userIds: string[]) {
    await this.db
      .insert(segmentUsers)
      .values(userIds.map((user_id) => ({ segment_id: segmentId, user_id })))
      .onConflictDoNothing();
    const [row] = await this.db
      .select({ c: count() })
      .from(segmentUsers)
      .where(eq(segmentUsers.segment_id, segmentId));
    await this.updateSegment(segmentId, {
      estimated_count: Number(row?.c ?? 0),
    });
  }

  /**
   * IDs que cumplen los filtros dinámicos (whitelist validada en Zod).
   * ponytail: resuelve en JS tras traer candidatos (tope razonable para el
   * volumen actual); pasar filtros a SQL puro si las listas superan ~100k.
   */
  async findIdsMatchingFilters(
    filters: { field: string; op: string; value: unknown }[],
  ): Promise<string[]> {
    const conditions = filters.map((f): SQL => {
      const col =
        f.field === 'role'
          ? sql`role`
          : f.field === 'city'
            ? sql`city`
            : sql`created_at`;
      const val = f.value as string;
      switch (f.op) {
        case 'eq':
          return sql`${col} = ${val}`;
        case 'neq':
          return sql`${col} <> ${val}`;
        case 'gte':
          return sql`${col} >= ${val}`;
        case 'lte':
          return sql`${col} <= ${val}`;
        default:
          return sql`${col}::text ilike ${`%${val}%`}`;
      }
    });
    const rows = await this.db
      .select({ id: sql<string>`id` })
      .from(sql`profiles`)
      .where(and(...conditions))
      .limit(50_000);
    return rows.map((r) => r.id);
  }

  /** Destinatarios suscritos dentro de un set de IDs para una categoría. */
  findSubscribedRecipients(
    ids: string[],
    category: string,
  ): Promise<{ user_id: string; email: string; full_name: string | null }[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db
      .select({
        user_id: sql<string>`p.id`,
        email: sql<string>`lower(p.email)`,
        full_name: sql<string | null>`p.full_name`,
      })
      .from(sql`profiles p`)
      .innerJoin(
        marketingPreferences,
        eq(marketingPreferences.user_id, sql`p.id`),
      )
      .where(
        and(
          inArray(sql`p.id`, ids),
          eq(marketingPreferences.is_subscribed, true),
          arrayContains(marketingPreferences.categories, [category]),
        ),
      );
  }

  // ─── Campañas ──────────────────────────────────────────────────────

  async listCampaigns(f: ListFilter & { status?: string }) {
    const filters: SQL[] = [isNull(campaigns.deleted_at)];
    if (f.status) filters.push(sql`status = ${f.status}`);
    if (f.search) filters.push(ilike(campaigns.name, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return this.paginate(campaigns, where, f);
  }

  async getCampaignById(id: string): Promise<CampaignRow | null> {
    const [row] = await this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, id), isNull(campaigns.deleted_at)))
      .limit(1);
    return (row as CampaignRow) ?? null;
  }

  insertCampaign(values: typeof campaigns.$inferInsert) {
    return this.db.insert(campaigns).values(values).returning();
  }

  async updateCampaign(
    id: string,
    values: Partial<typeof campaigns.$inferInsert>,
  ) {
    const [row] = await this.db
      .update(campaigns)
      .set({ ...values, updated_at: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return row ?? null;
  }

  findDueScheduled(now: Date) {
    return this.db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, 'scheduled'),
          lte(campaigns.scheduled_at, now),
        ),
      );
  }

  // ─── Envíos (la cola) ──────────────────────────────────────────────

  insertSends(values: (typeof emailSends.$inferInsert)[]): Promise<SendRow[]> {
    if (values.length === 0) return Promise.resolve([]);
    return this.db.insert(emailSends).values(values).returning();
  }

  /** Lote de envíos pendientes — BD fuente de verdad, BullMQ solo ejecuta. */
  findQueuedBatch(campaignId: string, limit: number): Promise<SendRow[]> {
    // Compat: campaignId se mapea a source_type='campaign' + source_id
    return this.db
      .select()
      .from(emailSends)
      .where(
        and(
          eq(emailSends.type, 'campaign'),
          eq(emailSends.source_type, 'campaign'),
          eq(emailSends.source_id, campaignId),
          sql`status in ('pending','queued') and attempts < max_attempts`,
        ),
      )
      .orderBy(emailSends.scheduled_at)
      .limit(limit);
  }

  /** Lote genérico para cron que busca pendientes/fallidos reintentables */
  findPendingBatch(limit: number): Promise<SendRow[]> {
    return this.db
      .select()
      .from(emailSends)
      .where(sql`status in ('pending','queued','failed') and attempts < max_attempts and (scheduled_at is null or scheduled_at <= now())`)
      .orderBy(emailSends.scheduled_at)
      .limit(limit);
  }

  async markProcessing(id: string) {
    await this.db
      .update(emailSends)
      .set({ status: 'processing', processed_at: new Date(), updated_at: new Date() })
      .where(eq(emailSends.id, id));
  }

  async markSent(id: string, resendId: string | null) {
    await this.db
      .update(emailSends)
      .set({
        status: 'sent',
        resend_id: resendId,
        sent_at: new Date(),
        processed_at: new Date(),
        attempts: sql`attempts + 1`,
        updated_at: new Date(),
      })
      .where(eq(emailSends.id, id));
  }

  async markFailed(id: string, message: string, code?: string) {
    await this.db
      .update(emailSends)
      .set({
        status: sql`case when attempts + 1 >= max_attempts then 'failed'::email_send_status else 'queued'::email_send_status end`,
        error_message: message.slice(0, 500),
        error_code: code ?? null,
        attempts: sql`attempts + 1`,
        scheduled_at: sql`case when attempts + 1 < max_attempts then now() + (interval '5 minutes' * (attempts + 1)) else scheduled_at end`,
        updated_at: new Date(),
      })
      .where(eq(emailSends.id, id));
  }

  async markCancelled(id: string) {
    await this.db.update(emailSends).set({ status: 'cancelled', updated_at: new Date() }).where(eq(emailSends.id, id));
  }

  async deleteSendsByCampaign(campaignId: string): Promise<void> {
    await this.db.delete(emailSends).where(and(eq(emailSends.type, 'campaign'), eq(emailSends.source_type, 'campaign'), eq(emailSends.source_id, campaignId)));
  }

  /** ¿Quedan envíos en cola para esta campaña? */
  async countQueued(campaignId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: count() })
      .from(emailSends)
      .where(
        and(
          eq(emailSends.type, 'campaign'),
          eq(emailSends.source_type, 'campaign'),
          eq(emailSends.source_id, campaignId),
          sql`status in ('pending','queued')`,
        ),
      );
    return Number(row?.c ?? 0);
  }

  /** Webhook de Resend → estado/timestamp del envío correspondiente. */
  async applyResendEvent(resendId: string, eventType: string): Promise<void> {
    const map: Record<string, { status: string; at: string }> = {
      'email.sent': { status: 'sent', at: 'sent_at' },
      'email.delivered': { status: 'delivered', at: 'delivered_at' },
      'email.opened': { status: 'opened', at: 'opened_at' },
      'email.clicked': { status: 'clicked', at: 'clicked_at' },
      'email.bounced': { status: 'bounced', at: 'bounced_at' },
      'email.complained': { status: 'complained', at: 'updated_at' },
    };
    const target = map[eventType];
    if (!target) return;
    await this.db.execute(sql`
      update email_sends
      set status = ${target.status}::email_send_status,
          ${sql.raw(target.at)} = now(),
          updated_at = now()
      where resend_id = ${resendId}
        and (status <> 'clicked')
    `);
  }

  listSendsByCampaign(campaignId: string, f: ListFilter & { status?: string }) {
    const filters: SQL[] = [eq(emailSends.type, 'campaign'), eq(emailSends.source_type, 'campaign'), eq(emailSends.source_id, campaignId)];
    if (f.status)
      filters.push(eq(emailSends.status, f.status as SendRow['status']));
    return this.paginate(emailSends, and(...filters), f);
  }

  async listSends(f: ListFilter & { status?: string; type?: string; source_type?: string | null; source_id?: string | null; search?: string }) {
    const filters: SQL[] = [];
    if (f.status) filters.push(eq(emailSends.status, f.status as SendRow['status']));
    if (f.type) filters.push(eq(emailSends.type, f.type as SendRow['type']));
    if (f.source_type) filters.push(eq(emailSends.source_type, f.source_type));
    if (f.source_id) filters.push(eq(emailSends.source_id, f.source_id));
    if (f.search) filters.push(ilike(emailSends.email, `%${f.search}%`));
    const where = filters.length ? and(...filters) : undefined;
    return this.paginate(emailSends, where, f);
  }

  async findSendById(id: string): Promise<SendRow | null> {
    const [row] = await this.db.select().from(emailSends).where(eq(emailSends.id, id)).limit(1);
    return (row as SendRow) ?? null;
  }

  async updateSend(id: string, values: Partial<typeof emailSends.$inferInsert>) {
    const [row] = await this.db.update(emailSends).set({ ...values, updated_at: new Date() }).where(eq(emailSends.id, id)).returning();
    return row ?? null;
  }

  /** Recalcula contadores de campaña desde email_sends (auto-consistente). */
  async recountStats(campaignId: string) {
    await this.db.execute(sql`
      update campaigns c set
        total_recipients = s.total,
        total_sent = s.sent,
        total_delivered = s.delivered,
        total_opened = s.opened,
        total_clicked = s.clicked,
        total_bounced = s.bounced,
        updated_at = now()
      from (
        select
          count(*) as total,
          count(*) filter (where status <> 'pending' and status <> 'queued') as sent,
          count(*) filter (where status in ('delivered','opened','clicked')) as delivered,
          count(*) filter (where status in ('opened','clicked')) as opened,
          count(*) filter (where status = 'clicked') as clicked,
          count(*) filter (where status in ('bounced','complained')) as bounced
        from email_sends where type = 'campaign' and source_type = 'campaign' and source_id = ${campaignId}::uuid
      ) s
      where c.id = ${campaignId}
    `);
  }

  // ─── Preferencias ──────────────────────────────────────────────────

  async unsubscribe(userId: string) {
    await this.db
      .insert(marketingPreferences)
      .values({
        user_id: userId,
        is_subscribed: false,
        unsubscribed_at: new Date(),
        source: 'email_link',
      })
      .onConflictDoUpdate({
        target: marketingPreferences.user_id,
        set: {
          is_subscribed: false,
          unsubscribed_at: new Date(),
          updated_at: new Date(),
        },
      });
  }

  // ─── Helpers genéricos ─────────────────────────────────────────────

  private async paginate(
    table: AnyTable,
    where: SQL | undefined,
    f: ListFilter,
    // ponytail: filas como any — el mapper es quien las tipa hacia fuera.
  ): Promise<{ rows: any[]; total: number }> {
    const [totalRow] = await this.db
      .select({ c: count() })
      .from(table)
      .where(where);
    const rows = await this.db
      .select()
      .from(table)
      .where(where)
      .orderBy(desc(sql`created_at`))
      .limit(f.limit)
      .offset((f.page - 1) * f.limit);
    return { rows, total: Number(totalRow?.c ?? 0) };
  }
}
