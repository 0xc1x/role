import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  RevenueStatsQuerySchema,
  type PlatformStats,
  type RevenueStats,
  type RevenueStatsQuery,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RevenueStatsService } from './revenue-stats.service';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly revenueStatsService: RevenueStatsService,
  ) {}

  /** Métricas reales de la plataforma para la landing (hero/about). */
  @Public()
  @Get('platform')
  @ApiOperation({ summary: 'Real platform stats (users, businesses, meals)' })
  @ApiOkResponse({ description: 'Platform stats' })
  getPlatformStats(): Promise<PlatformStats> {
    return this.statsService.getPlatformStats();
  }

  /**
   * Reporte de dinero del panel: devengado (órdenes) vs cobrado (payouts).
   *
   * Admin-only y sin `@Public()`: es la superficie que responde "¿estamos
   * ganando dinero?" y no puede quedar detrás de la RPC pública de stats.
   */
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @Get('revenue')
  @ApiOperation({
    summary:
      'Money metrics for a period (admin). Accrued (from orders) and collected (from payouts) are reported separately.',
  })
  @ApiOkResponse({ description: 'Revenue stats for the resolved period' })
  getRevenueStats(
    @Query(new ZodValidationPipe(RevenueStatsQuerySchema))
    query: RevenueStatsQuery,
  ): Promise<RevenueStats> {
    return this.revenueStatsService.getRevenueStats(query);
  }
}
