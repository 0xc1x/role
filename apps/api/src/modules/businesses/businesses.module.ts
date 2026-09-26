import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { BusinessesController } from './businesses.controller';
import { BusinessesRepository } from './businesses.repository';
import { BusinessesService } from './businesses.service';

@Module({
  imports: [AppConfigModule],
  controllers: [BusinessesController],
  providers: [BusinessesService, BusinessesRepository],
})
export class BusinessesModule {}
