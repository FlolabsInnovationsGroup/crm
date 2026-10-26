export type NotificationKind = 'email' | 'formSubmission' | 'task';

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  recordId: string;
  title: string;
  subtitle: string;
  happenedAt: string;
};
