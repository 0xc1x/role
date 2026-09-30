import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { ContactInboxController } from './contact-inbox.controller';
import { ContactInboxService } from './contact-inbox.service';

/**
 * Módulo propio y NO un controller en `StoreModule`: el store es genérico y un
 * `StoreController` que solo sirve `contact` mentiría sobre su propio alcance.
 * El controller expone la bandeja de contactos y usa `StoreModule` como
 * dependencia, igual que `ContactModule`.
 */
@Module({
  imports: [StoreModule],
  controllers: [ContactInboxController],
  providers: [ContactInboxService],
})
export class ContactInboxModule {}
