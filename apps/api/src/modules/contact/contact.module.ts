import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { RendererService } from '../email-marketing/renderer.service';
import { StoreModule } from '../store/store.module';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

@Module({
  imports: [AppConfigModule, StoreModule],
  controllers: [ContactController],
  providers: [ContactService, EmailMarketingRepository, RendererService],
})
export class ContactModule {}
