import { type MessageBody } from 'src/modules/messaging/message-import-manager/types/message-body.type';
import { extractMessageTextWithoutQuotedHistory } from 'src/modules/messaging/message-import-manager/utils/extract-message-text-without-quoted-history.util';
import { isManualReviewMessage } from 'src/modules/messaging/message-import-manager/utils/is-manual-review-message.util';
import { normalizeMessageText } from 'src/modules/messaging/message-import-manager/utils/normalize-message-text.util';
import { readBodyAsText } from 'src/modules/messaging/message-import-manager/utils/read-body-as-text.util';
import { sanitizeString } from 'src/modules/messaging/message-import-manager/utils/sanitize-string.util';

// n8n review emails embed the applicant's reply and the approval link below
// lines the quote stripper reads as history, so they are kept whole.
export const extractImportedMessageText = ({
  subject,
  ...body
}: MessageBody & { subject?: string | null }): string =>
  isManualReviewMessage({ subject: subject ?? '' })
    ? normalizeMessageText(sanitizeString(readBodyAsText(body)))
    : extractMessageTextWithoutQuotedHistory(body);
