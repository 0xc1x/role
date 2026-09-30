import { Module } from '@nestjs/common';
import { RevenueStatsRepository } from './revenue-stats.repository';
import { RevenueStatsService } from './revenue-stats.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  controllers: [StatsController],
  providers: [StatsService, RevenueStatsService, RevenueStatsRepository],
})
export class StatsModule {}
