import { isNonEmptyString } from '@sniptt/guards';

// The fields this module writes exist only in the FloLabs workspace, which the
// payment tracker already names in the server's env.
export const getMeetingTrackerWorkspaceId = (): string | null => {
  const workspaceId =
    process.env.FLOLABS_WORKSPACE_ID ??
    process.env.FLOLABS_PAYMENTS_WORKSPACE_ID;

  return isNonEmptyString(workspaceId) ? workspaceId : null;
};
