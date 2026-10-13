import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { safeErrorFields } from '@0xc1x/role-commons';
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
      this.logger.debug({ event: 'notification_job_overlap_skipped', job: key });
      return;
    }
    this.running.add(key);
    const startedAt = Date.now();
    try {
      await fn();
    } catch (err) {
      this.logger.error({
        event: 'notification_job_failed',
        job: key,
        ...safeErrorFields(err),
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this.running.delete(key);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handlePickupReminders(): Promise<void> {
    await this.guarded('pickup-reminders', async () => {
      const queued = await this.handlers.pickupReminders();
      if (queued > 0) {
        this.logger.log({
          event: 'notification_job_completed',
          job: 'pickup-reminders',
          queued,
        });
      }
    });
  }

  @Cron('0 19 * * 0')
  async handleWeeklySummary(): Promise<void> {
    await this.guarded('weekly-summary', async () => {
      const queued = await this.handlers.weeklySummary();
      if (queued > 0) {
        this.logger.log({
          event: 'notification_job_completed',
          job: 'weekly-summary',
          queued,
        });
      }
    });
  }

  @Cron('0 */2 * * *')
  async handleNearbyOffers(): Promise<void> {
    await this.guarded('nearby-offers', async () => {
      const queued = await this.handlers.dispatchNearbyOffers();
      if (queued > 0) {
        this.logger.log({
          event: 'notification_job_completed',
          job: 'nearby-offers',
          queued,
        });
      }
    });
  }

  @Cron('0 3 * * 0')
  async handleCleanupTokens(): Promise<void> {
    await this.guarded('cleanup-tokens', async () => {
      const cleaned = await this.handlers.cleanupOldTokens();
      if (cleaned > 0) {
        this.logger.log({
          event: 'notification_job_completed',
          job: 'cleanup-tokens',
          cleaned,
        });
      }
    });
  }
}
