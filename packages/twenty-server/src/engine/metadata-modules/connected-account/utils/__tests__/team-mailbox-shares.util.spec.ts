import {
  getConnectedAccountIdsSharedWith,
  getTeamMailboxMemberIds,
  setTeamMailboxMemberIds,
} from 'src/engine/metadata-modules/connected-account/utils/team-mailbox-shares.util';

describe('team mailbox shares', () => {
  it('stores unique members per mailbox and drops a mailbox with nobody left', () => {
    const shared = setTeamMailboxMemberIds({}, 'hr', [
      'ceren',
      'maria',
      'ceren',
    ]);

    expect(getTeamMailboxMemberIds(shared, 'hr')).toEqual(['ceren', 'maria']);
    expect(setTeamMailboxMemberIds(shared, 'hr', [])).toEqual({});
  });

  it('lists the mailboxes shared with a member', () => {
    const shares = { hr: ['ceren'], paula: ['ceren', 'maria'] };

    expect(getConnectedAccountIdsSharedWith(shares, 'ceren')).toEqual([
      'hr',
      'paula',
    ]);
    expect(getConnectedAccountIdsSharedWith(shares, 'nago')).toEqual([]);
    expect(getConnectedAccountIdsSharedWith(null, 'nago')).toEqual([]);
  });
});
