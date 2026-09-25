import {
  Controller,
  Get,
  Inject,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/decorators/public.decorator';
import { RedisThrottlerStorage } from '../../common/rate-limit/redis-throttler.storage';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly rateLimitStorage: RedisThrottlerStorage,
  ) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Service health' })
  async check() {
    let database: 'up' | 'down' = 'down';
    try {
      await this.db.execute(sql`select 1`);
      database = 'up';
    } catch {
      database = 'down';
    }

    const rateLimit = await this.rateLimitStorage.check();
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    const rateLimitReady =
      rateLimit.status === 'up' &&
      (rateLimit.backend === 'redis' || nodeEnv !== 'production');
    const ready = database === 'up' && rateLimitReady;
    const version =
      this.config.get('APP_VERSION', { infer: true }) ||
      this.config.get('RENDER_GIT_COMMIT', { infer: true }) ||
      'unknown';
    const payload = {
      status: ready ? 'ok' : 'degraded',
      version,
      database,
      rateLimit,
      jobs: {
        ordersExpiration: {
          enabled: this.config.get('ENABLE_JOBS_ORDERS_EXPIRATION', {
            infer: true,
          }),
          intervalSeconds: 60,
        },
      },
      timestamp: new Date().toISOString(),
    };

    if (!ready) {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }
}
