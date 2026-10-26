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
        title: labels.formSubmission,
        subtitle: submission.label,
        happenedAt: submission.createdAt,
      }),
    ),
    ...tasks.map(
      (task): NotificationItem => ({
        id: `task-${task.id}`,
        kind: 'task',
        recordId: task.id,
        title: labels.task,
        subtitle: task.label,
        happenedAt: task.createdAt,
      }),
    ),
  ]
    .sort((first, second) => second.happenedAt.localeCompare(first.happenedAt))
    .slice(0, MAX_NOTIFICATIONS);

// Before the page was ever opened, only the last day counts as new so a
// first visit does not show a wall of old items as unread.
export const isNotificationUnread = (
  item: NotificationItem,
  seenAt: string | null,
  now: Date,
) => {
  const threshold =
    seenAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  return new Date(item.happenedAt).getTime() > new Date(threshold).getTime();
};
