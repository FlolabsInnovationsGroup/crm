import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
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

const formatShortDate = (value: string) =>
  i18n.date(new Date(`${value.slice(0, 10)}T00:00:00.000Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

type AnalyticsFiguresRowProps = {
  figures: AnalyticsOverview['figures'];
  hasLimits: boolean;
  showSignedFigure: boolean;
  hasActiveFilter?: boolean;
  unmappedPeople?: number;
};

export const AnalyticsFiguresRow = ({
  figures,
  hasLimits,
  showSignedFigure,
  hasActiveFilter = false,
  unmappedPeople = 0,
}: AnalyticsFiguresRowProps) => {
  const { formatNumber } = useNumberFormat();

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
      </StyledFigure>

      <StyledFigure>
        <StyledLabel>{t`Total contacts`}</StyledLabel>
        <StyledValue>{formatNumber(figures.totalContacts)}</StyledValue>
        <StyledNote>
          {hasActiveFilter
            ? t`People matching these filters`
            : t`Everyone in People, including non-applicants`}
        </StyledNote>
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

      {showSignedFigure && isDefined(figures.signedPeople) && (
        <StyledFigure>
          <StyledLabel>{t`Signed`}</StyledLabel>
          <StyledValue>{formatNumber(figures.signedPeople)}</StyledValue>
        </StyledFigure>
      )}
    </StyledBand>
  );
};
