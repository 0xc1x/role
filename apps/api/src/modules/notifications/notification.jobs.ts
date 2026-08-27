import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { NotificationHandlers } from './notification.handlers';

@Injectable()
export class NotificationJobs {
  private readonly logger = new Logger(NotificationJobs.name);
  private running = new Set<string>();

  constructor(
    private readonly handlers: NotificationHandlers,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private isEnabled(): boolean {
    return this.config.get('ENABLE_API_MIRROR_NOTIFICATIONS', { infer: true });
  }

  private async guarded(key: string, fn: () => Promise<void>): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.running.has(key)) {
      this.logger.debug(`${key} already running; skipping`);
      return;
    }
    this.running.add(key);
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${key} failed`, err instanceof Error ? err.stack : String(err));
    } finally {
      this.running.delete(key);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handlePickupReminders(): Promise<void> {
    await this.guarded('pickup-reminders', async () => {
      const n = await this.handlers.pickupReminders();
      if (n > 0) this.logger.log(`Pickup reminders: ${n} queued`);
    });
  }

  @Cron('0 19 * * 0')
  async handleWeeklySummary(): Promise<void> {
    await this.guarded('weekly-summary', async () => {
      const n = await this.handlers.weeklySummary();
      if (n > 0) this.logger.log(`Weekly summary: ${n} queued`);
    });
  }

  @Cron('0 */2 * * *')
  async handleNearbyOffers(): Promise<void> {
    await this.guarded('nearby-offers', async () => {
      const n = await this.handlers.dispatchNearbyOffers();
      if (n > 0) this.logger.log(`Nearby offers: ${n} queued`);
    });
  }

  @Cron('0 3 * * 0')
  async handleCleanupTokens(): Promise<void> {
    await this.guarded('cleanup-tokens', async () => {
      const n = await this.handlers.cleanupOldTokens();
      if (n > 0) this.logger.log(`Cleaned ${n} old device tokens`);
    });
  }
}
