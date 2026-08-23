import { Module } from '@nestjs/common';
import { TipsController } from './tips.controller';
import { TipsRepository } from './tips.repository';
import { TipsService } from './tips.service';

@Module({
  controllers: [TipsController],
  providers: [TipsService, TipsRepository],
  exports: [TipsService, TipsRepository],
})
export class TipsModule {}
