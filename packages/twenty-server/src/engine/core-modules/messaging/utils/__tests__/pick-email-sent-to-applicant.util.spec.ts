import { MessageParticipantRole } from 'twenty-shared/types';

import {
  getSender,
  pickEmailSentToApplicant,
} from 'src/engine/core-modules/messaging/utils/pick-email-sent-to-applicant.util';

const OWN_HANDLES = new Set(['hr@flolabs.test']);

const email = (
  id: string,
  receivedAt: string,
  {
    from = 'hr@flolabs.test',
    to = 'Ada@Example.com',
    toRole = MessageParticipantRole.TO,
  }: { from?: string; to?: string; toRole?: MessageParticipantRole } = {},
) => ({
  id,
  receivedAt: new Date(receivedAt),
  participants: [
    { role: MessageParticipantRole.FROM, handle: from, displayName: 'HR' },
    { role: toRole, handle: to, displayName: null },
  ],
});

const pick = (candidates: ReturnType<typeof email>[]) =>
  pickEmailSentToApplicant({
    candidates,
    applicantEmail: 'ada@example.com ',
    ownHandles: OWN_HANDLES,
    after: new Date('2026-11-20T10:00:00Z'),
  })?.id ?? null;

describe('pickEmailSentToApplicant', () => {
  it('picks the newest email our mailbox sent the applicant after the card', () => {
    expect(
      pick([
        email('first', '2026-11-21T10:00:00Z'),
        email('newest', '2026-11-22T10:00:00Z'),
        email('cc', '2026-11-21T12:00:00Z', {
          toRole: MessageParticipantRole.CC,
        }),
      ]),
    ).toBe('newest');
  });

  it('ignores emails before the card, from other senders or to someone else', () => {
    expect(
      pick([
        email('before', '2026-11-19T10:00:00Z'),
        email('same-instant', '2026-11-20T10:00:00Z'),
        email('from-applicant', '2026-11-21T10:00:00Z', {
          from: 'ada@example.com',
          to: 'hr@flolabs.test',
        }),
        email('outsider', '2026-11-21T10:00:00Z', { from: 'news@other.test' }),
        email('someone-else', '2026-11-21T10:00:00Z', {
          to: 'bob@example.com',
        }),
      ]),
    ).toBeNull();
  });

  it('returns the sender', () => {
    expect(getSender(email('a', '2026-11-21T10:00:00Z'))?.handle).toBe(
      'hr@flolabs.test',
    );
  });
});
