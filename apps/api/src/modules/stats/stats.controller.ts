import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlatformStats } from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /** Métricas reales de la plataforma para la landing (hero/about). */
  @Public()
  @Get('platform')
  @ApiOperation({ summary: 'Real platform stats (users, businesses, meals)' })
  @ApiOkResponse({ description: 'Platform stats' })
  getPlatformStats(): Promise<PlatformStats> {
    return this.statsService.getPlatformStats();
  }
}
