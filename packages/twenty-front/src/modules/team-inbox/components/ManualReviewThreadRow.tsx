import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowBackUp, IconCheck } from 'twenty-ui/icon';
import { Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';
import { type TimelineThread } from '~/generated/graphql';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const StyledRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledOpenButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  flex: 1;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
  padding: 0;
  text-align: start;
`;

const StyledApplicant = styled.span`
  font-weight: ${themeCssVariables.font.weight.medium};
  flex-shrink: 0;
  max-width: 35%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledSubject = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledTime = styled.span`
  color: ${themeCssVariables.font.color.light};
  flex-shrink: 0;
  font-size: ${themeCssVariables.font.size.sm};
`;

type ManualReviewThreadRowProps = {
  thread: TimelineThread;
  onOpenApplicantThread: (applicantEmail: string) => void;
  onDone: () => void;
};

export const ManualReviewThreadRow = ({
  thread,
  onOpenApplicantThread,
  onDone,
}: ManualReviewThreadRowProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const { reason, note, applicantEmail, originalSubject } =
    parseManualReviewSubject(thread.subject);

  return (
    <StyledRow>
      <StyledOpenButton
        type="button"
        title={thread.subject}
        onClick={() =>
          openRecordInSidePanel({
            recordId: thread.id,
            objectNameSingular: CoreObjectNameSingular.MessageThread,
          })
        }
      >
        {isNonEmptyString(reason) && (
          <Tag color={reason === 'not interested' ? 'gray' : 'orange'}>
            {reason}
          </Tag>
        )}
        <StyledApplicant>
          {applicantEmail ?? t`Applicant reply`}
        </StyledApplicant>
        <StyledSubject>
          {isDefined(note) ? `${originalSubject} · ${note}` : originalSubject}
        </StyledSubject>
      </StyledOpenButton>
      <StyledTime>
        {beautifyPastDateRelativeToNow(thread.lastMessageReceivedAt)}
      </StyledTime>
      {isDefined(applicantEmail) && (
        <Button
          variant="outline"
          size="sm"
          startIcon={<IconArrowBackUp />}
          onClick={() => onOpenApplicantThread(applicantEmail)}
        >{t`Reply`}</Button>
      )}
      <Button
        variant="soft"
        color="accent"
        size="sm"
        startIcon={<IconCheck />}
        onClick={onDone}
      >{t`Done`}</Button>
    </StyledRow>
  );
};
