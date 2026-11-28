import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconMail } from 'twenty-ui/icon';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxCopyEmail } from '@/team-inbox/components/TeamInboxCopyEmail';
import { type InboxPersonByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { type EmailSentToApplicant } from '@/team-inbox/types/EmailSentToApplicant';
import { type ManualReviewEntry } from '@/team-inbox/types/ManualReviewGroup';
import { getManualReviewReasonBadge } from '@/team-inbox/utils/getManualReviewReasonBadge';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import {
  isTeamInboxApplicantMessage,
  isTeamInboxApproval,
  type TeamInboxReviewItem,
} from '@/team-inbox/utils/parseTeamInboxReviewItem';
import { type TimelineThread } from '~/generated/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';
import { openUrlInNewTab } from '~/utils/openUrlInNewTab';

const StyledRow = styled.article`
  align-items: center;
  background: var(--fl-surface);
  border-radius: 12px;
  box-shadow: var(--fl-shadow-card);
  color: var(--fl-ink);
  display: flex;
  flex-wrap: wrap;
  font-size: 13px;
  gap: 8px 14px;
  padding: 10px 14px;
`;

const StyledWho = styled.div`
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  padding: 0;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  color: var(--fl-faint);
  font-size: 12px;
  white-space: nowrap;
`;

const StyledStage = styled(StyledMeta)`
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StyledReason = styled.span<{ tone: 'warn' | 'quiet' }>`
  background: ${({ tone }) =>
    tone === 'warn' ? 'var(--fl-warn-soft)' : 'var(--fl-canvas)'};
  border-radius: 12px;
  color: ${({ tone }) =>
    tone === 'warn' ? 'var(--fl-warn-ink)' : 'var(--fl-ink-quiet)'};
  font-size: 12px;
  font-weight: 700;
  padding: 3px 9px;
  text-transform: capitalize;
  white-space: nowrap;
`;

const StyledEmailedSince = styled.span`
  align-items: center;
  background: var(--fl-accent-soft);
  border-radius: 12px;
  color: var(--fl-accent-ink);
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  gap: 4px;
  padding: 3px 9px;
  white-space: nowrap;
`;

const StyledActions = styled.div`
  display: flex;
  gap: 6px;
  margin-inline-start: auto;
`;

const StyledPrimaryButton = styled.button`
  background: var(--fl-accent);
  border: none;
  border-radius: 8px;
  color: var(--fl-on-accent);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  padding: 7px 12px;

  &:hover {
    background: var(--fl-accent-hover);
  }
`;

const StyledSecondaryButton = styled.button`
  background: var(--fl-chip);
  border: none;
  border-radius: 8px;
  color: var(--fl-ink-soft);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

type TeamInboxManualReviewRowProps = {
  thread: TimelineThread;
  item: TeamInboxReviewItem;
  earlier: ManualReviewEntry[];
  emailSentSinceCard: EmailSentToApplicant | null;
  person: InboxPersonByEmail | undefined;
  suggestedTemplateId: string | null;
  isDone: boolean;
  onReply: (templateId: string | null) => void;
  onToggleDone: () => Promise<void>;
};

export const TeamInboxManualReviewRow = ({
  thread,
  item,
  earlier,
  emailSentSinceCard,
  person,
  suggestedTemplateId,
  isDone,
  onReply,
  onToggleDone,
}: TeamInboxManualReviewRowProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const [isSaving, setIsSaving] = useState(false);
  const applicantEmail = item.applicantEmail;
  const groupItems = [item, ...earlier.map((entry) => entry.item)];
  const canReply =
    groupItems.some(isTeamInboxApplicantMessage) && isDefined(applicantEmail);
  const approvalUrl =
    groupItems.find(
      (groupItem) =>
        isTeamInboxApproval(groupItem) && isDefined(groupItem.approvalUrl),
    )?.approvalUrl ?? null;
  const badge = getManualReviewReasonBadge(item);
  const name = isNonEmptyString(person?.name)
    ? person.name
    : (applicantEmail ?? t`Applicant`);
  const stage = isNonEmptyString(person?.stageLabel)
    ? person.stageLabel
    : item.kind === 'REPLY_TRIAGE'
      ? parseManualReviewBody(thread.lastMessageBody).stage
      : null;
  const earlierCount = earlier.length;
  const emailedSinceWhen = isDefined(emailSentSinceCard)
    ? beautifyPastDateRelativeToNow(emailSentSinceCard.sentAt)
    : '';
  const emailedSinceDetails = isDefined(emailSentSinceCard)
    ? [
        emailSentSinceCard.senderName ?? emailSentSinceCard.senderEmail,
        emailSentSinceCard.subject,
      ]
        .filter(isNonEmptyString)
        .join(' · ')
    : '';

  const handleToggleDone = async () => {
    setIsSaving(true);

    try {
      await onToggleDone();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <StyledRow>
      <StyledWho>
        <StyledName
          type="button"
          dir="auto"
          title={t`Open the email`}
          onClick={() =>
            openRecordInSidePanel({
              recordId: thread.id,
              objectNameSingular: CoreObjectNameSingular.MessageThread,
            })
          }
        >
          {name}
        </StyledName>
        {isNonEmptyString(applicantEmail) && (
          <TeamInboxCopyEmail email={applicantEmail} />
        )}
      </StyledWho>
      {isNonEmptyString(stage) && (
        <StyledStage dir="auto" title={stage}>
          {stage}
        </StyledStage>
      )}
      {isDefined(badge) && (
        <StyledReason tone={badge.tone}>{badge.label}</StyledReason>
      )}
      {earlier.length > 0 && (
        <StyledMeta>{t`+${earlierCount} earlier`}</StyledMeta>
      )}
      <StyledMeta>
        {beautifyPastDateRelativeToNow(thread.lastMessageReceivedAt)}
      </StyledMeta>
      {isDefined(emailSentSinceCard) && (
        <StyledEmailedSince title={emailedSinceDetails}>
          <IconMail size={12} />
          {t`Emailed ${emailedSinceWhen}`}
        </StyledEmailedSince>
      )}
      <StyledActions>
        {isDefined(approvalUrl) && (
          <StyledPrimaryButton
            type="button"
            onClick={() => openUrlInNewTab(approvalUrl)}
          >
            {t`Review and send`}
          </StyledPrimaryButton>
        )}
        {canReply && (
          <StyledPrimaryButton
            type="button"
            onClick={() => onReply(suggestedTemplateId)}
          >
            {t`Reply`}
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
    </StyledRow>
  );
};
