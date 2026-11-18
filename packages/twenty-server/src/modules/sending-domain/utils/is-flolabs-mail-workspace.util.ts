import { isNonEmptyString } from '@sniptt/guards';

// The mail server is shared by the whole instance, so only one workspace may manage it.
export const isFlolabsMailWorkspace = (workspaceId: string): boolean => {
  const allowedWorkspaceId = process.env.FLOLABS_SENDING_DOMAINS_WORKSPACE_ID;

  return (
    isNonEmptyString(allowedWorkspaceId) && allowedWorkspaceId === workspaceId
  );
};
