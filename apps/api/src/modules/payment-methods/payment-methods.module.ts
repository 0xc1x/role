import { Module } from '@nestjs/common';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodsService } from './payment-methods.service';

@Module({
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, PaymentMethodsRepository],
  // No other module: a payment method never leaves through anyone else's
  // repository. In particular nothing resolves a `profiles` row for a card —
  // `user_id` is the caller's own id, read from the token, and the response
  // carries it without a join.
})
export class PaymentMethodsModule {}
