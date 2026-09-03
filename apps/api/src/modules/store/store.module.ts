import { Module } from '@nestjs/common';
import { AppStoreRepository } from './app-store.repository';

@Module({
  providers: [AppStoreRepository],
  exports: [AppStoreRepository],
})
export class StoreModule {}
