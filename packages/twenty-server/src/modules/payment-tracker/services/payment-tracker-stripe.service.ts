import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';
import Stripe from 'stripe';

import { type RecordedPayment } from 'src/modules/payment-tracker/types/recorded-payment.type';
import { getPaymentTrackerConfig } from 'src/modules/payment-tracker/utils/get-payment-tracker-config.util';
import { toRecordedPayment } from 'src/modules/payment-tracker/utils/to-recorded-payment.util';

const PAYMENT_INTENT_EXPAND = ['latest_charge', 'customer'];

@Injectable()
export class PaymentTrackerStripeService {
  private stripe: Stripe | null = null;
  private stripeApiKey: string | null = null;

  private getStripe(): Stripe {
    const config = getPaymentTrackerConfig();

    if (!isDefined(config)) {
      throw new Error('Payment tracking is not configured on this server');
    }

    if (!isDefined(this.stripe) || this.stripeApiKey !== config.stripeApiKey) {
      this.stripe = new Stripe(config.stripeApiKey);
      this.stripeApiKey = config.stripeApiKey;
    }

    return this.stripe;
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = getPaymentTrackerConfig()?.stripeWebhookSecret;

    if (!isDefined(webhookSecret)) {
      throw new Error('FLOLABS_STRIPE_WEBHOOK_SECRET is not set');
    }

    return this.getStripe().webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }

  async getPayment(paymentIntentId: string): Promise<RecordedPayment | null> {
    const paymentIntent = await this.getStripe().paymentIntents.retrieve(
      paymentIntentId,
      { expand: PAYMENT_INTENT_EXPAND },
    );

    return toRecordedPayment(paymentIntent);
  }

  async *listPaymentsSince(since: Date): AsyncGenerator<RecordedPayment> {
    const paymentIntents = this.getStripe().paymentIntents.list({
      created: { gte: Math.floor(since.getTime() / 1000) },
      limit: 100,
      expand: PAYMENT_INTENT_EXPAND.map((field) => `data.${field}`),
    });

    for await (const paymentIntent of paymentIntents) {
      const payment = toRecordedPayment(paymentIntent);

      if (isDefined(payment)) {
        yield payment;
      }
    }
  }
}
