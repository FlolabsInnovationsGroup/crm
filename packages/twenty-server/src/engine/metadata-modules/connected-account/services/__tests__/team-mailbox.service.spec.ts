import { TeamMailboxService } from 'src/engine/metadata-modules/connected-account/services/team-mailbox.service';

const WORKSPACE_ID = 'workspace';
const HR_MAILBOX = {
  id: 'hr',
  workspaceId: WORKSPACE_ID,
  userWorkspaceId: 'admin-user-workspace',
  visibility: 'user',
};

const buildService = (shares: Record<string, string[]>) =>
  new TeamMailboxService(
    {} as never,
    {} as never,
    {} as never,
    { findById: jest.fn().mockResolvedValue(HR_MAILBOX) } as never,
    { get: jest.fn().mockResolvedValue(shares) } as never,
  );

describe('TeamMailboxService.verifyCanSendFrom', () => {
  it('lets the owner and the members the admin picked send', async () => {
    const service = buildService({ hr: ['ceren'] });

    await expect(
      service.verifyCanSendFrom({
        connectedAccountId: 'hr',
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: 'admin-user-workspace',
        workspaceMemberId: 'admin',
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.verifyCanSendFrom({
        connectedAccountId: 'hr',
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: 'ceren-user-workspace',
        workspaceMemberId: 'ceren',
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses everyone else', async () => {
    const service = buildService({ hr: ['ceren'] });

    await expect(
      service.verifyCanSendFrom({
        connectedAccountId: 'hr',
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: 'nago-user-workspace',
        workspaceMemberId: 'nago',
      }),
    ).rejects.toThrow('is not usable');

    await expect(
      service.verifyCanSendFrom({
        connectedAccountId: 'hr',
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: 'api-key',
        workspaceMemberId: undefined,
      }),
    ).rejects.toThrow('is not usable');
  });
});
