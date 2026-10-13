import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import { OffersService } from './offers.service';

/**
 * Espejo del trigger `check_offer_expiry` (parte temporal, ADR-0008).
 * Dormido por defecto detrás de ENABLE_API_MIRROR_OFFERS.
 */
@Injectable()
export class OffersExpirationJob {
  private readonly logger = new Logger(OffersExpirationJob.name);
  private running = false;

  constructor(
    private readonly offersService: OffersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpireStale(): Promise<void> {
    if (!this.config.get('ENABLE_API_MIRROR_OFFERS', { infer: true })) return;
    if (this.running) {
      this.logger.debug({ event: 'offer_expiration_overlap_skipped' });
      return;
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const { expired } = await this.offersService.expireStale();
      if (expired > 0) {
        this.logger.log({
          event: 'offer_expiration_completed',
          expired,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (err) {
      this.logger.error({
        event: 'offer_expiration_failed',
        ...safeErrorFields(err),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this.running = false;
    }
  }
}
