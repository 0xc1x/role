import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
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
      this.logger.debug('Offer expiry job already running; skipping tick');
      return;
    }
    this.running = true;
    try {
      const { expired } = await this.offersService.expireStale();
      if (expired > 0) {
        this.logger.log(`Deactivated ${expired} stale offer(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to expire stale offers',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.running = false;
    }
  }
}
