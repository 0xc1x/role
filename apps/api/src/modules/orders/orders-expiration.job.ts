import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersService } from './orders.service';

/**
 * Periodic job: mark pending/ready_for_pickup orders as expired when the
 * offer pickup window has ended, restoring stock in the same transaction.
 */
@Injectable()
export class OrdersExpirationJob {
  private readonly logger = new Logger(OrdersExpirationJob.name);
  private running = false;

  constructor(private readonly ordersService: OrdersService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpireStaleOrders(): Promise<void> {
    if (this.running) {
      this.logger.debug('Expire job already running; skipping tick');
      return;
    }
    this.running = true;
    try {
      const { expired } = await this.ordersService.expireStaleOrders();
      if (expired > 0) {
        this.logger.log(`Expired ${expired} order(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Failed to expire stale orders',
        err instanceof Error ? err.stack : String(err),
      );
    } finally {
      this.running = false;
    }
  }
}
