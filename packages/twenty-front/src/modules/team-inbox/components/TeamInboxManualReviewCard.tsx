import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconFileText } from 'twenty-ui/icon';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { TeamInboxAvatar } from '@/team-inbox/components/TeamInboxAvatar';
import { type InboxPersonByEmail } from '@/team-inbox/hooks/useInboxPeopleByEmail';
import { getManualReviewAdvice } from '@/team-inbox/utils/getManualReviewAdvice';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';
import { type TimelineThread } from '~/generated/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

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

type TeamInboxManualReviewCardProps = {
  thread: TimelineThread;
  person: InboxPersonByEmail | undefined;
  suggestedTemplate: { id: string; name: string | null } | null;
  isDone: boolean;
  onReply: (applicantEmail: string, templateId: string | null) => void;
  onToggleDone: () => Promise<void>;
};

export const TeamInboxManualReviewCard = ({
  thread,
  person,
  suggestedTemplate,
  isDone,
  onReply,
  onToggleDone,
}: TeamInboxManualReviewCardProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const [isSaving, setIsSaving] = useState(false);
  const subject = parseManualReviewSubject(thread.subject);
  const body = parseManualReviewBody(thread.lastMessageBody);
  const applicantEmail = subject.applicantEmail;
  const name = isNonEmptyString(person?.name)
    ? person.name
    : (applicantEmail ?? t`Applicant reply`);

  const meta = [
    isNonEmptyString(person?.stageLabel) ? person.stageLabel : body.stage,
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
          title={t`Open the triage email`}
          onClick={() =>
            openRecordInSidePanel({
              recordId: thread.id,
              objectNameSingular: CoreObjectNameSingular.MessageThread,
            })
          }
        >
          <StyledName dir="auto">{name}</StyledName>
          <StyledMeta dir="auto">{meta}</StyledMeta>
        </StyledWho>
        {isNonEmptyString(subject.reason) && (
          <StyledReason
            tone={subject.reason === 'not interested' ? 'quiet' : 'warn'}
          >
            {subject.reason === 'question'
              ? t`Question`
              : subject.reason === 'not interested'
                ? t`Not interested`
                : subject.reason}
          </StyledReason>
        )}
      </StyledHeader>
      {isNonEmptyString(body.reply) && (
        <StyledQuote dir="auto">“{body.reply}”</StyledQuote>
      )}
      <StyledAdvice>
        <StyledLabel>{t`What to do`}</StyledLabel>
        <StyledAdviceText>
          {getManualReviewAdvice(subject.reason, subject.note)}
        </StyledAdviceText>
      </StyledAdvice>
      {isDefined(suggestedTemplate) && (
        <StyledTemplate title={t`Suggested template`}>
          <IconFileText size={16} />
          <StyledTemplateName>{suggestedTemplate.name}</StyledTemplateName>
        </StyledTemplate>
      )}
      <StyledActions>
        {isDefined(applicantEmail) && (
          <StyledPrimaryButton
            type="button"
            onClick={() =>
              onReply(applicantEmail, suggestedTemplate?.id ?? null)
            }
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
