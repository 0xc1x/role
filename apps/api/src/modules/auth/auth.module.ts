import { Module } from '@nestjs/common';
import { EmailMarketingModule } from '../email-marketing/email-marketing.module';
import { UsersModule } from '../users/users.module';
import { AuthAccountRepository } from './auth-account.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * `EmailMarketingModule` is imported for ONE thing: `EmailMarketingRepository`,
 * which is how the recovery and email-change mails are QUEUED. Nothing here
 * calls Resend. The queue (`email_sends` + the `email-expedition` cron) is what
 * delivers, retries, and resolves the sender from `app_config['email.from']` —
 * the same seam `ContactService` uses for its retry, and the reason a request
 * handler here cannot become a mail gun pointed by anyone who finds the route.
 *
 * `SupabaseTokenVerifier` needs no import: `SecurityModule` is `@Global()` and
 * exports it.
 */
@Module({
  imports: [UsersModule, EmailMarketingModule],
  controllers: [AuthController],
  providers: [AuthService, AuthAccountRepository],
})
export class AuthModule {}
