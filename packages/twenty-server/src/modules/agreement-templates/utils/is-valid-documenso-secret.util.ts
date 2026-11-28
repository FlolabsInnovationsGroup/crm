import { timingSafeEqual } from 'crypto';

// Documenso sends the webhook's secret as is in X-Documenso-Secret.
export const isValidDocumensoSecret = (
  received: string,
  expected: string,
): boolean => {
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
};
