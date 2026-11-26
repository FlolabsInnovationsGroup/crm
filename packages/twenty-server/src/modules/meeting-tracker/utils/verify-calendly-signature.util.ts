import { createHmac, timingSafeEqual } from 'crypto';

import { isNonEmptyString } from '@sniptt/guards';

const TOLERANCE_SECONDS = 300;

// Calendly signs "<timestamp>.<raw body>" with HMAC-SHA256 and sends
// "t=<timestamp>,v1=<hex signature>" in the Calendly-Webhook-Signature header.
export const isValidCalendlySignature = ({
  header,
  rawBody,
  signingKey,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  header: string;
  rawBody: Buffer;
  signingKey: string;
  nowSeconds?: number;
}): boolean => {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');

      return [key, value.join('=')] as const;
    }),
  );
  const timestamp = parts.get('t');
  const signature = parts.get('v1');

  if (
    !isNonEmptyString(timestamp) ||
    !isNonEmptyString(signature) ||
    !/^\d+$/.test(timestamp) ||
    !/^[0-9a-f]+$/i.test(signature)
  ) {
    return false;
  }

  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', signingKey)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signature, 'hex');

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};
