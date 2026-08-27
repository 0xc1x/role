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
import { RecipientsService } from './recipients.service';
import { RendererService } from './renderer.service';
import { EmailMarketingRepository } from './email-marketing.repository';
import { EmailMarketingMapper } from './mappers/email-marketing.mapper';
import type { CampaignRow } from './email-marketing.repository';

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
    if (!campaign.template_id) {
      throw new BadRequestException('La campaña no tiene plantilla');
    }
    const vars = {
      nombre: 'Ana Torres',
      empresa: 'Panadería La Espiga',
      unsubscribe_url: this.renderer.unsubscribeUrl('test'),
    };
    const rendered = await this.renderCampaign(campaign, vars);
    // Un solo asunto: override con contenido, si no el de la plantilla.
    rendered.subject = `[TEST] ${this.applySubjectOverride(campaign, rendered.subject)}`;
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

  async getCampaign(campaignId: string) {
    return this.repository.getCampaignById(campaignId);
  }

  /**
   * Tick del cron: campañas programadas vencidas + un lote de la cola.
   * Con BullMQ este método queda como fallback sin-Redis; el flujo normal es vía queue.
   */
  async processTick(): Promise<{ processed: number }> {
    let processed = 0;
    for (const due of await this.repository.findDueScheduled(new Date())) {
      try {
        await this.send(due.id);
      } catch (err) {
        this.logger.error(`Campaña programada ${due.id} falló`, err);
        void this.repository.updateCampaign(due.id, { status: 'failed' });
      }
    }

    const sending = await this.repository.listCampaigns({
      page: 1,
      limit: BATCH_SIZE,
      status: 'sending',
    });
    for (const campaign of sending.rows) {
      processed += await this.processBatch(campaign);
    }
    return { processed };
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
    await this.repository.insertSends(
      recipients.map((r) => ({
        campaign_id: campaign.id,
        user_id: r.userId,
        email: r.email,
        // Variables congeladas al encolar: el render por envío no reconsulta.
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
    const batch = await this.repository.findQueuedBatch(
      campaign.id,
      BATCH_SIZE,
    );
    for (const send of batch) {
      try {
        const rendered = await this.renderCampaign(
          campaign,
          (send.variables_used as Record<string, string> | null) ?? undefined,
        );
        rendered.subject = this.applySubjectOverride(
          campaign,
          rendered.subject,
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

  /** Ensambla el email final de una campaña con las variables dadas. */
  private async renderCampaign(
    campaign: CampaignRow,
    vars?: Record<string, string>,
  ): Promise<RenderedEmail> {
    const { template, header, footer } = await this.loadParts(
      campaign.template_id!,
    );
    return {
      subject: this.applySubjectOverride(campaign, template.subject),
      html: this.renderer.assemble({
        headerHtml: header?.html_content ?? null,
        bodyHtml: campaign.body_override ?? template.body_html,
        footerHtml: footer?.html_content ?? null,
        vars: vars ?? {},
      }),
      variables_used: Array.isArray(template.variables)
        ? (template.variables as string[])
        : [],
    };
  }

  /** Un solo criterio de asunto: override si tiene contenido, si no fallback. */
  private applySubjectOverride(
    campaign: CampaignRow,
    fallback: string,
  ): string {
    const override = campaign.subject_override?.trim();
    return override ? override : fallback;
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
