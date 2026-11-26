import { isDefined } from 'twenty-shared/utils';

import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';

export const getOutboundEmailBodies = ({
  plainTextBody,
  sanitizedHtmlBody,
  quotedHistory,
}: Pick<
  ComposedEmail,
  'plainTextBody' | 'sanitizedHtmlBody' | 'quotedHistory'
>): { body: string; html: string } =>
  isDefined(quotedHistory)
    ? {
        body: `${plainTextBody}${quotedHistory.text}`,
        html: `${sanitizedHtmlBody}${quotedHistory.html}`,
      }
    : { body: plainTextBody, html: sanitizedHtmlBody };
