import { getThreadContactName } from '@/team-inbox/utils/getThreadContactName';

const ourMailbox = { displayName: 'FloLabs HR', workspaceMemberId: 'member-1' };

describe('getThreadContactName', () => {
  it('names the applicant who replied to a thread we started', () => {
    expect(
      getThreadContactName({
        firstParticipant: ourMailbox,
        lastTwoParticipants: [
          { displayName: 'Anjie Jin', workspaceMemberId: null },
        ],
      }),
    ).toBe('Anjie Jin');
  });

  it('names the applicant who started the thread', () => {
    expect(
      getThreadContactName({
        firstParticipant: {
          displayName: 'Harry Zhang',
          workspaceMemberId: null,
        },
        lastTwoParticipants: [ourMailbox],
      }),
    ).toBe('Harry Zhang');
  });

  it('falls back to the first sender when only the team wrote', () => {
    expect(
      getThreadContactName({
        firstParticipant: ourMailbox,
        lastTwoParticipants: [],
      }),
    ).toBe('FloLabs HR');
  });
});

describe('getThreadContactName with team mailboxes', () => {
  it('skips a mailbox that is not linked to a workspace member', () => {
    expect(
      getThreadContactName(
        {
          firstParticipant: {
            displayName: 'FloLabs HR',
            handle: 'hr@flolabs.com',
            workspaceMemberId: null,
          },
          lastTwoParticipants: [
            {
              displayName: 'Ada',
              handle: 'ada@example.com',
              workspaceMemberId: null,
            },
          ],
        },
        ['HR@flolabs.com'],
      ),
    ).toBe('Ada');
  });
});
