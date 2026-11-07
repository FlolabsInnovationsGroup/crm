import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledRate = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const StyledMutedRate = styled(StyledRate)`
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledSampleSize = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
  margin-inline-start: ${themeCssVariables.spacing[1]};
`;

type AnalyticsRateCellProps = {
  rate: number | null;
  soFarRate?: number | null;
  eligible?: number | null;
  isUnderMinimum?: boolean;
};

// The only way a rate reaches the screen. Anything unknown stays out of the number column.
export const AnalyticsRateCell = ({
  rate,
  soFarRate,
  eligible,
  isUnderMinimum = false,
}: AnalyticsRateCellProps) => {
  const { formatNumber } = useNumberFormat();

  if (isDefined(rate) && eligible !== 0) {
    const formattedRate = formatAnalyticsRate(rate);

    if (!isUnderMinimum) {
      return <StyledRate>{formattedRate}</StyledRate>;
    }

    const sampleSize = isDefined(eligible) ? formatNumber(eligible) : null;

    return (
      <StyledMutedRate>
        {formattedRate}
        {isDefined(sampleSize) && (
          <StyledSampleSize>{t`n=${sampleSize}`}</StyledSampleSize>
        )}
      </StyledMutedRate>
    );
  }

  // Nobody has moved yet inside the window, which is not the same as a measured 0%.
  if (isDefined(soFarRate) && soFarRate > 0) {
    const formattedSoFarRate = formatAnalyticsRate(soFarRate);

    return <StyledMutedRate>{t`${formattedSoFarRate} so far`}</StyledMutedRate>;
  }

  return <StyledMutedRate>{t`Not enough data`}</StyledMutedRate>;
};
