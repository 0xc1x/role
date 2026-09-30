import { Module } from '@nestjs/common';
import { SavedAddressesController } from './saved-addresses.controller';
import { SavedAddressesRepository } from './saved-addresses.repository';
import { SavedAddressesService } from './saved-addresses.service';

@Module({
  controllers: [SavedAddressesController],
  providers: [SavedAddressesService, SavedAddressesRepository],
  // No other module: an address row never leaves through anyone else's
  // repository, not even to resolve the profile it points at.
})
export class SavedAddressesModule {}
