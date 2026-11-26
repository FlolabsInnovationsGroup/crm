import { isNonEmptyString } from '@sniptt/guards';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';
import {
  type QuotedThreadHistory,
  type QuotedThreadMessage,
} from 'src/engine/core-modules/tool/tools/email-tool/types/quoted-thread-history.type';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Gmail's own markup, so the CRM's importer and recipients' clients both
// recognise and fold the history.
const BLOCKQUOTE_STYLE =
  'margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex';

const formatQuoteDate = (date: Date): string => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} at ${hours}:${minutes} UTC`;
};

// Longer names stop the importer recognising the attribution line, which
// would then keep the quote in the CRM's copy of the reply.
const MAX_SENDER_NAME_LENGTH = 100;

const formatSender = ({
  senderName: fullSenderName,
  senderHandle,
}: QuotedThreadMessage): string => {
  const senderName = isNonEmptyString(fullSenderName)
    ? Array.from(fullSenderName).slice(0, MAX_SENDER_NAME_LENGTH).join('')
    : null;

  if (isNonEmptyString(senderName) && isNonEmptyString(senderHandle)) {
    return senderName === senderHandle
      ? `<${senderHandle}>`
      : `${senderName} <${senderHandle}>`;
  }

  return senderName || senderHandle || 'Unknown sender';
};

const formatAttribution = (message: QuotedThreadMessage): string =>
  `On ${formatQuoteDate(message.receivedAt)}, ${formatSender(message)} wrote:`;

const prefixLines = (text: string): string =>
  text
    .split(/\r?\n/)
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');

const textToHtml = (text: string): string =>
  escapeHtml(text).replace(/\r?\n/g, '<br>');

// Messages arrive newest first; each one quotes the older ones inside it, as mail clients do.
export const buildQuotedThreadHistory = (
  messagesNewestFirst: QuotedThreadMessage[],
): QuotedThreadHistory | undefined => {
  if (!isNonEmptyArray(messagesNewestFirst)) {
    return undefined;
  }

  let html = '';
  let text = '';

  for (const message of [...messagesNewestFirst].reverse()) {
    const messageText = message.text.trim();

    html = `<div class="gmail_quote"><div class="gmail_attr">${escapeHtml(
      formatAttribution(message),
    )}<br></div><blockquote class="gmail_quote" style="${BLOCKQUOTE_STYLE}">${textToHtml(
      messageText,
    )}${html === '' ? '' : `<br><br>${html}`}</blockquote></div>`;

    text = `${formatAttribution(message)}\n${prefixLines(
      text === '' ? messageText : `${messageText}\n\n${text}`,
    )}`;
  }

  return {
    html: `<br>${html}`,
    text: `\n\n${text}`,
  };
};
