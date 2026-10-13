import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { safeErrorFields } from '@0xc1x/role-commons';
import { CampaignsService } from './campaigns.service';

/**
 * Tick por minuto: dispara campañas programadas vencidas y retoma lotes en
 * curso de TODOS los canales (email y push) cuando no hubo Redis para la
 * cola — con Redis los jobs ya cubren el flujo normal y el tick es respaldo.
 */
@Injectable()
export class CampaignsCron {
  private readonly logger = new Logger(CampaignsCron.name);

  constructor(private readonly campaignsService: CampaignsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const startedAt = Date.now();
    try {
      const { processed } = await this.campaignsService.processTick();
      if (processed > 0) {
        this.logger.log({
          event: 'campaign_cron_tick_completed',
          processed,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (err) {
      this.logger.error({
        event: 'campaign_cron_tick_failed',
        ...safeErrorFields(err),
        durationMs: Date.now() - startedAt,
      });
    }
  }
}
