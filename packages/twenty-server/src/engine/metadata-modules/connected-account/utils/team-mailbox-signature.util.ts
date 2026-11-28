import { isNonEmptyString } from '@sniptt/guards';

// One key per mailbox, so two admins editing different mailboxes never
// overwrite each other.
const SIGNATURE_KEY_PREFIX = 'TEAM_MAILBOX_SIGNATURE:';

export const TEAM_MAILBOX_SIGNATURE_MAX_LENGTH = 2000;

export const getTeamMailboxSignatureKey = (connectedAccountId: string) =>
  `${SIGNATURE_KEY_PREFIX}${connectedAccountId}`;

export const normalizeTeamMailboxSignature = (
  signature: string,
): string | null => {
  const normalizedSignature = signature.replace(/\r\n?/g, '\n').trim();

  return isNonEmptyString(normalizedSignature) ? normalizedSignature : null;
};
