import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { CampaignDto } from '@0xc1x/role-commons';
import type { CampaignChannelDispatcher } from '../../common/campaigns/campaign-dispatcher.port';
import { CampaignsService } from '../email-marketing/campaigns.service';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { EmailMarketingMapper } from '../email-marketing/mappers/email-marketing.mapper';
import { MAX_AUDIENCE_SIZE, RecipientsService } from '../email-marketing/recipients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsRepository } from './push-notifications.repository';
import type { CampaignRow } from '../email-marketing/email-marketing.repository';

const BATCH_SIZE = 50;
const NAME_VARIABLE = /\{\{\s*nombre\s*\}\}/g;

/**
 * Entrega de campañas push: mismo ciclo de vida que las campañas de email
 * (draft → sending → sent/failed, programadas vía scheduled_at) pero con
 * audiencia push (segmentos + push_enabled + tokens activos) y ledger propio
 * (push_sends). Se auto-registra en CampaignsService para que send() y
 * processBatch() ramifiquen por canal sin acoplar los módulos.
 */
@Injectable()
export class PushCampaignDispatcher
  implements CampaignChannelDispatcher, OnModuleInit
{
  private readonly logger = new Logger(PushCampaignDispatcher.name);
  readonly channel = 'push' as const;

  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly emailRepo: EmailMarketingRepository,
    private readonly recipients: RecipientsService,
    private readonly pushRepo: PushNotificationsRepository,
    private readonly notifications: NotificationsService,
    @Optional() @InjectQueue('email-expedition') private readonly queue?: Queue<{ campaignId: string }>,
  ) {}

  onModuleInit(): void {
    this.campaignsService.registerChannelDispatcher(this);
  }

  async assertTemplate(templateId: string): Promise<void> {
    const template = await this.pushRepo.findTemplateById(templateId);
    if (!template) throw new BadRequestException('Plantilla push no encontrada');
  }

  /** Resuelve audiencia push, crea el ledger y arranca (o programa) el envío. */
  async enqueueAndStart(campaign: CampaignRow): Promise<CampaignDto> {
    if (
      !campaign.segment_ids?.length &&
      !campaign.include_user_ids?.length
    ) {
      throw new BadRequestException(
        'Selecciona al menos un segmento o usuarios incluidos',
      );
    }
    const userIds = await this.recipients.resolveUserIds(
      {
        segmentIds: campaign.segment_ids ?? [],
        includeUserIds: campaign.include_user_ids ?? [],
        excludeUserIds: campaign.exclude_user_ids ?? [],
      },
      campaign.category,
    );
    if (userIds.length === 0) {
      throw new BadRequestException(
        'Ningún destinatario cumple los criterios: revisa que los segmentos tengan usuarios',
      );
    }
    if (userIds.length > MAX_AUDIENCE_SIZE) {
      throw new BadRequestException(
        `Audiencia demasiado grande (${userIds.length}): el máximo por envío es ${MAX_AUDIENCE_SIZE} — reduce los segmentos`,
      );
    }
    // Gating push_enabled; el resto se valida al entregar (tokens activos).
    const pushEnabled = await this.pushRepo.filterPushEnabled(userIds);
    if (pushEnabled.length === 0) {
      throw new BadRequestException(
        'Ningún destinatario tiene notificaciones push habilitadas',
      );
    }
    if (campaign.status === 'failed') {
      // Reintento: limpiar los registros del intento anterior.
      await this.pushRepo.deletePushSendsByCampaign(campaign.id);
    }
    await this.pushRepo.insertPushSends(
      pushEnabled.map((user_id) => ({ campaign_id: campaign.id, user_id })),
    );
    await this.pushRepo.recountPushStats(campaign.id);
    const updated = await this.emailRepo.updateCampaign(campaign.id, {
      status: 'sending',
    });
    if (!updated) throw new NotFoundException('Campaña no encontrada');
    if (this.queue) {
      // Programada: BullMQ retrasa el job hasta scheduled_at; sin Redis el
      // cron de processTick retoma los lotes.
      await this.queue.add(
        'process-batch',
        { campaignId: campaign.id },
        {
          ...(campaign.scheduled_at && campaign.scheduled_at > new Date()
            ? { delay: campaign.scheduled_at.getTime() - Date.now() }
            : {}),
        },
      );
    } else {
      void this.processBatch(updated).catch((err: unknown) =>
        this.logger.error(
          `Batch campaña push ${campaign.id} falló`,
          err,
        ),
      );
    }
    return EmailMarketingMapper.toCampaignDto(updated);
  }

  /** Procesa un lote del ledger; marca fin de campaña cuando vacía. */
  async processBatch(campaign: CampaignRow): Promise<number> {
    // Igual que email-expedition.processor: ignora campañas ya no en curso.
    if (campaign.status !== 'sending') return 0;
    const batch = await this.pushRepo.findQueuedPushBatch(
      campaign.id,
      BATCH_SIZE,
    );
    if (batch.length === 0) {
      await this.finish(campaign.id);
      return 0;
    }
    const template = campaign.template_id
      ? await this.pushRepo.findTemplateById(campaign.template_id)
      : null;
    if (!template) {
      throw new BadRequestException('La campaña push no tiene plantilla');
    }
    const names = new Map(
      (await this.pushRepo.findProfileNames(batch.map((b) => b.user_id))).map(
        (n) => [n.user_id, n.full_name],
      ),
    );
    const base = {
      title: template.title,
      body: template.body,
      data: (template.data as Record<string, string>) ?? {},
    };
    const results = await this.notifications.deliverToUsers(
      batch.map((b) => b.user_id),
      base,
      (userId) => this.renderPayload(base, names.get(userId) ?? null),
    );
    for (const send of batch) {
      const r = results.get(send.user_id);
      if (r && r.sent > 0) {
        await this.pushRepo.markPushSent(send.id);
      } else {
        const reason = r
          ? `Ningún token entregó (${r.failed} fallos)`
          : 'Sin tokens activos o push deshabilitado';
        await this.pushRepo.markPushFailed(send.id, reason);
      }
    }
    await this.pushRepo.recountPushStats(campaign.id);
    const queued = await this.pushRepo.countQueuedPush(campaign.id);
    if (queued > 0 && this.queue) {
      await this.queue.add('process-batch', { campaignId: campaign.id });
    } else if (queued === 0) {
      await this.finish(campaign.id);
    }
    return batch.length;
  }

  /** Marca fin de campaña: sent si llegó a alguien, failed si no. */
  private async finish(campaignId: string): Promise<void> {
    const row = await this.emailRepo.getCampaignById(campaignId);
    if (!row || row.status !== 'sending') return;
    await this.emailRepo.updateCampaign(campaignId, {
      status: (row.total_sent ?? 0) > 0 ? 'sent' : 'failed',
      sent_at: new Date(),
    });
  }

  /** Sustituye `{{nombre}}` (espacio si el perfil no tiene nombre). */
  private renderPayload(
    payload: { title: string; body: string; data?: Record<string, string> },
    fullName: string | null,
  ): { title: string; body: string; data?: Record<string, string> } {
    const name = fullName?.trim() || ' ';
    return {
      title: payload.title.replace(NAME_VARIABLE, name),
      body: payload.body.replace(NAME_VARIABLE, name),
      data: payload.data,
    };
  }
}
