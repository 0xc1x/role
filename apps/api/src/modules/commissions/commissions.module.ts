import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsRepository } from './commissions.repository';
import { CommissionsService } from './commissions.service';

@Module({
  controllers: [CommissionsController],
  providers: [CommissionsService, CommissionsRepository],
  exports: [CommissionsService, CommissionsRepository],
})
export class CommissionsModule {}
