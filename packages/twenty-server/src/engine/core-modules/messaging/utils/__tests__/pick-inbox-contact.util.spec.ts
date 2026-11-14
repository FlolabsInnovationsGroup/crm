import { MessageParticipantRole } from 'twenty-shared/types';

import { pickInboxContact } from 'src/engine/core-modules/messaging/utils/pick-inbox-contact.util';

const participant = (
  handle: string,
  role: MessageParticipantRole,
  receivedAt: string,
  displayName = '',
  personId: string | null = null,
) => ({
  handle,
  role,
  displayName,
  receivedAt: new Date(receivedAt),
  personId,
});

describe('pickInboxContact', () => {
  it('names the applicant we wrote to when they have not replied', () => {
    expect(
      pickInboxContact(
        [
          participant(
            'hr@flolabs.com',
            MessageParticipantRole.FROM,
            '2026-11-01',
          ),
          participant(
            'qiming@outlook.com',
            MessageParticipantRole.TO,
            '2026-11-01',
            'QIMING XU',
            'person-1',
          ),
        ],
        ['HR@flolabs.com'],
      ),
    ).toEqual({ name: 'QIMING XU', personId: 'person-1' });
  });

  it('prefers the person who wrote to us over other recipients', () => {
    expect(
      pickInboxContact(
        [
          participant(
            'cc@example.com',
            MessageParticipantRole.CC,
            '2026-11-01',
            'Copied',
          ),
          participant(
            'ada@example.com',
            MessageParticipantRole.FROM,
            '2026-11-02',
            'Ada',
          ),
        ],
        [],
      ),
    ).toEqual({ name: 'Ada', personId: null });
  });

  it('falls back to the handle and to nothing', () => {
    expect(
      pickInboxContact(
        [
          participant(
            'ada@example.com',
            MessageParticipantRole.TO,
            '2026-11-01',
          ),
        ],
        [],
      ),
    ).toEqual({ name: 'ada@example.com', personId: null });
    expect(
      pickInboxContact(
        [
          participant(
            'hr@flolabs.com',
            MessageParticipantRole.FROM,
            '2026-11-01',
          ),
        ],
        ['hr@flolabs.com'],
      ),
    ).toBeNull();
  });
});
