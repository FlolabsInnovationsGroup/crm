import { isNonEmptyString } from '@sniptt/guards';

export type PaymentTrackerConfig = {
  workspaceId: string;
  stripeApiKey: string;
  stripeWebhookSecret: string | null;
};

// Stripe belongs to one company, so payments are tracked in the one
// workspace named in the server's env. A restricted, read-only key is enough.
export const getPaymentTrackerConfig = (): PaymentTrackerConfig | null => {
  const workspaceId = process.env.FLOLABS_PAYMENTS_WORKSPACE_ID;
  const stripeApiKey = process.env.FLOLABS_STRIPE_API_KEY;
  const stripeWebhookSecret = process.env.FLOLABS_STRIPE_WEBHOOK_SECRET;

  if (!isNonEmptyString(workspaceId) || !isNonEmptyString(stripeApiKey)) {
    return null;
  }

  return {
    workspaceId,
    stripeApiKey,
    stripeWebhookSecret: isNonEmptyString(stripeWebhookSecret)
      ? stripeWebhookSecret
      : null,
  };
};
