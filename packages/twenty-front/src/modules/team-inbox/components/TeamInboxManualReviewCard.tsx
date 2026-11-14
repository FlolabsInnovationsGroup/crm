import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconArrowBackUp, IconCheck } from 'twenty-ui/icon';
import { Avatar, Tag } from 'twenty-ui/primitives/data-display';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { getManualReviewAdvice } from '@/team-inbox/utils/getManualReviewAdvice';
import { parseManualReviewBody } from '@/team-inbox/utils/parseManualReviewBody';
import { parseManualReviewSubject } from '@/team-inbox/utils/parseManualReviewSubject';
import { type TimelineThread } from '~/generated/graphql';
import { beautifyPastDateRelativeToNowShort } from '~/utils/date-utils';

const StyledCard = styled.article`
  background: ${themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.xl};
  box-shadow: ${themeCssVariables.boxShadow.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  padding: ${themeCssVariables.spacing[5]};
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledWho = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

const StyledName = styled.span`
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledMeta = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledQuote = styled.blockquote`
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  line-height: 1.5;
  margin: 0;
  overflow-wrap: anywhere;
  padding: ${themeCssVariables.spacing[3]};
  white-space: pre-line;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const StyledAdvice = styled.p`
  line-height: 1.5;
  margin: 0;
`;

const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: auto;
`;

type TeamInboxManualReviewCardProps = {
  thread: TimelineThread;
  onReplyToApplicant: (applicantEmail: string) => void;
  onDone: () => Promise<void>;
};

export const TeamInboxManualReviewCard = ({
  thread,
  onReplyToApplicant,
  onDone,
}: TeamInboxManualReviewCardProps) => {
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const subject = parseManualReviewSubject(thread.subject);
  const body = parseManualReviewBody(thread.lastMessageBody);
  const applicantEmail = subject.applicantEmail;
  const applicant = applicantEmail ?? t`Applicant reply`;
  const isNotInterested = subject.reason === 'not interested';

  const handleDone = async () => {
    setIsMarkingDone(true);

    try {
      await onDone();
    } finally {
      setIsMarkingDone(false);
    }
  };

  return (
    <StyledCard>
      <StyledHeader>
        <Avatar
          name={applicant}
          colorSeed={applicant}
          shape="circle"
          size="lg"
        />
        <StyledWho>
          <StyledName dir="auto">{applicant}</StyledName>
          <StyledMeta>
            {[
              body.stage,
              beautifyPastDateRelativeToNowShort(thread.lastMessageReceivedAt),
            ]
              .filter(isNonEmptyString)
              .join(' · ')}
          </StyledMeta>
        </StyledWho>
        {isNonEmptyString(subject.reason) && (
          <Tag color={isNotInterested ? 'gray' : 'orange'}>
            {subject.reason}
          </Tag>
        )}
      </StyledHeader>
      {isNonEmptyString(body.reply) && (
        <StyledQuote dir="auto">{body.reply}</StyledQuote>
      )}
      <StyledLabel>{t`What to do`}</StyledLabel>
      <StyledAdvice>
        {getManualReviewAdvice(subject.reason, subject.note)}
      </StyledAdvice>
      <StyledActions>
        {isDefined(applicantEmail) && (
          <Button
            variant="solid"
            color="accent"
            size="sm"
            startIcon={<IconArrowBackUp />}
            onClick={() => onReplyToApplicant(applicantEmail)}
          >
            {t`Reply to applicant`}
          </Button>
        )}
        <Button
          variant="soft"
          size="sm"
          startIcon={<IconCheck />}
          loading={isMarkingDone}
          disabled={isMarkingDone}
          onClick={handleDone}
        >
          {t`Done`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            openRecordInSidePanel({
              recordId: thread.id,
              objectNameSingular: CoreObjectNameSingular.MessageThread,
            })
          }
        >
          {t`Full email`}
        </Button>
      </StyledActions>
    </StyledCard>
  );
};
