import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreatePushSendDto, PushSendResult, PushTestDto } from '@0xc1x/role-commons';
import { RecipientsService } from '../email-marketing/recipients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushNotificationsRepository } from './push-notifications.repository';
import type { PushSendReport } from '../notifications/notifications.service';

const NAME_VARIABLE = /\{\{\s*nombre\s*\}\}/gi;

/** Expo/FCM exigen valores string en `data`; elimina nulos y coercea el resto. */
function toPayloadData(
  type: string,
  data?: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ type, ...(data ?? {}) })
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => [k, String(v)] as const),
  );
}

/**
 * Orquestación de envíos push manuales para admin: resuelve audiencia
 * (segmentos ∪ include − exclude), aplica gating de preferencias vía
 * NotificationsService y registra cada envío en push_notifications.
 */
@Injectable()
export class PushAdminService {
  constructor(
    private readonly pushRepo: PushNotificationsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly recipientsService: RecipientsService,
  ) {}

  /** Alcance estimado: usuarios con push_enabled y al menos un token activo. */
  async countAudience(input: {
    segmentIds: string[];
    includeUserIds: string[];
    excludeUserIds: string[];
  }): Promise<{ total: number }> {
    const resolved = await this.recipientsService.resolveUserIds(input);
    const enabled = await this.pushRepo.filterPushEnabled(resolved);
    return { total: await this.pushRepo.countUsersWithActiveTokens(enabled) };
  }

  /** Envío manual: resuelve audiencia, envía y registra en el historial. */
  async send(
    input: CreatePushSendDto & { data?: Record<string, unknown> },
    adminUserId: string,
  ): Promise<PushSendResult> {
    const resolved = await this.recipientsService.resolveUserIds({
      segmentIds: input.segment_ids,
      includeUserIds: input.include_user_ids,
      excludeUserIds: input.exclude_user_ids,
    });
    if (resolved.length === 0) {
      return this.record(input, null, adminUserId, { targeted: 0, sent: 0, failed: 0 });
    }

    const enabled = await this.pushRepo.filterPushEnabled(resolved);
    const names = new Map(
      (await this.pushRepo.findProfileNames(enabled)).map((p) => [p.user_id, p.full_name]),
    );

    const payload = {
      title: input.title,
      body: input.body,
      data: toPayloadData(input.type, input.data),
    };
    const report = await this.notificationsService.sendWithReport(
      enabled,
      payload,
      {
        render: (userId) => this.renderPayload(payload, names.get(userId) ?? null),
      },
    );
    return this.record(input, null, adminUserId, report);
  }

  /**
   * Envío de prueba: directo a los usuarios indicados, sin filtros de
   * preferencias ni quiet hours, y sin registrar en el historial.
   * Renderiza `{{nombre}}` igual que el envío manual (las plantillas lo usan).
   */
  async test(input: PushTestDto): Promise<PushSendResult> {
    const payload = {
      title: `[TEST] ${input.title}`,
      body: input.body,
      data: toPayloadData(input.type),
    };
    // Regex local (sin /g): NAME_VARIABLE tiene /gi y .test() avanzaría su lastIndex.
    const hasNameVariable = /\{\{\s*nombre\s*\}\}/i.test(
      `${payload.title} ${payload.body}`,
    );
    const names = new Map(
      hasNameVariable
        ? (await this.pushRepo.findProfileNames(input.user_ids)).map((p) => [
            p.user_id,
            p.full_name,
          ])
        : [],
    );
    const report = await this.notificationsService.sendWithReport(input.user_ids, payload, {
      skipFilters: true,
      render: hasNameVariable
        ? (userId) => this.renderPayload(payload, names.get(userId) ?? null)
        : undefined,
    });
    return { id: null, ...report };
  }

  /** Envío de prueba del contenido de una plantilla. */
  async testTemplate(templateId: string, input: PushTestDto): Promise<PushSendResult> {
    const template = await this.pushRepo.findTemplateById(templateId);
    if (!template) throw new BadRequestException('Plantilla no encontrada');
    return this.test({
      ...input,
      title: template.title,
      body: template.body,
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

  /** Persiste el resultado en push_notifications y devuelve el reporte. */
  private async record(
    input: CreatePushSendDto,
    templateId: string | null,
    adminUserId: string,
    report: PushSendReport,
  ): Promise<PushSendResult> {
    const status =
      report.sent === 0 && report.failed > 0
        ? 'failed'
        : report.failed > 0 || (report.targeted > 0 && report.sent < report.targeted)
          ? 'partial'
          : 'sent';
    const [row] = await this.pushRepo.insertNotification({
      template_id: templateId,
      title: input.title,
      body: input.body,
      data: { type: input.type, ...(input.data ?? {}) },
      type: input.type,
      segment_ids: input.segment_ids,
      include_user_ids: input.include_user_ids,
      exclude_user_ids: input.exclude_user_ids,
      total_targeted: report.targeted,
      sent_count: report.sent,
      failed_count: report.failed,
      status,
      created_by: adminUserId,
    });
    return { ...report, id: row?.id ?? null };
  }
}
