import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme';

import {
  AnalyticsReportView,
  formatAnalyticsReportPeriod,
} from '@/crm-analytics/components/AnalyticsReportView';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_REPORTS } from '@/crm-analytics/graphql/getCrmAnalyticsReports';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsMeta,
  type AnalyticsReportListItem,
  type AnalyticsReportPeriodType,
} from '@/crm-analytics/types/AnalyticsApi';
import { EmptyState } from '@/ui/feedback/empty-state/components/EmptyState';

const StyledLayout = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[6]};
  grid-template-columns: 200px minmax(0, 1fr);

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledRail = styled.nav`
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  max-height: 72vh;
  overflow-y: auto;
  position: sticky;
  top: 0;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    max-height: 240px;
    position: static;
  }
`;

const StyledGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledGroupTitle = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin: 0;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledGroupEmpty = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[0.5]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledReportButton = styled.button<{ isSelected: boolean }>`
  background: ${({ isSelected }) =>
    isSelected ? themeCssVariables.background.transparent.medium : 'none'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.font.weight.medium
      : themeCssVariables.font.weight.regular};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  text-align: start;
  width: 100%;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: -2px;
  }
`;

const StyledEmptyPanel = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 280px;
`;

const getReportKey = ({
  periodType,
  periodStart,
}: {
  periodType: AnalyticsReportPeriodType;
  periodStart: string;
}) => `${periodType}:${periodStart}`;

const getNewestFirstReports = (
  reports: AnalyticsReportListItem[],
  periodType: AnalyticsReportPeriodType,
) =>
  reports
    .filter((report) => report.periodType === periodType)
    .toSorted((reportA, reportB) =>
      reportB.periodStart.localeCompare(reportA.periodStart),
    );

type AnalyticsReportGroupProps = {
  title: string;
  reports: AnalyticsReportListItem[];
  selectedReportKey: string;
  onSelect: (reportKey: string) => void;
};

const AnalyticsReportGroup = ({
  title,
  reports,
  selectedReportKey,
  onSelect,
}: AnalyticsReportGroupProps) => (
  <StyledGroup>
    <StyledGroupTitle>{title}</StyledGroupTitle>
    {reports.length === 0 ? (
      <StyledGroupEmpty>{t`None yet`}</StyledGroupEmpty>
    ) : (
      <StyledList aria-label={title}>
        {reports.map((report) => {
          const reportKey = getReportKey(report);
          const isSelected = reportKey === selectedReportKey;

          return (
            <li key={reportKey}>
              <StyledReportButton
                type="button"
                isSelected={isSelected}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(reportKey)}
              >
                {formatAnalyticsReportPeriod(report)}
              </StyledReportButton>
            </li>
          );
        })}
      </StyledList>
    )}
  </StyledGroup>
);

type AnalyticsReportsTabProps = {
  meta: AnalyticsMeta;
};

export const AnalyticsReportsTab = ({ meta }: AnalyticsReportsTabProps) => {
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(
    null,
  );

  const {
    payload: reports,
    isFirstLoad,
    isForbidden,
    error,
    retry,
  } = useCrmAnalyticsQuery<AnalyticsReportListItem[]>({
    query: GET_CRM_ANALYTICS_REPORTS,
    rootField: 'getCrmAnalyticsReports',
  });

  if (isForbidden) {
    return <AnalyticsStatePanel kind="FORBIDDEN" />;
  }

  if (isDefined(error)) {
    return <AnalyticsStatePanel kind="ERROR" error={error} onRetry={retry} />;
  }

  if (isFirstLoad) {
    return (
      <StyledLayout>
        <AnalyticsSkeleton shape="table" rowCount={6} columnCount={2} />
        <AnalyticsSkeleton shape="table" rowCount={6} columnCount={4} />
      </StyledLayout>
    );
  }

  if (!isDefined(reports)) {
    return <AnalyticsStatePanel kind="DISABLED" />;
  }

  // Until one is picked, the viewer opens the newest finished period of either type.
  const selectedReport =
    reports.find((report) => getReportKey(report) === selectedReportKey) ??
    reports.toSorted((reportA, reportB) =>
      reportB.periodEnd.localeCompare(reportA.periodEnd),
    )[0];

  if (!isDefined(selectedReport)) {
    return (
      <StyledEmptyPanel>
        <EmptyState.Root>
          <EmptyState.Content>
            <EmptyState.Title>{t`No reports yet`}</EmptyState.Title>
            <EmptyState.Description>
              {t`The first one appears after the first complete week.`}
            </EmptyState.Description>
          </EmptyState.Content>
        </EmptyState.Root>
      </StyledEmptyPanel>
    );
  }

  return (
    <StyledLayout>
      <StyledRail aria-label={t`Reports`}>
        <AnalyticsReportGroup
          title={t`Weekly`}
          reports={getNewestFirstReports(reports, 'WEEK')}
          selectedReportKey={getReportKey(selectedReport)}
          onSelect={setSelectedReportKey}
        />
        <AnalyticsReportGroup
          title={t`Monthly`}
          reports={getNewestFirstReports(reports, 'MONTH')}
          selectedReportKey={getReportKey(selectedReport)}
          onSelect={setSelectedReportKey}
        />
      </StyledRail>
      <AnalyticsReportView
        periodType={selectedReport.periodType}
        periodStart={selectedReport.periodStart}
        stages={meta.stages}
      />
    </StyledLayout>
  );
};
