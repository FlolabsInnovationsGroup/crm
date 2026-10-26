import { isDefined } from 'twenty-shared/utils';

import { type NotificationItem } from '@/notifications/types/NotificationItem';

const MAX_NOTIFICATIONS = 30;

type ThreadInput = {
  id: string;
  subject: string;
  lastMessageReceivedAt: string;
  firstParticipant: { displayName: string };
};

type RecordInput = { id: string; createdAt: string; label: string };

export const buildNotificationItems = ({
  incomingThreads,
  formSubmissions,
  tasks,
  labels,
}: {
  incomingThreads: ThreadInput[];
  formSubmissions: RecordInput[];
  tasks: RecordInput[];
  labels: { formSubmission: string; task: string };
}): NotificationItem[] =>
  [
    ...incomingThreads.map(
      (thread): NotificationItem => ({
        id: `email-${thread.id}`,
        kind: 'email',
        recordId: thread.id,
        title: thread.firstParticipant.displayName,
        subtitle: thread.subject,
        happenedAt: thread.lastMessageReceivedAt,
      }),
    ),
    ...formSubmissions.map(
      (submission): NotificationItem => ({
        id: `form-${submission.id}`,
        kind: 'formSubmission',
        recordId: submission.id,
        title: submission.label,
        subtitle: labels.formSubmission,
        happenedAt: submission.createdAt,
      }),
    ),
    ...tasks.map(
      (task): NotificationItem => ({
        id: `task-${task.id}`,
        kind: 'task',
        recordId: task.id,
        title: task.label,
        subtitle: labels.task,
        happenedAt: task.createdAt,
      }),
    ),
  ]
    .sort((first, second) => second.happenedAt.localeCompare(first.happenedAt))
    .slice(0, MAX_NOTIFICATIONS);

// Before the page was ever opened, only the last day counts as new so a
// first visit does not show a wall of old items as unread. Future-dated items
// wait for their time, or they would stay unread after every visit.
export const isNotificationUnread = (
  item: NotificationItem,
  seenAt: string | null,
  now: Date,
) => {
  const happenedAt = new Date(item.happenedAt).getTime();
  const threshold = isDefined(seenAt)
    ? new Date(seenAt).getTime()
    : now.getTime() - 24 * 60 * 60 * 1000;

  return happenedAt > threshold && happenedAt <= now.getTime();
};
