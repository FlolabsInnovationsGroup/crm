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
  white-space: nowrap;
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
          ? t`No successful sync yet. The last attempt failed.`
          : t`No successful sync yet.`}
      </StyledSyncLine>
    );
  }

  const relativeSyncTime = beautifyPastDateRelativeToNow(
    sync.lastSuccessfulSyncAt,
  );

  return (
    <StyledSyncLine isWarning={isWarning}>
      {hasFailedLastAttempt
        ? t`Last successful sync ${relativeSyncTime}. The last attempt failed.`
        : t`Last successful sync ${relativeSyncTime}.`}
    </StyledSyncLine>
  );
};
