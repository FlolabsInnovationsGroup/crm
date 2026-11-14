import { isDefined } from 'twenty-shared/utils';

export type ManualReviewBody = {
  stage: string | null;
  classification: string | null;
  reply: string;
};

const REPLY_MAX_LENGTH = 320;

// The quoted thread below the applicant's text starts with a "wrote:" line
// ("<hr@…> 于…写道：" from Chinese clients), so the reply stops there.
const QUOTE_START_REGEX = /^.*(wrote:|写道|<[^>]+@[^>]+>).*$/m;

const matchLine = (text: string, label: string) =>
  text.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;

// Reads the body of an n8n reply-triage email.
export const parseManualReviewBody = (body: string): ManualReviewBody => {
  const classificationLine = matchLine(
    body,
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- A label in the n8n email, not text.
    'AI classification \\(advisory\\)',
  );
  const classification = isDefined(classificationLine)
    ? classificationLine
        .replace(/^[a-z_]+\s*-\s*/, '')
        .replace(/\s*\(.*\)$/, '')
    : null;

  const replyStart = body.search(/^Their reply:\s*$/m);
  const afterReply =
    replyStart >= 0
      ? body.slice(replyStart).replace(/^Their reply:\s*/, '')
      : '';
  const withoutExecution = afterReply.split(/^Execution:/m)[0];
  const quoteStart = withoutExecution.search(QUOTE_START_REGEX);
  const reply = (
    quoteStart >= 0 ? withoutExecution.slice(0, quoteStart) : withoutExecution
  ).trim();

  return {
    // oxlint-disable-next-line lingui/no-unlocalized-strings -- A label in the n8n email, not text.
    stage: matchLine(body, 'Current CRM stage'),
    classification,
    reply:
      reply.length > REPLY_MAX_LENGTH
        ? `${reply.slice(0, REPLY_MAX_LENGTH).trimEnd()}…`
        : reply,
  };
};
