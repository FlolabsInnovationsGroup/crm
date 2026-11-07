import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { type AnalyticsSyncState } from '@/crm-analytics/types/AnalyticsApi';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const StyledSyncLine = styled.span<{ isWarning: boolean }>`
  color: ${({ isWarning }) =>
    isWarning
      ? themeCssVariables.color.orange11
      : themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.regular};
  text-align: end;
`;

type AnalyticsSyncLineProps = {
  sync: AnalyticsSyncState;
};

export const AnalyticsSyncLine = ({ sync }: AnalyticsSyncLineProps) => {
  const hasFailedLastAttempt = sync.lastAttemptStatus === 'FAILED';
  const isWarning = sync.isStale || hasFailedLastAttempt;

  if (!isDefined(sync.lastSuccessfulSyncAt)) {
    return (
      <StyledSyncLine isWarning={isWarning}>
        {hasFailedLastAttempt
          ? t`Not updated yet. The latest update failed.`
          : t`Not updated yet.`}
      </StyledSyncLine>
    );
  }

  const relativeTime = beautifyPastDateRelativeToNow(sync.lastSuccessfulSyncAt);
  const relativeSyncTime = relativeTime === t`now` ? t`just now` : relativeTime;

  return (
    <StyledSyncLine isWarning={isWarning}>
      {hasFailedLastAttempt
        ? t`Last updated ${relativeSyncTime}. The latest update failed.`
        : t`Last updated ${relativeSyncTime}.`}
    </StyledSyncLine>
  );
};
