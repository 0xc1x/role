import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfigRepository } from './app-config.repository';

@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService, AppConfigRepository],
  exports: [AppConfigService, AppConfigRepository],
})
export class AppConfigModule {}
