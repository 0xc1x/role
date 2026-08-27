import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { PayoutsService } from './payouts.service';

/**
 * Espejo del cron SQL `generate_payouts` (1° y 16 de cada mes, ADR-0008).
 * Dormido por defecto: el cron SQL de Supabase sigue activo hasta el cutover.
 */
@Injectable()
export class PayoutsGenerationJob {
  private readonly logger = new Logger(PayoutsGenerationJob.name);
  private running = false;

  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron('0 0 0 1,16 * *')
  async handleGenerate(): Promise<void> {
    if (!this.config.get('ENABLE_API_MIRROR_PAYOUTS', { infer: true })) return;
    if (this.running) {
      this.logger.debug('Payout job already running; skipping tick');
      return;
    }
    this.running = true;
    try {
      const { count } = await this.payoutsService.generate();
      if (count > 0) {
        this.logger.log(`Generated ${count} payout(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to generate payouts',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.running = false;
    }
  }
}
