import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsRepository } from './payouts.repository';
import { PayoutsService } from './payouts.service';

@Module({
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutsRepository],
})
export class PayoutsModule {}
