import { TeamMailboxSignatureService } from 'src/engine/metadata-modules/connected-account/services/team-mailbox-signature.service';

const WORKSPACE_ID = 'workspace';
const HR_KEY = 'TEAM_MAILBOX_SIGNATURE:hr';

const buildService = (storedSignature?: string) => {
  const userVarsService = {
    get: jest.fn().mockResolvedValue(storedSignature),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const teamMailboxService = {
    findTeamMailboxes: jest.fn().mockResolvedValue([{ id: 'hr' }]),
  };

  return {
    service: new TeamMailboxSignatureService(
      teamMailboxService as never,
      userVarsService as never,
    ),
    userVarsService,
  };
};

describe('TeamMailboxSignatureService', () => {
  it('reads the saved signature, or none', async () => {
    await expect(
      buildService('HR Team').service.getSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'hr',
      }),
    ).resolves.toBe('HR Team');

    await expect(
      buildService().service.getSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'hr',
      }),
    ).resolves.toBeNull();
  });

  it('saves a trimmed signature and removes an empty one', async () => {
    const { service, userVarsService } = buildService();

    await expect(
      service.setSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'hr',
        signature: '  HR Team\r\nFloLabs  ',
      }),
    ).resolves.toBe('HR Team\nFloLabs');

    expect(userVarsService.set).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      key: HR_KEY,
      value: 'HR Team\nFloLabs',
    });

    await expect(
      service.setSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'hr',
        signature: '   ',
      }),
    ).resolves.toBeNull();

    expect(userVarsService.delete).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      key: HR_KEY,
    });
  });

  it('refuses an unknown mailbox and a signature that is too long', async () => {
    const { service, userVarsService } = buildService();

    await expect(
      service.setSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'other',
        signature: 'HR Team',
      }),
    ).rejects.toThrow('not found');

    await expect(
      service.setSignature({
        workspaceId: WORKSPACE_ID,
        connectedAccountId: 'hr',
        signature: 'a'.repeat(2001),
      }),
    ).rejects.toThrow('longer than');

    expect(userVarsService.set).not.toHaveBeenCalled();
  });
});
