export type EmailSentToApplicant = {
  messageThreadId: string;
  sentAt: string;
  subject: string | null;
  excerpt: string | null;
  senderName: string | null;
  senderEmail: string | null;
};
