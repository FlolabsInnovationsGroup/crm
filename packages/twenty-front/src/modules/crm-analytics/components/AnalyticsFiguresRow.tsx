import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';
import {
  AnalyticsSparkline,
  type AnalyticsSparklineData,
} from '@/crm-analytics/charts/AnalyticsSparkline';
import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { type AnalyticsOverallConversionAnswer } from '@/crm-analytics/utils/buildOverallConversionAnswer';
import { formatAnalyticsSignedNumber } from '@/crm-analytics/utils/formatAnalyticsSignedNumber';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledBand = styled.dl`
  background: ${themeCssVariables.border.color.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  margin: 0;
  overflow: hidden;
`;

const StyledFigure = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1 1 160px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledHeroFigure = styled(StyledFigure)`
  flex: 2 1 240px;
`;

const StyledLabel = styled.dt`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledHeroValue = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  font-size: 48px;
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

const StyledValue = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.01em;
  margin: 0;
`;

const StyledUnknownValue = styled.dd`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.md};
  line-height: ${themeCssVariables.font.size.xl};
  margin: 0;
`;

const StyledNote = styled.dd`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledLighterValue = styled(StyledValue)`
  color: ${themeCssVariables.font.color.tertiary};
`;

// Holds its height while the series loads, so the tile does not jump when the line arrives.
const StyledSparkline = styled.dd`
  margin: auto 0 0;
  min-height: 32px;
`;

const MINIMUM_SPARKLINE_POINTS = 2;

const formatShortDate = (value: string) =>
  i18n.date(new Date(`${value.slice(0, 10)}T00:00:00.000Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

type AnalyticsFigureSparklineProps = {
  ariaLabel: string;
  sparkline: AnalyticsSparklineData | undefined;
};

const AnalyticsFigureSparkline = ({
  ariaLabel,
  sparkline,
}: AnalyticsFigureSparklineProps) => (
  <StyledSparkline>
    {isDefined(sparkline) &&
      sparkline.values.filter(isDefined).length >=
        MINIMUM_SPARKLINE_POINTS && (
        <AnalyticsSparkline
          ariaLabel={ariaLabel}
          values={sparkline.values}
          marks={sparkline.marks}
        />
      )}
  </StyledSparkline>
);

type AnalyticsFiguresRowProps = {
  figures: AnalyticsOverview['figures'];
  hasLimits: boolean;
  showSignedFigure: boolean;
  hasActiveFilter?: boolean;
  unmappedPeople?: number;
  overallConversion?: AnalyticsOverallConversionAnswer | null;
  hasOverallConversionError?: boolean;
  isStatusFiltered?: boolean;
  sparklines?: {
    activePeople: AnalyticsSparklineData;
    newApplications: AnalyticsSparklineData;
    overallConversion: AnalyticsSparklineData;
    totalContacts: AnalyticsSparklineData;
  };
};

