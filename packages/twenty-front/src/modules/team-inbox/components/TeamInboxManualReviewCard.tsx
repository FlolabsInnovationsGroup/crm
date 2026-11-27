import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';
import { IconFileText } from 'twenty-ui/icon';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxAvatar } from '@/team-inbox/components/TeamInboxAvatar';
import { type InboxPersonByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';
import { getApprovalApplicantSummary } from '@/team-inbox/utils/getApprovalApplicantSummary';
import { getTeamInboxReviewAdvice } from '@/team-inbox/utils/getTeamInboxReviewAdvice';
import { getTeamInboxReviewExcerpt } from '@/team-inbox/utils/getTeamInboxReviewExcerpt';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import {
  isTeamInboxApplicantMessage,
  isTeamInboxApproval,
  isTeamInboxAutomationIssue,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { type TimelineThread } from '~/generated/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';
import { openUrlInNewTab } from '~/utils/openUrlInNewTab';

const StyledCard = styled.article`
  background: var(--fl-surface);
  border-radius: 16px;
  box-shadow: var(--fl-shadow-raised);
  color: var(--fl-ink);
  display: flex;
  flex-direction: column;
  font-size: 14px;
  gap: 14px;
  padding: 20px;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: 12px;
`;

const StyledWho = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  flex: 1;
  font-family: inherit;
  min-width: 0;
  padding: 0;
  text-align: start;
`;

const StyledName = styled.div`
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.div`
  color: var(--fl-faint);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledEarlierToggle = styled.button`
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--fl-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 0;

  &:hover {
    color: var(--fl-ink-soft);
  }
`;

const StyledReason = styled.span<{ tone: 'warn' | 'quiet' }>`
  background: ${({ tone }) =>
    tone === 'warn' ? 'var(--fl-warn-soft)' : 'var(--fl-canvas)'};
  border-radius: 12px;
  color: ${({ tone }) =>
    tone === 'warn' ? 'var(--fl-warn-ink)' : 'var(--fl-ink-quiet)'};
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  text-transform: capitalize;
`;

const StyledQuote = styled.blockquote`
  background: var(--fl-surface-sunken);
  border-radius: 10px;
  color: var(--fl-ink-soft);
  line-height: 1.5;
  margin: 0;
  overflow-wrap: anywhere;
  padding: 12px 14px;
  white-space: pre-line;
`;

const StyledAdvice = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const StyledLabel = styled.span`
  color: var(--fl-fainter);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const StyledAdviceText = styled.span`
  line-height: 1.5;
`;

const StyledTemplate = styled.div`
  align-items: center;
  background: var(--fl-accent-tint);
  border-radius: 10px;
  color: var(--fl-accent-ink);
  display: flex;
  gap: 10px;
  padding: 10px 12px;
`;

const StyledTemplateName = styled.span`
  color: var(--fl-accent-ink-strong);
  flex: 1;
  font-size: 13px;
  font-weight: 600;
`;

const StyledActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: auto;
`;

const StyledPrimaryButton = styled.button`
  background: var(--fl-accent);
  border: none;
  border-radius: 10px;
  color: var(--fl-on-accent);
  cursor: pointer;
  flex: 1;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 0;

  &:hover {
    background: var(--fl-accent-hover);
  }
`;

const StyledSecondaryButton = styled.button`
  background: var(--fl-chip);
  border: none;
  border-radius: 10px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const StyledSentSince = styled.div`
  background: var(--fl-accent-soft);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
`;

const StyledSentSinceText = styled.p`
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--fl-ink);
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
`;

type ReviewCardEntry = {
  thread: TimelineThread;
  item: TeamInboxReviewItem;
  reply: string | null;
};

type TeamInboxManualReviewCardProps = {
  thread: TimelineThread;
  item: TeamInboxReviewItem;
  earlier: ReviewCardEntry[];
  emailSentSinceCard: EmailSentToApplicant | null;
  person: InboxPersonByEmail | undefined;
  suggestedTemplate: { id: string; name: string | null } | null;
  isDone: boolean;
  onReply: (templateId: string | null) => void;
  onToggleDone: () => Promise<void>;
};

const getReasonBadge = (
  item: TeamInboxReviewItem,
): { label: string; tone: 'warn' | 'quiet' } | null => {
  switch (item.kind) {
    case 'REPLY_TRIAGE': {
      const reason = item.triage?.reason ?? '';

      if (!isNonEmptyString(reason)) {
        return null;
      }

      return reason === 'question'
        ? { label: t`Question`, tone: 'warn' }
        : reason === 'not interested'
          ? { label: t`Not interested`, tone: 'quiet' }
          : { label: reason, tone: 'warn' };
    }
    case 'STUCK_APPLICANT':
      return { label: t`Stuck`, tone: 'warn' };
    case 'FORM_1_APPROVAL':
      return { label: t`Form 1 approval`, tone: 'warn' };
    case 'ORIENTATION_APPROVAL':
      return { label: t`Orientation approval`, tone: 'warn' };
    case 'OTHER':
      return null;
    default:
      return { label: t`Automation issue`, tone: 'warn' };
  }
};

export const TeamInboxManualReviewCard = ({
  thread,
  item,
  earlier,
  emailSentSinceCard,
  person,
  suggestedTemplate,
  isDone,
  onReply,
  onToggleDone,
}: TeamInboxManualReviewCardProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const openEmail = (threadId = thread.id) =>
    openRecordInSidePanel({
      recordId: threadId,
      objectNameSingular: CoreObjectNameSingular.MessageThread,
    });
  const [isSaving, setIsSaving] = useState(false);
  const [isShowingEarlier, setIsShowingEarlier] = useState(false);
  const isTriage = item.kind === 'REPLY_TRIAGE';
  const body = parseManualReviewBody(thread.lastMessageBody);
  const quote = isTriage
    ? body.reply
    : getTeamInboxReviewExcerpt(thread.lastMessageBody);
  const applicantEmail = item.applicantEmail;
  const groupEntries = [{ thread, item }, ...earlier];
  const groupItems = groupEntries.map((entry) => entry.item);
  const canReply = groupItems.some(isTeamInboxApplicantMessage);
  // An approval folded into a reply card keeps its own button.
  const approvals = groupEntries.filter(
    (entry, index) =>
      isTeamInboxApproval(entry.item) &&
      groupItems.findIndex(({ kind }) => kind === entry.item.kind) === index,
  );
  const applicantSummary = isDefined(person)
    ? getApprovalApplicantSummary(person)
    : [];
  const badge = getReasonBadge(item);
  const name = isNonEmptyString(person?.name)
    ? person.name
    : (applicantEmail ?? t`Applicant`);

  const emailSentSenderName =
    emailSentSinceCard?.senderName ?? emailSentSinceCard?.senderEmail;
  const emailSentWhen = isDefined(emailSentSinceCard)
    ? beautifyPastDateRelativeToNow(emailSentSinceCard.sentAt)
    : '';

  const meta = [
    isNonEmptyString(person?.stageLabel)
      ? person.stageLabel
      : isTriage
        ? body.stage
        : null,
    person?.position,
    beautifyPastDateRelativeToNow(thread.lastMessageReceivedAt),
  ]
    .filter(isNonEmptyString)
    .join(' · ');

  const handleToggleDone = async () => {
    setIsSaving(true);

    try {
      await onToggleDone();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledCard>
      <StyledHeader>
        <TeamInboxAvatar
          name={name}
          colorSeed={person?.personId ?? name}
          size={42}
        />
        <StyledWho
          type="button"
          title={t`Open the email`}
          onClick={() => openEmail()}
        >
          <StyledName dir="auto">{name}</StyledName>
          <StyledMeta dir="auto" title={meta}>
            {meta}
          </StyledMeta>
        </StyledWho>
        {isDefined(badge) && (
          <StyledReason tone={badge.tone}>{badge.label}</StyledReason>
        )}
      </StyledHeader>
      {isNonEmptyString(quote) && (
        <StyledQuote dir="auto">{isTriage ? `“${quote}”` : quote}</StyledQuote>
      )}
      {isNonEmptyArray(approvals) && isNonEmptyArray(applicantSummary) && (
        <StyledAdvice>
          <StyledLabel>{t`Before you approve`}</StyledLabel>
          {applicantSummary.map((line) => (
            <StyledAdviceText key={line} dir="auto">
              {line}
            </StyledAdviceText>
          ))}
        </StyledAdvice>
      )}
      {earlier.length > 0 && (
        <StyledEarlierToggle
          type="button"
          aria-expanded={isShowingEarlier}
          onClick={() => setIsShowingEarlier(!isShowingEarlier)}
        >
          {plural(earlier.length, {
            one: '+ # earlier item from this applicant, marked done together',
            other:
              '+ # earlier items from this applicant, marked done together',
          })}
        </StyledEarlierToggle>
      )}
      {isShowingEarlier &&
        earlier.map((entry) =>
          isTeamInboxApproval(entry.item) ? (
            <StyledAdviceText key={entry.thread.id}>
              {getReasonBadge(entry.item)?.label}
            </StyledAdviceText>
          ) : isNonEmptyString(entry.reply) ? (
            <StyledQuote key={entry.thread.id} dir="auto">
              “{entry.reply}”
            </StyledQuote>
          ) : (
            <StyledAdviceText key={entry.thread.id}>
              {t`The text of this earlier email was not saved. Open it in the hr@ mailbox.`}
            </StyledAdviceText>
          ),
        )}
      {isDefined(emailSentSinceCard) && (
        <StyledSentSince>
          <StyledLabel>
            {isNonEmptyString(emailSentSenderName)
              ? t`${emailSentSenderName} emailed them ${emailSentWhen}`
              : t`Emailed them ${emailSentWhen}`}
          </StyledLabel>
          <StyledSentSinceText dir="auto">
            {[emailSentSinceCard.subject, emailSentSinceCard.excerpt]
              .filter(isNonEmptyString)
              .join(' · ')}
          </StyledSentSinceText>
          <StyledAdviceText>
            {t`If this answers them, press Done. Automated emails show here too.`}
          </StyledAdviceText>
        </StyledSentSince>
      )}
      <StyledAdvice>
        <StyledLabel>{t`What to do`}</StyledLabel>
        <StyledAdviceText>{getTeamInboxReviewAdvice(item)}</StyledAdviceText>
      </StyledAdvice>
      {isDefined(suggestedTemplate) && (
        <StyledTemplate title={t`Suggested template`}>
          <IconFileText size={16} />
          <StyledTemplateName>{suggestedTemplate.name}</StyledTemplateName>
        </StyledTemplate>
      )}
      <StyledActions>
        {approvals.map(({ thread: approvalThread, item: approval }) =>
          isDefined(approval.approvalUrl) ? (
            <StyledPrimaryButton
              key={approval.kind}
              type="button"
              onClick={() => {
                if (isDefined(approval.approvalUrl)) {
                  openUrlInNewTab(approval.approvalUrl);
                }
              }}
            >
              {approval.kind === 'ORIENTATION_APPROVAL'
                ? t`Choose date and send`
                : t`Review and send`}
            </StyledPrimaryButton>
          ) : (
            <StyledPrimaryButton
              key={approval.kind}
              type="button"
              onClick={() => openEmail(approvalThread.id)}
            >
              {t`Open the email`}
            </StyledPrimaryButton>
          ),
        )}
        {isTeamInboxAutomationIssue(item) && isDefined(person) && (
          <StyledPrimaryButton
            type="button"
            onClick={() =>
              openRecordInSidePanel({
                recordId: person.personId,
                objectNameSingular: CoreObjectNameSingular.Person,
              })
            }
          >
            {t`Open profile`}
          </StyledPrimaryButton>
        )}
        {canReply && isDefined(applicantEmail) && (
          <StyledPrimaryButton
            type="button"
            onClick={() => onReply(suggestedTemplate?.id ?? null)}
          >
            {isDefined(suggestedTemplate) ? t`Reply with template` : t`Reply`}
          </StyledPrimaryButton>
        )}
        <StyledSecondaryButton
          type="button"
          disabled={isSaving}
          onClick={handleToggleDone}
        >
          {isDone ? t`Undo` : t`Done`}
        </StyledSecondaryButton>
      </StyledActions>
    </StyledCard>
  );
};
