import { isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { type SendingSender } from 'src/modules/sending-domain/types/sending-sender.type';

const toSenders = (parsed: unknown[]): SendingSender[] =>
  parsed.flatMap((item) =>
    isPlainObject(item) &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.email) &&
    isNonEmptyString(item.replyTo)
      ? [
          {
            name: item.name,
            email: item.email.toLowerCase(),
            replyTo: item.replyTo.toLowerCase(),
          },
        ]
      : [],
  );

// Throws on a file that is not a JSON array, so a write never replaces it with an empty list.
export const parseSendingSendersStrict = (
  content: string | null,
): SendingSender[] => {
  if (content === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error('senders.json is not a JSON array');
  }

  return toSenders(parsed);
};

export const parseSendingSenders = (content: string): SendingSender[] => {
  try {
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return toSenders(parsed);
  } catch {
    return [];
  }
};