export const AnalyticsFiguresRow = ({
  figures,
  hasLimits,
  showSignedFigure,
  hasActiveFilter = false,
  unmappedPeople = 0,
  overallConversion,
  hasOverallConversionError = false,
  isStatusFiltered = false,
  sparklines,
}: AnalyticsFiguresRowProps) => {
  const { formatNumber } = useNumberFormat();

  const overallConversionValue = overallConversion?.value;
  const overallConversionNote = hasOverallConversionError
    ? t`This figure could not load`
    : overallConversion?.detail;

  const dateRangeFrom = formatShortDate(figures.newApplicationsFrom);
  const dateRangeTo = formatShortDate(figures.newApplicationsTo);

  const newApplicationsChange =
    isDefined(figures.newApplications) &&
    isDefined(figures.newApplicationsPrevious)
      ? figures.newApplications - figures.newApplicationsPrevious
      : null;

  const formattedChange = isDefined(newApplicationsChange)
    ? formatAnalyticsSignedNumber(newApplicationsChange, formatNumber)
    : null;

  const importedApplications = isDefined(figures.importedApplications)
    ? formatNumber(figures.importedApplications)
    : null;

  const inactivePeople = formatNumber(figures.inactivePeople);
  const formattedUnmappedPeople = formatNumber(unmappedPeople);

  return (
    <StyledBand>
      <StyledHeroFigure>
        <StyledLabel>{t`Active people`}</StyledLabel>
        <StyledHeroValue>{formatNumber(figures.activePeople)}</StyledHeroValue>
        <StyledNote>
          {unmappedPeople > 0
            ? t`In the pipeline now, not signed or exited. Leaves out ${formattedUnmappedPeople} with a stage not yet mapped.`
            : t`In the pipeline now, not signed or exited`}
        </StyledNote>
        <AnalyticsFigureSparkline
          ariaLabel={t`Active people by week`}
          sparkline={sparklines?.activePeople}
        />
      </StyledHeroFigure>

      <StyledFigure>
        <StyledLabel>{t`New applications`}</StyledLabel>
        {isDefined(figures.newApplications) ? (
          <>
            <StyledValue>{formatNumber(figures.newApplications)}</StyledValue>
            <StyledNote>{t`${dateRangeFrom} to ${dateRangeTo}`}</StyledNote>
          </>
        ) : (
          <>
            <StyledUnknownValue>{t`Not available`}</StyledUnknownValue>
            <StyledNote>
              {t`This workspace has no application forms`}
            </StyledNote>
          </>
        )}
        {isDefined(formattedChange) && (
          <StyledNote>
            {t`${formattedChange} against the previous period`}
          </StyledNote>
        )}
        {isDefined(importedApplications) && (
          <StyledNote>
            {t`${importedApplications} imported, dates unknown`}
          </StyledNote>
        )}
        <AnalyticsFigureSparkline
          ariaLabel={t`New applications by week`}
          sparkline={sparklines?.newApplications}
        />
      </StyledFigure>

      <StyledFigure>
        <StyledLabel>{t`Overall conversion`}</StyledLabel>
        {overallConversion?.isLighter === true ? (
          <StyledLighterValue>{overallConversionValue}</StyledLighterValue>
        ) : (
          <StyledValue>
            {isDefined(overallConversionValue) ? (
              overallConversionValue
            ) : (
              <AnalyticsChartUnknownValue />
            )}
          </StyledValue>
        )}
        {isDefined(overallConversionNote) && (
          <StyledNote>{overallConversionNote}</StyledNote>
        )}
        {isStatusFiltered && (
          <StyledNote>{t`The status filter does not change this rate.`}</StyledNote>
        )}
        <AnalyticsFigureSparkline
          ariaLabel={t`Overall conversion by week of application`}
          sparkline={sparklines?.overallConversion}
        />
      </StyledFigure>

      <StyledFigure>
        <StyledLabel>{t`Past stage limit`}</StyledLabel>
        {hasLimits ? (
          <StyledValue>{formatNumber(figures.stuckPeople)}</StyledValue>
        ) : (
          <StyledUnknownValue>{t`No limits set`}</StyledUnknownValue>
        )}
        <StyledNote>{t`${inactivePeople} inactive`}</StyledNote>
      </StyledFigure>

      <StyledFigure>
        <StyledLabel>{t`Total contacts`}</StyledLabel>
        <StyledValue>{formatNumber(figures.totalContacts)}</StyledValue>
        <StyledNote>
          {hasActiveFilter
            ? t`People matching these filters`
            : t`Everyone in People, including non-applicants`}
        </StyledNote>
        <AnalyticsFigureSparkline
          ariaLabel={t`Total contacts by week`}
          sparkline={sparklines?.totalContacts}
        />
      </StyledFigure>

      {showSignedFigure && isDefined(figures.signedPeople) && (
        <StyledFigure>
          <StyledLabel>{t`Signed`}</StyledLabel>
          <StyledValue>{formatNumber(figures.signedPeople)}</StyledValue>
        </StyledFigure>
      )}
    </StyledBand>
  );
};
