import { type QuotedThreadHistory } from 'src/engine/core-modules/tool/tools/email-tool/types/quoted-thread-history.type';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type MessageAttachment } from 'src/modules/messaging/message-import-manager/types/message.type';

export type ComposedEmail = {
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  toRecipientsDisplay: string;
  sanitizedSubject: string;
  plainTextBody: string;
  sanitizedHtmlBody: string;
  attachments: MessageAttachment[];
  connectedAccount: ConnectedAccountEntity;
  fromHandle?: string;
  messageChannelId?: string;
  shouldPersistMessage: boolean;
  inReplyTo?: string;
  threadExternalId?: string;
  references?: string[];
  // Sent to the recipient only; the CRM stores the reply without it.
  quotedHistory?: QuotedThreadHistory;
};
