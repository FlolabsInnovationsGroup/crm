import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsAnswerCards } from '@/crm-analytics/charts/AnalyticsAnswerCards';
import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsChartGrid } from '@/crm-analytics/charts/AnalyticsChartGrid';
import { AnalyticsColumnChart } from '@/crm-analytics/charts/AnalyticsColumnChart';
import { AnalyticsFunnelChart } from '@/crm-analytics/charts/AnalyticsFunnelChart';
import { AnalyticsHorizontalBarChart } from '@/crm-analytics/charts/AnalyticsHorizontalBarChart';
import { AnalyticsStageLedger } from '@/crm-analytics/components/AnalyticsStageLedger';
import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { buildFunnelAnswerCards } from '@/crm-analytics/utils/buildFunnelAnswerCards';
import {
  buildFunnelChartSteps,
  buildStageDurationRows,
  buildStageOutcomeRows,
  buildStepConversionColumns,
  hasAnyStageDuration,
  hasAnyStepConversion,
} from '@/crm-analytics/utils/buildFunnelCharts';
import { formatAnalyticsPeopleCount } from '@/crm-analytics/utils/formatAnalyticsPeopleCount';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const getLedgerNote = (rows: AnalyticsFunnelRow[]) => {
  const stepWindows = new Set(
    rows.map((row) => row.windowDays).filter(isDefined),
  );

  if (stepWindows.size !== 1) {
    return t`People, by application date. To next counts only people who have had the full time allowed for each stage; still in progress means they have not yet.`;
  }

  const [stepWindowDays] = stepWindows;

  return t`People, by application date. To next counts only people who have had ${stepWindowDays} days; still in progress means they have not yet.`;
};

type AnalyticsFunnelChartsProps = {
  funnel: AnalyticsFunnel;
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'limitDays'>[];
};

export const AnalyticsFunnelCharts = ({
  funnel,
  stages,
}: AnalyticsFunnelChartsProps) => {
  const { formatNumber } = useNumberFormat();

  const excludedPeople = formatAnalyticsPeopleCount(
    funnel.cohortExcludedUnmapped,
    formatNumber,
  );
  const minimumSample = formatNumber(funnel.minimumSample);
  const formatRate = (rate: number) => formatAnalyticsRate(rate) ?? '';

  return (
    <>
      <AnalyticsAnswerCards
        cards={buildFunnelAnswerCards({ funnel, formatNumber })}
      />
      <AnalyticsChartGrid>
        <AnalyticsChartCard
          title={t`From new to signed`}
          note={[
            t`People who reached each stage, by application date. The percent is people who moved on within the stage's window, out of those past that window. The lowest step leaves out the first step when a later step has enough people.`,
            funnel.cohortExcludedUnmapped > 0
              ? t`${excludedPeople} left out because every stage they had is not mapped.`
              : null,
          ]
            .filter(isDefined)
            .join(' ')}
        >
          <AnalyticsFunnelChart
            ariaLabel={t`Funnel of people reaching each stage`}
            steps={buildFunnelChartSteps({ funnel, formatNumber })}
            lowestStepKey={funnel.lowestStepStageKey}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Conversion at each step`}
          note={t`People who moved on within the stage's window, out of those past that window. Lighter columns are small groups or still in progress.`}
          isEmpty={!hasAnyStepConversion(funnel)}
          emptyMessage={t`No one has passed a stage's window yet.`}
        >
          <AnalyticsColumnChart
            ariaLabel={t`Share of people moving on at each step`}
            columns={buildStepConversionColumns({ funnel, formatNumber })}
            highlightedColumnKey={funnel.lowestStepStageKey}
            highlightLabel={t`Lowest step`}
            maxValue={1}
            formatValue={formatRate}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`What happened to people at each stage?`}
          note={t`Moved on, Stalled and Left count only people whose window has ended. Moved on means they reached a later stage within it. Stalled means they did not move or leave within it. Left means they went to an exit stage within it. Still in progress means their window has not ended yet, so it can include people who have already moved on or left. Lighter bars are groups of fewer than ${minimumSample} people.`}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`Share of people who moved on, stalled, left or are still in progress at each stage`}
            rows={buildStageOutcomeRows(funnel)}
            isPercentMode
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`How long do people stay?`}
          note={t`Median days for finished stays. The tick marks the stage limit. Lighter bars come from fewer than ${minimumSample} stays.`}
          isEmpty={!hasAnyStageDuration(funnel)}
          emptyMessage={t`Not enough finished stays yet.`}
        >
          <AnalyticsHorizontalBarChart
            ariaLabel={t`Median days in each stage`}
            rows={buildStageDurationRows({ funnel, stages, formatNumber })}
          />
        </AnalyticsChartCard>
        <AnalyticsChartCard
          title={t`Stage by stage`}
          note={getLedgerNote(funnel.rows)}
          numbers={<AnalyticsStageLedger funnel={funnel} />}
          isFullWidth
        />
      </AnalyticsChartGrid>
    </>
  );
};
