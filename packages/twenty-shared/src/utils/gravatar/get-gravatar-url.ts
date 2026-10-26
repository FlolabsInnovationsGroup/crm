import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const GRAVATAR_URL_CACHE = new Map<string, string>();

// `d=404` makes Gravatar fail for unknown emails, so the avatar falls back to
// initials. Gravatar accepts SHA-256 hashes of the trimmed, lowercased email.
export const getGravatarUrl = (email: string, sizePx = 200): string => {
  const normalizedEmail = email.trim().toLowerCase();
  const cacheKey = `${normalizedEmail}:${sizePx}`;
  const cachedUrl = GRAVATAR_URL_CACHE.get(cacheKey);

  if (cachedUrl !== undefined) {
    return cachedUrl;
  }

  const hash = bytesToHex(sha256(utf8ToBytes(normalizedEmail)));
  const url = `https://gravatar.com/avatar/${hash}?d=404&s=${sizePx}`;

  GRAVATAR_URL_CACHE.set(cacheKey, url);

  return url;
};
