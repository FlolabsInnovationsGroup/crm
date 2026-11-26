import { isNonEmptyString } from '@sniptt/guards';

import { getMeetingTrackerWorkspaceId } from 'src/modules/meeting-tracker/utils/get-meeting-tracker-workspace-id.util';

export type CalendlyConfig = {
  workspaceId: string;
  accessTokens: string[];
  webhookSigningKey: string | null;
};

// Interview bookings live in more than one Calendly account, so the server
// holds one personal access token per account, comma separated.
export const getCalendlyConfig = (): CalendlyConfig | null => {
  const workspaceId = getMeetingTrackerWorkspaceId();
  const accessTokens = (process.env.FLOLABS_CALENDLY_TOKENS ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(isNonEmptyString);
  const webhookSigningKey = process.env.FLOLABS_CALENDLY_SIGNING_KEY;

  if (!isNonEmptyString(workspaceId) || accessTokens.length === 0) {
    return null;
  }

  return {
    workspaceId,
    accessTokens,
    webhookSigningKey: isNonEmptyString(webhookSigningKey)
      ? webhookSigningKey
      : null,
  };
};
