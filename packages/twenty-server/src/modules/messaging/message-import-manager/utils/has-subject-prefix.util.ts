import { isNonEmptyString } from '@sniptt/guards';

// Case-insensitive to match the ILIKE the Team inbox queries use.
export const hasSubjectPrefix = (
  subject: string | null | undefined,
  prefixes: string[],
) =>
  isNonEmptyString(subject) &&
  prefixes.some((prefix) =>
    subject.toLowerCase().startsWith(prefix.toLowerCase()),
  );
