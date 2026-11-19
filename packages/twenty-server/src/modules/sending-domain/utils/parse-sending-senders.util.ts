import { isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { type SendingSender } from 'src/modules/sending-domain/types/sending-sender.type';

export const parseSendingSenders = (content: string): SendingSender[] => {
  try {
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) =>
      isPlainObject(item) &&
      isNonEmptyString(item.name) &&
      isNonEmptyString(item.email) &&
      isNonEmptyString(item.replyTo)
        ? [{ name: item.name, email: item.email, replyTo: item.replyTo }]
        : [],
    );
  } catch {
    return [];
  }
};
