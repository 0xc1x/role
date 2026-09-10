import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesRepository } from './businesses.repository';
import { BusinessesService } from './businesses.service';

@Module({
  controllers: [BusinessesController],
  providers: [BusinessesService, BusinessesRepository],
})
export class BusinessesModule {}
