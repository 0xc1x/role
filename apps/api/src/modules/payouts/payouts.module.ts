import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsGenerationJob } from './payouts-generation.job';
import { PayoutsRepository } from './payouts.repository';
import { PayoutsService } from './payouts.service';

@Module({
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsRepository, PayoutsGenerationJob],
})
export class PayoutsModule {}
