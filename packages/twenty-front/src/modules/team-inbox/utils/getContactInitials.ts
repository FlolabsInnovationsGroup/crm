import { isNonEmptyString } from '@sniptt/guards';

// "Aisha Bello" → "AB"; an email falls back to its first two letters.
export const getContactInitials = (name: string): string => {
  const words = name
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter(isNonEmptyString);

  if (words.length === 0) {
    return '?';
  }

  const initials =
    words.length === 1
      ? words[0].slice(0, 2)
      : `${words[0][0]}${words[words.length - 1][0]}`;

  return initials.toUpperCase();
};
