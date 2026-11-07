import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { VisuallyHidden } from 'twenty-ui/primitives/accessibility';
import { themeCssVariables } from 'twenty-ui/theme';

import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
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
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin-inline-start: ${themeCssVariables.spacing[1]};
`;

type AnalyticsRateCellProps = {
  rate: number | null;
  soFarRate?: number | null;
  eligible?: number | null;
  isUnderMinimum?: boolean;
  isCompact?: boolean;
};

export const AnalyticsRateCell = ({
  rate,
  soFarRate,
  eligible,
  isUnderMinimum = false,
  isCompact = false,
}: AnalyticsRateCellProps) => {
  const { formatNumber } = useNumberFormat();

  if (isDefined(rate) && eligible !== 0) {
    const formattedRate = formatAnalyticsRate(rate);

    if (!isUnderMinimum) {
      return <StyledRate>{formattedRate}</StyledRate>;
    }

    return (
      <StyledMutedRate>
        {formattedRate}
        {isDefined(eligible) && (
          <StyledSampleSize>
            {formatAnalyticsOfPeople(eligible, formatNumber)}
          </StyledSampleSize>
        )}
      </StyledMutedRate>
    );
  }

  // Nobody has moved yet inside the window, which is not the same as a measured 0%.
  if (isDefined(soFarRate) && soFarRate > 0) {
    const formattedSoFarRate = formatAnalyticsRate(soFarRate);

    return <StyledMutedRate>{t`${formattedSoFarRate} so far`}</StyledMutedRate>;
  }

  if (isCompact) {
    return (
      <StyledMutedRate title={t`Not enough data`}>
        <span aria-hidden="true">{t`n/a`}</span>
        <VisuallyHidden>{t`Not enough data`}</VisuallyHidden>
      </StyledMutedRate>
    );
  }

  return <StyledMutedRate>{t`Not enough data`}</StyledMutedRate>;
};
