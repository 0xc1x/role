import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { BugReportInboxController } from './bug-report-inbox.controller';
import { BugReportInboxService } from './bug-report-inbox.service';

/**
 * Módulo propio y NO un controller en `StoreModule`: el store es genérico y un
 * `StoreController` que solo sirve `bug_report` mentiría sobre su propio alcance,
 * igual que le pasaría a `contact-inbox`. Usa `StoreModule` como dependencia.
 */
@Module({
  imports: [StoreModule],
  controllers: [BugReportInboxController],
  providers: [BugReportInboxService],
})
export class BugReportInboxModule {}
