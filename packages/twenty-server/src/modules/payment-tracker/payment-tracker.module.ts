import { Module } from '@nestjs/common';

import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { PaymentTrackerWebhookController } from 'src/modules/payment-tracker/controllers/payment-tracker-webhook.controller';
import { PaymentTrackerListener } from 'src/modules/payment-tracker/listeners/payment-tracker.listener';
import { PaymentTrackerResolver } from 'src/modules/payment-tracker/resolvers/payment-tracker.resolver';
import { PaymentTrackerStripeService } from 'src/modules/payment-tracker/services/payment-tracker-stripe.service';
import { PaymentTrackerService } from 'src/modules/payment-tracker/services/payment-tracker.service';

@Module({
  imports: [PermissionsModule],
  controllers: [PaymentTrackerWebhookController],
  providers: [
    PaymentTrackerService,
    PaymentTrackerStripeService,
    PaymentTrackerResolver,
    PaymentTrackerListener,
  ],
})
export class PaymentTrackerModule {}
