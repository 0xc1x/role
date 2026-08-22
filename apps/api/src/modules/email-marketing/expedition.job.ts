import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CampaignsService } from './campaigns.service';

/**
 * Drena la cola de email_sends (lotes de 50/min) y dispara campañas
 * programadas vencidas. Misma mecánica que OrdersExpirationJob.
 */
@Injectable()
export class EmailMarketingExpeditionJob {
  private readonly logger = new Logger(EmailMarketingExpeditionJob.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleProcessQueue(): Promise<void> {
    try {
      const { processed } = await this.campaignsService.processTick();
      if (processed > 0) this.logger.log(`Enviados ${processed} email(s)`);
    } catch (err) {
      this.logger.error(
        'Fallo procesando la cola de emails',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
