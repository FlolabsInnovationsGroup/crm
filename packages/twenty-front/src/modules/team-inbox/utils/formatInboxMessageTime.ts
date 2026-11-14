import { t } from '@lingui/core/macro';
import { format, isToday, isYesterday } from 'date-fns';

// "Today, 09:42", "Yesterday, 16:20", "Nov 13, 16:20".
export const formatInboxMessageTime = (date: Date): string => {
  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A date format.
  const time = format(date, 'HH:mm');

  if (isToday(date)) {
    return t`Today, ${time}`;
  }

  if (isYesterday(date)) {
    return t`Yesterday, ${time}`;
  }

  // oxlint-disable-next-line lingui/no-unlocalized-strings -- A date format.
  return format(date, 'MMM d, HH:mm');
};
