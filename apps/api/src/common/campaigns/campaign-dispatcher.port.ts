import type { CampaignDto } from '@0xc1x/role-commons';
import type { CampaignRow } from '../../modules/email-marketing/email-marketing.repository';

/**
 * Puerto de entrega por canal para campañas multi-canal.
 *
 * `CampaignsService` posee el ciclo de vida genérico (estados, programación,
 * cancelación); cada canal registra un dispatcher que resuelve su audiencia,
 * crea su ledger por destinatario y entrega los envíos. El dispatcher de push
 * se auto-registra en `onModuleInit` (PushNotificationsModule ya importa
 * EmailMarketingModule, así se evita una dependencia circular).
 */
export interface CampaignChannelDispatcher {
  readonly channel: 'push';
  /** Valida que la plantilla del canal exista y esté activa (create/update). */
  assertTemplate(templateId: string): Promise<void>;
  /** Resuelve audiencia, crea el ledger y arranca el envío (o lo programa). */
  enqueueAndStart(campaign: CampaignRow): Promise<CampaignDto>;
  /** Procesa un lote del ledger pendiente; devuelve procesados. */
  processBatch(campaign: CampaignRow): Promise<number>;
}
