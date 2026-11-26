import { MessageParticipantRole } from 'twenty-shared/types';

import {
  MAX_QUOTED_THREAD_MESSAGES,
  selectQuotableThreadMessages,
} from 'src/engine/core-modules/tool/tools/email-tool/utils/select-quotable-thread-messages.util';

const message = (
  id: string,
  receivedAt: string,
  overrides: Partial<{ text: string | null; isDraft: boolean }> = {},
) => ({
  id,
  text: `Text of ${id}`,
  receivedAt: new Date(receivedAt),
  isDraft: false,
  ...overrides,
});

const participant = (
  messageId: string,
  role: MessageParticipantRole,
  handle: string,
  displayName: string | null = null,
) => ({ messageId, role, handle, displayName });

const { FROM, TO, CC } = MessageParticipantRole;

describe('selectQuotableThreadMessages', () => {
  it('keeps messages the recipient took part in, newest first, with the sender', () => {
    const result = selectQuotableThreadMessages({
      messages: [
        message('first', '2026-11-20T10:00:00Z'),
        message('second', '2026-11-22T10:00:00Z'),
      ],
      participants: [
        participant('first', FROM, 'hr@flolabs.test', 'HR'),
        participant('first', TO, 'Jane@Example.com'),
        participant('second', FROM, 'jane@example.com', 'Jane'),
        participant('second', TO, 'hr@flolabs.test'),
      ],
      externalRecipientHandles: [' jane@example.com '],
    });

    expect(result.map((quoted) => quoted.senderName)).toEqual(['Jane', 'HR']);
    expect(result[0].senderHandle).toBe('jane@example.com');
  });

  it('leaves out internal messages the recipient never saw', () => {
    const result = selectQuotableThreadMessages({
      messages: [
        message('to-applicant', '2026-11-20T10:00:00Z'),
        message('internal-note', '2026-11-21T10:00:00Z'),
      ],
      participants: [
        participant('to-applicant', FROM, 'hr@flolabs.test'),
        participant('to-applicant', TO, 'jane@example.com'),
        participant('internal-note', FROM, 'hr@flolabs.test'),
        participant('internal-note', TO, 'john@flolabs.test'),
      ],
      externalRecipientHandles: ['jane@example.com'],
    });

    expect(result.map((quoted) => quoted.text)).toEqual([
      'Text of to-applicant',
    ]);
  });

  it('quotes only what every outside recipient already received', () => {
    const result = selectQuotableThreadMessages({
      messages: [
        message('applicant-only', '2026-11-20T10:00:00Z'),
        message('both', '2026-11-21T10:00:00Z'),
      ],
      participants: [
        participant('applicant-only', FROM, 'jane@example.com'),
        participant('applicant-only', TO, 'hr@flolabs.test'),
        participant('both', FROM, 'hr@flolabs.test'),
        participant('both', TO, 'jane@example.com'),
        participant('both', CC, 'parent@example.com'),
      ],
      // A cc or bcc that was not on the earlier private email must not see it.
      externalRecipientHandles: ['jane@example.com', 'parent@example.com'],
    });

    expect(result.map((quoted) => quoted.text)).toEqual(['Text of both']);
  });

  it('quotes nothing when the reply has no outside recipient', () => {
    expect(
      selectQuotableThreadMessages({
        messages: [message('first', '2026-11-20T10:00:00Z')],
        participants: [participant('first', TO, 'jane@example.com')],
        externalRecipientHandles: [],
      }),
    ).toEqual([]);
  });

  it('skips drafts and messages without text', () => {
    const result = selectQuotableThreadMessages({
      messages: [
        message('draft', '2026-11-20T10:00:00Z', { isDraft: true }),
        message('empty', '2026-11-21T10:00:00Z', { text: '   ' }),
      ],
      participants: [
        participant('draft', TO, 'jane@example.com'),
        participant('empty', TO, 'jane@example.com'),
      ],
      externalRecipientHandles: ['jane@example.com'],
    });

    expect(result).toEqual([]);
  });

  it('caps the number of quoted messages', () => {
    const count = MAX_QUOTED_THREAD_MESSAGES + 5;
    const ids = Array.from({ length: count }, (_, index) => `m${index}`);

    const result = selectQuotableThreadMessages({
      messages: ids.map((id, index) =>
        message(id, new Date(Date.UTC(2026, 10, 1, index)).toISOString()),
      ),
      participants: ids.map((id) => participant(id, TO, 'jane@example.com')),
      externalRecipientHandles: ['jane@example.com'],
    });

    expect(result).toHaveLength(MAX_QUOTED_THREAD_MESSAGES);
    expect(result[0].text).toBe(`Text of m${count - 1}`);
  });
});
