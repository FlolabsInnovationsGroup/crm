import { MessageParticipantRole } from 'twenty-shared/types';

import { pickInboxContactName } from 'src/engine/core-modules/messaging/utils/pick-inbox-contact-name.util';

const participant = (
  handle: string,
  role: MessageParticipantRole,
  receivedAt: string,
  displayName = '',
) => ({ handle, role, displayName, receivedAt: new Date(receivedAt) });

describe('pickInboxContactName', () => {
  it('names the applicant we wrote to when they have not replied', () => {
    expect(
      pickInboxContactName(
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
          ),
        ],
        ['HR@flolabs.com'],
      ),
    ).toBe('QIMING XU');
  });

  it('prefers the person who wrote to us over other recipients', () => {
    expect(
      pickInboxContactName(
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
    ).toBe('Ada');
  });

  it('falls back to the handle and to nothing', () => {
    expect(
      pickInboxContactName(
        [
          participant(
            'ada@example.com',
            MessageParticipantRole.TO,
            '2026-11-01',
          ),
        ],
        [],
      ),
    ).toBe('ada@example.com');
    expect(
      pickInboxContactName(
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
