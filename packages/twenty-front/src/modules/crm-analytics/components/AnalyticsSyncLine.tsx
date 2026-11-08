import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { type AnalyticsSyncState } from '@/crm-analytics/types/AnalyticsApi';
import { dateLocaleState } from '@/localization/states/dateLocaleState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { beautifyPastDateRelativeToNow } from '~/utils/date-utils';

const RELATIVE_TIME_REFRESH_IN_MS = 60 * 1000;

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
  const { localeCatalog } = useAtomStateValue(dateLocaleState);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Only redraws the age, with no request, so a page left open never overstates how fresh it is.
  useEffect(() => {
    const refreshInterval = window.setInterval(
      () => setCurrentTime(Date.now()),
      RELATIVE_TIME_REFRESH_IN_MS,
    );

    return () => window.clearInterval(refreshInterval);
  }, []);

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

  const relativeTime = beautifyPastDateRelativeToNow(
    sync.lastSuccessfulSyncAt,
    localeCatalog,
  );
  // A browser clock behind the server's would otherwise read "in 3 minutes".
  const isFromTheFuture =
    new Date(sync.lastSuccessfulSyncAt).getTime() > currentTime;
  const relativeSyncTime =
    relativeTime === t`now` || isFromTheFuture ? t`just now` : relativeTime;

  return (
    <StyledSyncLine isWarning={isWarning}>
      {hasFailedLastAttempt
        ? t`Last updated ${relativeSyncTime}. The latest update failed.`
        : t`Last updated ${relativeSyncTime}.`}
    </StyledSyncLine>
  );
};
