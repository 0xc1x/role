import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { safeErrorFields } from '../../common/utils/safe-error';
import type { Env } from '../../config/env.schema';
import { OrdersService } from './orders.service';

/**
 * Periodic job: mark pending/ready_for_pickup orders as expired when the
 * offer pickup window has ended, restoring stock in the same transaction.
 *
 * Excepción documentada en ADR-0008: Supabase no tiene expirador de órdenes
 * propio, así que este job es el único expirador mientras el móvil consuma
 * Supabase directo. Se activa con ENABLE_JOBS_ORDERS_EXPIRATION en producción.
 */
@Injectable()
export class OrdersExpirationJob {
  private readonly logger = new Logger(OrdersExpirationJob.name);
  private running = false;

  constructor(
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpireStaleOrders(): Promise<void> {
    if (!this.config.get('ENABLE_JOBS_ORDERS_EXPIRATION', { infer: true })) {
      this.logger.debug({
        event: 'orders_expiration_disabled',
        intervalSeconds: 60,
      });
      return;
    }
    if (this.running) {
      this.logger.warn({ event: 'orders_expiration_overlap_skipped' });
      return;
    }
    this.running = true;
    try {
      const { expired } = await this.ordersService.expireStaleOrders();
      this.logger.log({ event: 'orders_expiration_completed', expired });
    } catch (err) {
      this.logger.error({
        event: 'orders_expiration_failed',
        ...safeErrorFields(err),
      });
    } finally {
      this.running = false;
    }
  }
}
