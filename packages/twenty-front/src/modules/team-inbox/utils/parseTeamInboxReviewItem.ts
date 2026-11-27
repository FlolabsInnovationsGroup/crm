import { isDefined } from 'twenty-shared/utils';

import { TEAM_INBOX_APPROVAL_LINK_HOSTS } from '@/team-inbox/constants/TeamInboxApprovalLinkHosts';
import {
  type ManualReviewSubject,
  parseManualReviewSubject,
} from '@/team-inbox/utils/parseManualReviewSubject';

export type TeamInboxReviewKind =
  | 'REPLY_TRIAGE'
  | 'STUCK_APPLICANT'
  | 'FORM_1_APPROVAL'
  | 'ORIENTATION_APPROVAL'
  | 'AUTOMATION_NEEDS_ATTENTION'
  | 'AUTOMATION_SENT_NOT_UPDATED'
  | 'AUTOMATION_FIRST_EMAIL_FAILED'
  | 'OTHER';

export type TeamInboxReviewItem = {
  kind: TeamInboxReviewKind;
  applicantEmail: string | null;
  triage: ManualReviewSubject | null;
  approvalUrl: string | null;
};

const SUBJECT_KINDS: { pattern: RegExp; kind: TeamInboxReviewKind }[] = [
  { pattern: /^APPROVAL NEEDED \(Form 1\)/i, kind: 'FORM_1_APPROVAL' },
  {
    pattern: /^APPROVAL NEEDED \(orientation\)/i,
    kind: 'ORIENTATION_APPROVAL',
  },
  { pattern: /^\[Stuck applicant\]/i, kind: 'STUCK_APPLICANT' },
  {
    pattern: /^\[n8n\] Recruitment automation needs attention/i,
    kind: 'AUTOMATION_NEEDS_ATTENTION',
  },
  {
    pattern: /^\[n8n\] Email SENT but CRM not updated/i,
    kind: 'AUTOMATION_SENT_NOT_UPDATED',
  },
  {
    pattern: /^\[n8n\] CRM (application not queued|first email step failed)/i,
    kind: 'AUTOMATION_FIRST_EMAIL_FAILED',
  },
];

const APPROVAL_KINDS: TeamInboxReviewKind[] = [
  'FORM_1_APPROVAL',
  'ORIENTATION_APPROVAL',
];

const AUTOMATION_ISSUE_KINDS: TeamInboxReviewKind[] = [
  'AUTOMATION_NEEDS_ATTENTION',
  'AUTOMATION_SENT_NOT_UPDATED',
  'AUTOMATION_FIRST_EMAIL_FAILED',
];

const EMAIL_REGEX = /[^\s<>()[\]"':,]+@[^\s<>()[\]"':,]+\.[a-z]{2,}/i;

// The CRM stores HTML links as "Label [url]".
const LINK_REGEX = /\[(https:\/\/[^\]\s]+)\]/g;

// Only n8n's own approval pages, so a look-alike email cannot add a button.
const findApprovalUrl = (body: string) => {
  for (const [, candidate] of body.matchAll(LINK_REGEX)) {
    try {
      const url = new URL(candidate);

      if (
        TEAM_INBOX_APPROVAL_LINK_HOSTS.includes(url.hostname) &&
        url.port === '' &&
        url.pathname.startsWith('/webhook-waiting/')
      ) {
        return url.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const parseTeamInboxReviewItem = (
  subject: string,
  body: string,
): TeamInboxReviewItem => {
  if (/^\[Reply triage\]/i.test(subject)) {
    const triage = parseManualReviewSubject(subject);

    return {
      kind: 'REPLY_TRIAGE',
      applicantEmail: triage.applicantEmail,
      triage,
      approvalUrl: null,
    };
  }

  const kind =
    SUBJECT_KINDS.find(({ pattern }) => pattern.test(subject))?.kind ?? 'OTHER';
  const isApproval = APPROVAL_KINDS.includes(kind);

  return {
    kind,
    applicantEmail: subject.match(EMAIL_REGEX)?.[0] ?? null,
    triage: null,
    approvalUrl: isApproval ? findApprovalUrl(body) : null,
  };
};

export const isTeamInboxApproval = (item: TeamInboxReviewItem) =>
  APPROVAL_KINDS.includes(item.kind);

export const isTeamInboxAutomationIssue = (item: TeamInboxReviewItem) =>
  AUTOMATION_ISSUE_KINDS.includes(item.kind);

export const isTeamInboxQuestion = (item: TeamInboxReviewItem) =>
  item.kind === 'STUCK_APPLICANT' ||
  (isDefined(item.triage) && item.triage.reason === 'question');

// Items that are the applicant writing to us, answered with a reply.
export const isTeamInboxApplicantMessage = (item: TeamInboxReviewItem) =>
  item.kind === 'REPLY_TRIAGE' || item.kind === 'STUCK_APPLICANT';
