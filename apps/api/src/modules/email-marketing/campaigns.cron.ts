import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
    try {
      const { processed } = await this.campaignsService.processTick();
      if (processed > 0) {
        this.logger.log(`processTick procesó ${processed} envíos`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? err.cause : undefined;
      const causeMsg =
        cause instanceof Error ? cause.message : cause ?? undefined;
      this.logger.error(
        `processTick falló: ${message}${causeMsg ? ` (causa: ${causeMsg})` : ''}`,
      );
    }
  }
}
