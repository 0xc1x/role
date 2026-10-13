import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { safeErrorFields } from '@0xc1x/role-commons';
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
      this.logger.debug({ event: 'payout_generation_overlap_skipped' });
      return;
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const { count } = await this.payoutsService.generate();
      if (count > 0) {
        this.logger.log({
          event: 'payout_generation_completed',
          generated: count,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (err) {
      this.logger.error({
        event: 'payout_generation_failed',
        ...safeErrorFields(err),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this.running = false;
    }
  }
}
