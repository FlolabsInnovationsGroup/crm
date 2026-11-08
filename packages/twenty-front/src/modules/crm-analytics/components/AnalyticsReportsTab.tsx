import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { isDefined } from 'twenty-shared/utils';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/icon';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsReportView } from '@/crm-analytics/components/AnalyticsReportView';
import { AnalyticsNotice } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';
import { AnalyticsStatePanel } from '@/crm-analytics/components/AnalyticsStatePanel';
import { GET_CRM_ANALYTICS_REPORTS } from '@/crm-analytics/graphql/getCrmAnalyticsReports';
import { useCrmAnalyticsQuery } from '@/crm-analytics/hooks/useCrmAnalyticsQuery';
import {
  type AnalyticsFilter,
  type AnalyticsReportListItem,
  type AnalyticsReportPeriodType,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsReportPeriod } from '@/crm-analytics/utils/formatAnalyticsReportPeriod';
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

const StyledGroupTitle = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  gap: ${themeCssVariables.spacing[1]};
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

const StyledGroupCount = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-weight: ${themeCssVariables.font.weight.regular};
  margin-left: auto;
`;

const StyledShowMoreButton = styled.button`
  background: none;
  border: none;
  color: ${themeCssVariables.font.color.tertiary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
  text-align: start;

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: -2px;
  }
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

const COLLAPSED_REPORT_COUNT = 5;

const AnalyticsReportGroup = ({
  title,
  reports,
  selectedReportKey,
  onSelect,
}: AnalyticsReportGroupProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isShowingAll, setIsShowingAll] = useState(false);

  const selectedIndex = reports.findIndex(
    (report) => getReportKey(report) === selectedReportKey,
  );
  const visibleCount =
    isShowingAll || selectedIndex >= COLLAPSED_REPORT_COUNT
      ? reports.length
      : COLLAPSED_REPORT_COUNT;
  const visibleReports = reports.slice(0, visibleCount);
  const hiddenCount = reports.length - visibleReports.length;

  return (
    <StyledGroup>
      <StyledGroupTitle
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <IconChevronDown size={14} stroke={1.6} />
        ) : (
          <IconChevronRight size={14} stroke={1.6} />
        )}
        {title}
        <StyledGroupCount>{reports.length}</StyledGroupCount>
      </StyledGroupTitle>
      {isOpen &&
        (reports.length === 0 ? (
          <StyledGroupEmpty>{t`None yet`}</StyledGroupEmpty>
        ) : (
          <StyledList aria-label={title}>
            {visibleReports.map((report) => {
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
            {(hiddenCount > 0 || isShowingAll) &&
              reports.length > COLLAPSED_REPORT_COUNT && (
                <li>
                  <StyledShowMoreButton
                    type="button"
                    onClick={() => setIsShowingAll(!isShowingAll)}
                  >
                    {hiddenCount > 0
                      ? t`Show ${hiddenCount} more`
                      : t`Show less`}
                  </StyledShowMoreButton>
                </li>
              )}
          </StyledList>
        ))}
    </StyledGroup>
  );
};

type AnalyticsReportsTabProps = {
  onFilterChange?: (nextFilter: AnalyticsFilter) => void;
};

export const AnalyticsReportsTab = (_props: AnalyticsReportsTabProps) => {
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
      <ErrorBoundary
        fallback={
          <AnalyticsNotice>
            {t`This report cannot be displayed`}
          </AnalyticsNotice>
        }
        resetKeys={[getReportKey(selectedReport)]}
      >
        <AnalyticsReportView
          periodType={selectedReport.periodType}
          periodStart={selectedReport.periodStart}
        />
      </ErrorBoundary>
    </StyledLayout>
  );
};
