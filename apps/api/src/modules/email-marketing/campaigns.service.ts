import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  paginatedDataFromQuery,
  type CampaignDto,
  type EmailSendDto,
  type RenderedEmail,
  type TestCampaignDto,
} from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import type { CampaignChannelDispatcher } from '../../common/campaigns/campaign-dispatcher.port';
import { MAX_AUDIENCE_SIZE, RecipientsService } from './recipients.service';
import { RendererService } from './renderer.service';
import {
  EmailMarketingRepository,
  type ListFilter,
  type ListSegmentsFilter,
} from './email-marketing.repository';
import { EmailMarketingMapper } from './mappers/email-marketing.mapper';
import type { CampaignRow } from './email-marketing.repository';
import type {
  campaigns,
  emailComponents,
  emailSends,
  emailTemplates,
  segments,
} from '../../database/schema';

const BATCH_SIZE = 50;

/**
 * Orquestación de campañas: preview → test → encolar producción.
 * Cola DB (email_sends) + BullMQ (email-expedition) con rate-limit Resend 10/s.
 * Sin REDIS_URL cae a ejecución directa (dev).
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly resend: Resend | null;
  /** Dispatchers por canal (push se auto-registra; email va inline). */
  private readonly channelDispatchers = new Map<string, CampaignChannelDispatcher>();

  constructor(
    private readonly repository: EmailMarketingRepository,
    private readonly renderer: RendererService,
    private readonly recipients: RecipientsService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @InjectQueue('email-expedition') private readonly queue?: Queue<{ campaignId: string }>,
  ) {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  /** Registro de dispatcher de canal (lo llama el módulo dueño del canal). */
  registerChannelDispatcher(dispatcher: CampaignChannelDispatcher): void {
    this.channelDispatchers.set(dispatcher.channel, dispatcher);
    this.logger.log(`Canal de campañas registrado: ${dispatcher.channel}`);
  }

  private channelDispatcher(channel: string): CampaignChannelDispatcher | null {
    return this.channelDispatchers.get(channel) ?? null;
  }

  /** Valida que la plantilla indicada exista según el canal de la campaña. */
  async assertTemplateForChannel(
    channel: string,
    templateId: string | null,
  ): Promise<void> {
    if (!templateId) {
      throw new BadRequestException('La campaña requiere una plantilla');
    }
    if (channel === 'push') {
      const dispatcher = this.channelDispatcher('push');
      if (!dispatcher) {
        throw new BadRequestException('Canal push no disponible');
      }
      await dispatcher.assertTemplate(templateId);
      return;
    }
    const template = await this.repository.findTemplateById(templateId);
    if (!template) {
      throw new BadRequestException('Plantilla de email no encontrada');
    }
  }

  /** Render completo (header+body+footer) con vars de ejemplo (admin UI). */
  async preview(input: {
    templateId: string;
    subjectOverride?: string | null;
    bodyOverride?: string | null;
  }): Promise<RenderedEmail> {
    const template = await this.repository.findTemplateById(input.templateId);
    if (!template) throw new NotFoundException('Plantilla no encontrada');

    const [header, footer] = await Promise.all([
      template.header_id
        ? this.repository.findComponentById(template.header_id)
        : Promise.resolve(null),
      template.footer_id
        ? this.repository.findComponentById(template.footer_id)
        : Promise.resolve(null),
    ]);

    const html = this.renderer.assemble({
      headerHtml: header?.html_content ?? null,
      bodyHtml: input.bodyOverride ?? template.body_html,
      footerHtml: footer?.html_content ?? null,
      vars: this.buildSampleVars(),
    });

    return {
      subject: this.renderer.renderVariables(
        input.subjectOverride ?? template.subject,
        this.buildSampleVars(),
      ),
      html,
      variables_used: Array.isArray(template.variables)
        ? (template.variables as string[])
        : [],
    };
  }

  /** Envío real a emails fijos con el mismo pipeline. No se registra. */
  async test(
    campaignId: string,
    dto: TestCampaignDto,
  ): Promise<{ sent: number }> {
    const campaign = await this.getCampaignOrFail(campaignId);
    if (campaign.channel !== 'email') {
      throw new BadRequestException(
        'Las campañas push se prueban con el test de plantillas push',
      );
    }
    if (!campaign.template_id) {
      throw new BadRequestException('La campaña no tiene plantilla');
    }
    const vars = {
      nombre: 'Ana Torres',
      empresa: 'Panadería La Espiga',
      unsubscribe_url: this.renderer.unsubscribeUrl('test'),
    };
    const rendered = await this.renderCampaign(campaign, vars);
    rendered.subject = `[TEST] ${rendered.subject}`;
    if (dto.overrides?.body_html) {
      const { header, footer } = await this.loadParts(campaign.template_id);
      rendered.html = this.renderer.assemble({
        headerHtml: header?.html_content ?? null,
        bodyHtml: dto.overrides.body_html,
        footerHtml: footer?.html_content ?? null,
        vars,
      });
    }
    let sent = 0;
    for (const email of dto.emails) {
      try {
        await this.deliver(email, rendered);
        sent++;
      } catch (err) {
        this.logger.warn(`Test a ${email} falló: ${String(err)}`);
      }
    }
    return { sent };
  }

  /** Prueba directa de una plantilla (sin campaña) a emails fijos. */
  async testTemplate(
    templateId: string,
    emails: string[],
  ): Promise<{ sent: number }> {
    const rendered = await this.preview({ templateId });
    rendered.subject = `[TEST] ${rendered.subject}`;
    let sent = 0;
    for (const email of emails) {
      try {
        await this.deliver(email, rendered);
        sent++;
      } catch (err) {
        this.logger.warn(`Test de plantilla a ${email} falló: ${String(err)}`);
      }
    }
    return { sent };
  }

  /** Producción: resuelve destinatarios y encola un email_sends por persona. */
  async send(campaignId: string): Promise<CampaignDto> {
    const campaign = await this.getCampaignOrFail(campaignId);
    if (
      campaign.status !== 'draft' &&
      campaign.status !== 'scheduled' &&
      campaign.status !== 'failed'
    ) {
      throw new BadRequestException(
        `Solo se pueden enviar campañas draft, scheduled o failed (estado actual: ${campaign.status})`,
      );
    }
    if (!campaign.template_id) {
      throw new BadRequestException('La campaña no tiene plantilla');
    }
    // Canales no-email delegan en su dispatcher (audiencia y ledger propios).
    if (campaign.channel !== 'email') {
      const dispatcher = this.channelDispatcher(campaign.channel);
      if (!dispatcher) {
        throw new BadRequestException(
          `Canal ${campaign.channel} no disponible`,
        );
      }
      return dispatcher.enqueueAndStart(campaign);
    }
    if (!campaign.segment_ids?.length && !campaign.include_user_ids?.length) {
      throw new BadRequestException(
        'Selecciona al menos un segmento o usuarios incluidos',
      );
    }
    const recipients = await this.recipients.resolve(
      {
        segmentIds: campaign.segment_ids ?? [],
        includeUserIds: campaign.include_user_ids ?? [],
        excludeUserIds: campaign.exclude_user_ids ?? [],
      },
      campaign.category,
    );
    if (recipients.length === 0) {
      throw new BadRequestException(
        'Ningún destinatario cumple los criterios: revisa que los segmentos tengan usuarios y que estén suscritos a la categoría de la campaña',
      );
    }
    if (recipients.length > MAX_AUDIENCE_SIZE) {
      throw new BadRequestException(
        `Audiencia demasiado grande (${recipients.length}): el máximo por envío es ${MAX_AUDIENCE_SIZE} — reduce los segmentos`,
      );
    }
    if (campaign.status === 'failed') {
      // Reintento: limpiar los registros del intento anterior.
      await this.repository.deleteSendsByCampaign(campaign.id);
    }
    // Sin RESEND_API_KEY deliver() simula éxito por envío (dev).
    return this.enqueueAndStart(campaign, recipients);
  }

  /** Alcance real de una campaña antes de enviarla. */
  async countAudience(campaignId: string): Promise<{ total: number }> {
    const campaign = await this.getCampaignOrFail(campaignId);
    const recipients = await this.recipients.resolve(
      {
        segmentIds: campaign.segment_ids ?? [],
        includeUserIds: campaign.include_user_ids ?? [],
        excludeUserIds: campaign.exclude_user_ids ?? [],
      },
      campaign.category,
    );
    return { total: recipients.length };
  }

  async cancel(campaignId: string): Promise<CampaignDto> {
    const campaign = await this.getCampaignOrFail(campaignId);
    if (
      campaign.status !== 'draft' &&
      campaign.status !== 'sending' &&
      campaign.status !== 'scheduled'
    ) {
      throw new BadRequestException(
        `No se puede cancelar una campaña en estado ${campaign.status}`,
      );
    }
    const updated = await this.repository.updateCampaign(campaign.id, {
      status: 'cancelled',
    });
    return EmailMarketingMapper.toCampaignDto(updated!);
  }

  getCampaign(campaignId: string) {
    return this.repository.getCampaignById(campaignId);
  }

  // ─── CRUD delegado (los controllers no tocan el repository) ───

  listComponents(f: ListFilter) {
    return this.repository.listComponents(f);
  }

  insertComponent(values: typeof emailComponents.$inferInsert) {
    return this.repository.insertComponent(values);
  }

  updateComponent(
    id: string,
    values: Partial<typeof emailComponents.$inferInsert>,
  ) {
    return this.repository.updateComponent(id, values);
  }

  deleteComponent(id: string) {
    return this.repository.deleteComponent(id);
  }

  listTemplates(f: ListFilter) {
    return this.repository.listTemplates(f);
  }

  insertTemplate(values: typeof emailTemplates.$inferInsert) {
    return this.repository.insertTemplate(values);
  }

  updateTemplate(
    id: string,
    values: Partial<typeof emailTemplates.$inferInsert>,
  ) {
    return this.repository.updateTemplate(id, values);
  }

  deleteTemplate(id: string) {
    return this.repository.deleteTemplate(id);
  }

  listSegments(f: ListSegmentsFilter) {
    return this.repository.listSegments(f);
  }

  insertSegment(values: typeof segments.$inferInsert) {
    return this.repository.insertSegment(values);
  }

  updateSegment(id: string, values: Partial<typeof segments.$inferInsert>) {
    return this.repository.updateSegment(id, values);
  }

  deleteSegment(id: string) {
    return this.repository.deleteSegment(id);
  }

  getSegmentUserIds(segmentId: string): Promise<string[]> {
    return this.repository.getSegmentUserIds(segmentId);
  }

  replaceSegmentUsers(segmentId: string, userIds: string[]) {
    return this.repository.replaceSegmentUsers(segmentId, userIds);
  }

  addSegmentUsers(segmentId: string, userIds: string[]) {
    return this.repository.addSegmentUsers(segmentId, userIds);
  }

  listCampaigns(f: ListFilter & { status?: string; channel?: string }) {
    return this.repository.listCampaigns(f);
  }

  insertCampaign(values: typeof campaigns.$inferInsert) {
    return this.repository.insertCampaign(values);
  }

  updateCampaign(
    id: string,
    values: Partial<typeof campaigns.$inferInsert>,
  ) {
    return this.repository.updateCampaign(id, values);
  }

  deleteCampaign(id: string) {
    return this.repository.deleteCampaign(id);
  }

  listAllSends(
    f: ListFilter & {
      status?: string;
      type?: string;
      source_type?: string | null;
      source_id?: string | null;
    },
  ) {
    return this.repository.listSends(f);
  }

  findSendById(id: string) {
    return this.repository.findSendById(id);
  }

  updateSend(id: string, values: Partial<typeof emailSends.$inferInsert>) {
    return this.repository.updateSend(id, values);
  }

  /** Webhook de Resend (ruta pública) → estado del envío. */
  applyResendEvent(resendId: string, eventType: string): Promise<void> {
    return this.repository.applyResendEvent(resendId, eventType);
  }

  /** Baja por enlace del footer (ruta pública). */
  unsubscribe(userId: string): Promise<void> {
    return this.repository.unsubscribe(userId);
  }

  /**
   * Tick del cron: campañas programadas vencidas + transaccionales siempre;
   * drenado de `sending` solo sin BullMQ. Con REDIS_URL los lotes sending son
   * del worker (email-expedition.processor) — el tick los tocaría en paralelo
   * sobre el mismo SELECT sin claim atómico y duplicaría envíos.
   */
  async processTick(): Promise<{ processed: number }> {
    let processed = 0;
    for (const due of await this.repository.findDueScheduled(new Date())) {
      try {
        await this.send(due.id);
      } catch (err) {
        this.logger.error(`Campaña programada ${due.id} falló`, err);
        try {
          await this.repository.updateCampaign(due.id, { status: 'failed' });
        } catch (updateErr) {
          this.logger.error(
            `No se pudo marcar failed ${due.id}: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
          );
        }
      }
    }

    // BullMQ es dueño de los lotes sending cuando hay Redis; sin Redis el
    // tick es el único drenador (fallback dev).
    const useQueue =
      !!this.config.get('REDIS_URL', { infer: true }) && !!this.queue;
    if (!useQueue) {
      const sending = await this.repository.listCampaigns({
        page: 1,
        limit: BATCH_SIZE,
        status: 'sending',
      });
      for (const campaign of sending.rows) {
        processed += await this.processBatch(campaign);
      }
    }
    // Transaccionales pendientes (BD fuente de verdad, BullMQ solo ejecuta)
    processed += await this.processTransactionalBatch();
    return { processed };
  }

  /** Procesa un lote de transaccionales pendientes/fallidos reintentables (max 5). */
  async processTransactionalBatch(): Promise<number> {
    const batch = await this.repository.findPendingBatch(20);
    // Filtrar solo transaccionales para no mezclar con campañas (estas van por processBatch)
    const transactional = batch.filter((r) => r.type !== 'campaign');
    // Partes por plantilla cacheadas dentro del lote (antes: 3 SELECT por email).
    const partsCache = new Map<
      string,
      Awaited<ReturnType<CampaignsService['loadParts']>>
    >();
    const partsFor = async (templateId: string | null) => {
      if (!templateId) throw new Error('Plantilla no encontrada');
      let parts = partsCache.get(templateId);
      if (!parts) {
        parts = await this.loadParts(templateId);
        partsCache.set(templateId, parts);
      }
      return parts;
    };
    for (const send of transactional) {
      try {
        await this.repository.markProcessing(send.id);
        const { template, header, footer } = await partsFor(send.template_id);
        const vars = (send.variables_used as Record<string, string>) ?? {};
        const html = this.renderer.assemble({
          headerHtml: header?.html_content ?? null,
          bodyHtml: template.body_html,
          footerHtml: footer?.html_content ?? null,
          vars,
        });
        const subject = this.renderer.renderVariables(template.subject, vars);
        const resendId = await this.deliver(send.email, { subject, html, variables_used: [] });
        await this.repository.markSent(send.id, resendId);
      } catch (err) {
        await this.repository.markFailed(send.id, err instanceof Error ? err.message : String(err));
      }
    }
    return transactional.length;
  }

  listSends(query: {
    campaignId: string;
    page: number;
    limit: number;
    status?: string;
  }) {
    return this.repository
      .listSendsByCampaign(query.campaignId, query)
      .then(({ rows, total }) =>
        paginatedDataFromQuery(
          rows.map((r) => EmailMarketingMapper.toSendDto(r)),
          { page: query.page, limit: query.limit },
          total,
        ),
      ) as Promise<{ data: EmailSendDto[]; meta: unknown }>;
  }

  // ─── internals ─────────────────────────────────────────────────────

  private async enqueueAndStart(
    campaign: CampaignRow,
    recipients: { userId: string; email: string; fullName: string | null }[],
  ): Promise<CampaignDto> {
    if (!campaign.template_id) throw new Error('Campaña sin plantilla');
    const now = new Date();
    await this.repository.insertSends(
      recipients.map((r) => ({
        type: 'campaign' as const,
        source_type: 'campaign',
        source_id: campaign.id,
        template_id: campaign.template_id as string,
        user_id: r.userId,
        email: r.email,
        status: 'pending' as const,
        scheduled_at: now,
        queued_at: now,
        attempts: 0,
        max_attempts: 5,
        variables_used: {
          nombre: r.fullName ?? '',
          empresa: '',
          unsubscribe_url: this.renderer.unsubscribeUrl(r.userId),
        },
      })),
    );
    await this.repository.recountStats(campaign.id);
    const updated =
      (await this.repository.updateCampaign(campaign.id, {
        status: 'sending',
      })) ?? campaign;

    // BullMQ: encolar drenado con rate-limit; sin REDIS_URL ejecución directa (ponytail fallback)
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    if (redisUrl && this.queue) {
      const delay =
        updated.scheduled_at && updated.scheduled_at > new Date()
          ? updated.scheduled_at.getTime() - Date.now()
          : 0;
      await this.queue.add(
        'process-batch',
        { campaignId: updated.id },
        delay > 0 ? { delay } : undefined,
      );
    } else {
      void this.processBatch(updated).catch((err: unknown) =>
        this.logger.error(`Primera tanda de ${campaign.id} falló`, err),
      );
    }
    return EmailMarketingMapper.toCampaignDto(updated);
  }

  /** Envía un lote de la cola; marca fin de campaña cuando vacía. Público para el processor BullMQ. */
  async processBatch(campaign: CampaignRow): Promise<number> {
    // Canales no-email delegan en su dispatcher.
    if (campaign.channel !== 'email') {
      const dispatcher = this.channelDispatcher(campaign.channel);
      if (!dispatcher) return 0;
      return dispatcher.processBatch(campaign);
    }
    const batch = await this.repository.findQueuedBatch(
      campaign.id,
      BATCH_SIZE,
    );
    // Partes constantes para todo el lote: 1 carga de plantilla+header+footer
    // en vez de 3 SELECT por destinatario.
    const parts = await this.loadParts(campaign.template_id!);
    for (const send of batch) {
      try {
        const rendered = this.renderWithParts(
          parts,
          (send.variables_used as Record<string, string> | null) ?? undefined,
        );
        const result = await this.deliver(send.email, rendered);
        await this.repository.markSent(send.id, result);
      } catch (err) {
        await this.repository.markFailed(
          send.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    if (batch.length > 0) {
      await this.repository.recountStats(campaign.id);
    }
    if ((await this.repository.countQueued(campaign.id)) === 0) {
      // Red de seguridad: una campaña sin destinatarios nunca es "sent".
      const fresh = await this.repository.getCampaignById(campaign.id);
      if ((fresh?.total_recipients ?? 0) > 0) {
        await this.repository.updateCampaign(campaign.id, {
          status: 'sent',
          sent_at: new Date(),
        });
      } else {
        this.logger.warn(
          `Campaña ${campaign.id} marcada failed: 0 destinatarios resueltos`,
        );
        await this.repository.updateCampaign(campaign.id, {
          status: 'failed',
        });
      }
    } else if (this.config.get('REDIS_URL', { infer: true }) && this.queue) {
      // BullMQ: quedan más — re-encolar siguiente lote (rate-limit 10/s vía worker limiter)
      await this.queue.add('process-batch', { campaignId: campaign.id });
    }
    return batch.length;
  }

  private buildSampleVars(): Record<string, string> {
    return {
      nombre: 'Ana Torres',
      empresa: 'Panadería La Espiga',
      email: 'ana@correo.com',
      unsubscribe_url: this.renderer.unsubscribeUrl('preview'),
    };
  }

  private async loadParts(templateId: string) {
    const template = await this.repository.findTemplateById(templateId);
    if (!template) throw new NotFoundException('Plantilla no encontrada');
    const [header, footer] = await Promise.all([
      template.header_id
        ? this.repository.findComponentById(template.header_id)
        : null,
      template.footer_id
        ? this.repository.findComponentById(template.footer_id)
        : null,
    ]);
    return { template, header, footer };
  }

  /** Ensambla el email de una campaña con las variables dadas (carga partes cada vez: paths de uso único). */
  private async renderCampaign(
    campaign: CampaignRow,
    vars?: Record<string, string>,
  ): Promise<RenderedEmail> {
    const parts = await this.loadParts(campaign.template_id!);
    return this.renderWithParts(parts, vars);
  }

  /** Render puro con partes ya cargadas — evita re-leer plantilla+header+footer por destinatario. */
  private renderWithParts(
    parts: Awaited<ReturnType<CampaignsService['loadParts']>>,
    vars?: Record<string, string>,
  ): RenderedEmail {
    const { template, header, footer } = parts;
    return {
      subject: this.renderer.renderVariables(template.subject, vars ?? {}),
      html: this.renderer.assemble({
        headerHtml: header?.html_content ?? null,
        bodyHtml: template.body_html,
        footerHtml: footer?.html_content ?? null,
        vars: vars ?? {},
      }),
      variables_used: Array.isArray(template.variables)
        ? (template.variables as string[])
        : [],
    };
  }

  private async getCampaignOrFail(id: string) {
    const campaign = await this.repository.getCampaignById(id);
    if (!campaign) throw new NotFoundException('Campaña no encontrada');
    return campaign;
  }

  private async deliver(
    email: string,
    rendered: RenderedEmail,
  ): Promise<string | null> {
    if (!this.resend) {
      // Sin API key (dev): simula éxito para probar el flujo completo.
      return `dev_${Date.now()}`;
    }
    const { data, error } = await this.resend.emails.send({
      from: this.config.get('EMAIL_FROM', { infer: true }),
      to: email,
      subject: rendered.subject,
      html: rendered.html,
    });
    if (error) throw new Error(error.message);
    return data?.id ?? null;
  }
}
