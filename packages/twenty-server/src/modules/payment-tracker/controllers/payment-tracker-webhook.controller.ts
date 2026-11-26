import {
  Controller,
  Headers,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { isString } from '@sniptt/guards';
import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import type Stripe from 'stripe';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { PaymentTrackerStripeService } from 'src/modules/payment-tracker/services/payment-tracker-stripe.service';
import { PaymentTrackerService } from 'src/modules/payment-tracker/services/payment-tracker.service';
import { getPaymentTrackerConfig } from 'src/modules/payment-tracker/utils/get-payment-tracker-config.util';

const getPaymentIntentId = (event: Stripe.Event): string | null => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return event.data.object.id;
    case 'charge.refunded': {
      const paymentIntent = event.data.object.payment_intent;

      return isString(paymentIntent)
        ? paymentIntent
        : (paymentIntent?.id ?? null);
    }
    default:
      return null;
  }
};

// Stripe signs every call, so this endpoint is public. The event only names
// the payment; its details are read back from Stripe before anything is saved.
@Controller(`${ApiPath.Webhooks}/flolabs-payments`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class PaymentTrackerWebhookController {
  private readonly logger = new Logger(PaymentTrackerWebhookController.name);

  constructor(
    private readonly paymentTrackerStripeService: PaymentTrackerStripeService,
    private readonly paymentTrackerService: PaymentTrackerService,
  ) {}

  @Post()
  async handleStripeEvent(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    const config = getPaymentTrackerConfig();

    if (!isDefined(config) || !isDefined(config.stripeWebhookSecret)) {
      response.status(503).send('Payment tracking is not configured');

      return;
    }

    let event: Stripe.Event;

    try {
      if (!isDefined(request.rawBody) || !isString(signature)) {
        throw new Error('Missing body or signature');
      }

      event = this.paymentTrackerStripeService.constructEvent(
        request.rawBody,
        signature,
      );
    } catch {
      response.status(400).send('Invalid signature');

      return;
    }

    const paymentIntentId = getPaymentIntentId(event);

    if (!isDefined(paymentIntentId)) {
      response.status(200).send({ ignored: event.type });

      return;
    }

    try {
      const payment =
        await this.paymentTrackerStripeService.getPayment(paymentIntentId);

      if (isDefined(payment)) {
        await this.paymentTrackerService.recordPayment(
          config.workspaceId,
          payment,
        );
      }

      response.status(200).send({ received: true });
    } catch (error) {
      // Stripe retries on a 5xx, so a passing outage does not lose a payment.
      this.logger.error(`Could not record Stripe event ${event.id}: ${error}`);
      response.status(500).send('Could not record the payment');
    }
  }
}
