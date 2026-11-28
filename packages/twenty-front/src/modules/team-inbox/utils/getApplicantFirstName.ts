import { isNonEmptyString } from '@sniptt/guards';

// A display name can be the bare address when the sender set none.
export const getApplicantFirstName = (
  displayName: string | null,
  email: string,
): string => {
  const firstWord = displayName?.trim().split(/\s+/)[0];

  if (isNonEmptyString(firstWord) && !firstWord.includes('@')) {
    return firstWord;
  }

  return email.trim().split('@')[0];
};
