export type QuotedThreadMessage = {
  senderName: string | null;
  senderHandle: string | null;
  receivedAt: Date;
  text: string;
};

export type QuotedThreadHistory = {
  html: string;
  text: string;
};
