import { Module } from '@nestjs/common';
import { UserDefaultsService } from './user-defaults.service';

/**
 * ADR-0008 phase 1.5: user defaults seeded by the API. Exported so both
 * user-creating flows (auth register and business onboarding) share the one
 * idempotent operation.
 */
@Module({
  providers: [UserDefaultsService],
  exports: [UserDefaultsService],
})
export class UsersModule {}
