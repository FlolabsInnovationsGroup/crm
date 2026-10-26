import {
  buildNotificationItems,
  isNotificationUnread,
} from '@/notifications/utils/buildNotificationItems';

const labels = { formSubmission: 'New form submission', task: 'Task for you' };

describe('buildNotificationItems', () => {
  it('merges all sources newest first', () => {
    const items = buildNotificationItems({
      incomingThreads: [
        {
          id: 't1',
          subject: 'Re: Internship',
          lastMessageReceivedAt: '2026-10-26T08:00:00.000Z',
          firstParticipant: { displayName: 'Ada' },
        },
      ],
      formSubmissions: [
        {
          id: 'f1',
          label: 'Apply · a@b.co',
          createdAt: '2026-10-26T09:00:00.000Z',
        },
      ],
      tasks: [
        { id: 'k1', label: 'Call Ada', createdAt: '2026-10-26T07:00:00.000Z' },
      ],
      labels,
    });

    expect(items.map((item) => item.id)).toEqual([
      'form-f1',
      'email-t1',
      'task-k1',
    ]);
    expect(items[1]).toMatchObject({
      title: 'Ada',
      subtitle: 'Re: Internship',
    });
  });
});

describe('isNotificationUnread', () => {
  const item = {
    id: 'x',
    kind: 'task' as const,
    recordId: 'x',
    title: '',
    subtitle: '',
    happenedAt: '2026-10-26T08:00:00.000Z',
  };
  const now = new Date('2026-10-26T10:00:00.000Z');

  it('compares with the last time the page was opened', () => {
    expect(isNotificationUnread(item, '2026-10-26T07:00:00.000Z', now)).toBe(
      true,
    );
    expect(isNotificationUnread(item, '2026-10-26T09:00:00.000Z', now)).toBe(
      false,
    );
  });

  it('treats the last day as new before the first visit', () => {
    expect(isNotificationUnread(item, null, now)).toBe(true);
    expect(
      isNotificationUnread(
        { ...item, happenedAt: '2026-10-20T08:00:00.000Z' },
        null,
        now,
      ),
    ).toBe(false);
  });
});
