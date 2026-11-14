import { MessageParticipantRole } from 'twenty-shared/types';

import { getConversationContact } from '@/team-inbox/utils/getConversationContact';

const participant = ({
  handle,
  role,
  personId = null,
  isMember = false,
}: {
  handle: string;
  role: MessageParticipantRole;
  personId?: string | null;
  isMember?: boolean;
}) =>
  ({
    handle,
    role,
    displayName: handle.split('@')[0],
    person: personId === null ? null : { id: personId },
    workspaceMember: isMember ? { id: 'member' } : null,
  }) as never;

describe('getConversationContact', () => {
  it('skips the team mailbox even when it is not a workspace member', () => {
    expect(
      getConversationContact(
        [
          {
            messageParticipants: [
              participant({
                handle: 'HR@flolabs.com',
                role: MessageParticipantRole.FROM,
              }),
              participant({
                handle: 'ada@example.com',
                role: MessageParticipantRole.TO,
                personId: 'person-ada',
              }),
            ],
          },
        ],
        ['hr@flolabs.com'],
      ),
    ).toEqual({
      personId: 'person-ada',
      displayName: 'ada',
      handle: 'ada@example.com',
    });
  });

  it('prefers a sender who wrote to us over other recipients', () => {
    expect(
      getConversationContact(
        [
          {
            messageParticipants: [
              participant({
                handle: 'me@flolabs.com',
                role: MessageParticipantRole.FROM,
                isMember: true,
              }),
              participant({
                handle: 'cc@example.com',
                role: MessageParticipantRole.TO,
              }),
            ],
          },
          {
            messageParticipants: [
              participant({
                handle: 'ada@example.com',
                role: MessageParticipantRole.FROM,
                personId: 'person-ada',
              }),
            ],
          },
        ],
        [],
      ),
    ).toEqual({
      personId: 'person-ada',
      displayName: 'ada',
      handle: 'ada@example.com',
    });
  });

  it('is empty when only the team took part', () => {
    expect(
      getConversationContact(
        [
          {
            messageParticipants: [
              participant({
                handle: 'hr@flolabs.com',
                role: MessageParticipantRole.FROM,
              }),
            ],
          },
        ],
        ['hr@flolabs.com'],
      ),
    ).toBeNull();
  });
});
