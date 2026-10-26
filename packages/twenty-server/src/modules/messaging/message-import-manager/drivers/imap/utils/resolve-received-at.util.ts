import { isValidDate } from 'src/utils/date/isValidDate';

type ResolveReceivedAtArgs = {
  headerDate?: string;
  internalDate?: Date | string;
};

const MAX_CLOCK_SKEW_MS = 60 * 60 * 1000;

// The Date header is written by the sender and spam often dates itself days
// ahead, so a header later than the server's arrival time is not trusted.
export const resolveReceivedAt = ({
  headerDate,
  internalDate,
}: ResolveReceivedAtArgs): Date => {
  const receivedAtFromHeader = headerDate ? new Date(headerDate) : undefined;
  const receivedAtFromImap = internalDate ? new Date(internalDate) : undefined;

  if (isValidDate(receivedAtFromImap)) {
    return isValidDate(receivedAtFromHeader) &&
      receivedAtFromHeader.getTime() <=
        receivedAtFromImap.getTime() + MAX_CLOCK_SKEW_MS
      ? receivedAtFromHeader
      : receivedAtFromImap;
  }

  if (
    isValidDate(receivedAtFromHeader) &&
    receivedAtFromHeader.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS
  ) {
    return receivedAtFromHeader;
  }

  return new Date();
};
