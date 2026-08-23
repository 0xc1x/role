import {
  Controller,
  Get,
  Inject,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/decorators/public.decorator';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

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

    const status = database === 'up' ? 'ok' : 'degraded';

    if (database === 'down') {
      throw new HttpException(
        {
          status: 'degraded',
          database,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status,
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
