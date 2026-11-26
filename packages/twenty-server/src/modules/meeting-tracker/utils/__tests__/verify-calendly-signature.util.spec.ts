import { createHmac } from 'crypto';

import { isValidCalendlySignature } from 'src/modules/meeting-tracker/utils/verify-calendly-signature.util';

const signingKey = 'test-signing-key';
const rawBody = Buffer.from('{"event":"invitee.created"}');
const now = 1_795_700_000;

const sign = (timestamp: number, body: Buffer = rawBody) =>
  createHmac('sha256', signingKey)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');

describe('isValidCalendlySignature', () => {
  it('accepts a fresh signature over the raw body', () => {
    expect(
      isValidCalendlySignature({
        header: `t=${now},v1=${sign(now)}`,
        rawBody,
        signingKey,
        nowSeconds: now + 10,
      }),
    ).toBe(true);
  });

  it('rejects a changed body, a wrong key and an old timestamp', () => {
    const header = `t=${now},v1=${sign(now)}`;

    expect(
      isValidCalendlySignature({
        header,
        rawBody: Buffer.from('{"event":"invitee.canceled"}'),
        signingKey,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      isValidCalendlySignature({
        header,
        rawBody,
        signingKey: 'another-key',
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      isValidCalendlySignature({
        header,
        rawBody,
        signingKey,
        nowSeconds: now + 3600,
      }),
    ).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(
      isValidCalendlySignature({
        header: 'v1=abc',
        rawBody,
        signingKey,
        nowSeconds: now,
      }),
    ).toBe(false);
  });
});
