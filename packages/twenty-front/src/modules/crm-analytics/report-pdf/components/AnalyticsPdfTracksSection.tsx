import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfActiveLegend } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfActiveLegend';
import { AnalyticsPdfHorizontalBars } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars';
import {
  AnalyticsPdfChartBlock,
  AnalyticsPdfChartPair,
} from '@/crm-analytics/report-pdf/components/AnalyticsPdfChartBlock';
import { AnalyticsPdfHeatmapBlocks } from '@/crm-analytics/report-pdf/components/AnalyticsPdfHeatmapBlocks';
import { AnalyticsPdfNoData } from '@/crm-analytics/report-pdf/components/AnalyticsPdfNoData';
import { AnalyticsPdfSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfSection';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import {
  buildAnalyticsPdfConversionBars,
  buildAnalyticsPdfCountBars,
} from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfCategoryBars';
import {
  buildAnalyticsPdfStepHeatmapRow,
  getAnalyticsPdfStepColumns,
} from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfStepHeatmap';
import { formatAnalyticsPdfPeople } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';
import { buildCategoriesTakeaway } from '@/crm-analytics/utils/buildCategoriesTakeaway';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

const FULL_WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.contentWidth;
const HALF_WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.halfWidth;
const HALF_LABEL_WIDTH = 112;
const FULL_LABEL_WIDTH = 150;
const ROW_HEIGHT = 24;
const HEATMAP_ROW_HEIGHT = 26;
const HALF_NOTE_HEIGHT = 24;
// The people chart beside this one has a legend, so its bars start this much lower.
const NOTE_HEIGHT_BESIDE_LEGEND = 37.5;

type AnalyticsPdfTracksSectionProps = {
  report: AnalyticsReport;
};

export const AnalyticsPdfTracksSection = ({
  report,
}: AnalyticsPdfTracksSectionProps) => {
  const { categories, funnel, minimumSample } = report;
  const groupBy = categories.groupBy;
  const trackRows = categories.rows.filter(
    ({ parentKey }) => !isDefined(parentKey),
  );
  const hasData = trackRows.some(({ people }) => people > 0);
  const name = t`Tracks`;
  const question = t`Which tracks work best?`;

  if (!hasData) {
    return (
      <AnalyticsPdfSection
        name={name}
        question={question}
        startsNewPage={false}
        isCompact
      >
        <AnalyticsPdfNoData line={t`No people in any track yet.`} />
      </AnalyticsPdfSection>
    );
  }

  const hasNewApplications = trackRows.some(({ newApplications }) =>
    isDefined(newApplications),
  );
  const finalLabel = funnel.rows.find(
    ({ stageKey }) => stageKey === funnel.overall.finalStageKey,
  )?.label;
  const windowDays = funnel.overall.windowDays;
  const peopleInSeveralTracks = categories.peopleInSeveralTracks;
  const severalTracksPeople = formatAnalyticsPdfPeople(peopleInSeveralTracks);
  const stepColumns = getAnalyticsPdfStepColumns(report);
  const conversionBars = buildAnalyticsPdfConversionBars(
    trackRows,
    groupBy,
    minimumSample,
  );
  const hasKnownConversion = conversionBars.some(({ value }) =>
    isDefined(value),
  );
  const highestRate = formatAnalyticsRate(
    Math.max(0, ...conversionBars.map(({ value }) => value ?? 0)),
  );
  const hasPositiveRate = conversionBars.some(({ value }) => (value ?? 0) > 0);
  const conversionTitle = t`Which track converts best?`;
  const conversionShare = isDefined(finalLabel)
    ? t`Share of people reaching ${finalLabel} within ${windowDays} days, all applications since tracking start.`
    : t`Share of people reaching the last stage within ${windowDays} days, all applications since tracking start.`;

  return (
    <AnalyticsPdfSection
      name={name}
      question={question}
      takeaway={buildCategoriesTakeaway(categories)}
      startsNewPage
    >
      <AnalyticsPdfChartPair>
        <AnalyticsPdfChartBlock
          title={t`New applications by track`}
          note={t`Applications submitted in this period, by the person's current track. An application counts once in each of the person's tracks, so these do not add up to the total.`}
          width={HALF_WIDTH}
          noteMinimumHeight={NOTE_HEIGHT_BESIDE_LEGEND}
          isInPair
        >
          {hasNewApplications ? (
            <AnalyticsPdfHorizontalBars
              rows={buildAnalyticsPdfCountBars(
                trackRows,
                groupBy,
                ({ newApplications }) => newApplications,
              )}
              width={HALF_WIDTH}
              labelWidth={HALF_LABEL_WIDTH}
              rowHeight={ROW_HEIGHT}
            />
          ) : (
            <AnalyticsPdfNoData
              line={t`Form submissions are not available, so there is nothing to count.`}
            />
          )}
        </AnalyticsPdfChartBlock>
        <AnalyticsPdfChartBlock
          title={t`People by track`}
          note={
            peopleInSeveralTracks > 0
              ? t`People when this report was generated. ${severalTracksPeople} in several tracks count once in each.`
              : t`People when this report was generated.`
          }
          width={HALF_WIDTH}
          noteMinimumHeight={HALF_NOTE_HEIGHT}
          isInPair
          legend={<AnalyticsPdfActiveLegend />}
        >
          <AnalyticsPdfHorizontalBars
            rows={buildAnalyticsPdfCountBars(
              trackRows,
              groupBy,
              ({ people }) => people,
              ({ activePeople }) => activePeople,
            )}
            width={HALF_WIDTH}
            labelWidth={HALF_LABEL_WIDTH}
            rowHeight={ROW_HEIGHT}
          />
        </AnalyticsPdfChartBlock>
      </AnalyticsPdfChartPair>
      {hasKnownConversion ? (
        <AnalyticsPdfChartBlock
          title={conversionTitle}
          note={
            hasPositiveRate
              ? t`${conversionShare} Bars scaled to the highest rate, ${highestRate}.`
              : conversionShare
          }
        >
          <AnalyticsPdfHorizontalBars
            rows={conversionBars}
            width={FULL_WIDTH}
            labelWidth={FULL_LABEL_WIDTH}
            rowHeight={ROW_HEIGHT}
          />
        </AnalyticsPdfChartBlock>
      ) : (
        <AnalyticsPdfNoData
          title={conversionTitle}
          line={t`Conversion appears once people have had ${windowDays} days.`}
        />
      )}
      {stepColumns.length > 0 && (
        <AnalyticsPdfHeatmapBlocks
          title={t`Conversion at every step`}
          continuedTitle={t`Conversion at every step, continued`}
          note={t`Share of people in each track who moved on within the step's window, all applications since tracking start.`}
          noDataLine={t`Conversion appears once people have had a step's full window.`}
          columns={stepColumns}
          rows={trackRows.map((row) =>
            buildAnalyticsPdfStepHeatmapRow(row, report),
          )}
          labelWidth={FULL_LABEL_WIDTH}
          rowHeight={HEATMAP_ROW_HEIGHT}
        />
      )}
    </AnalyticsPdfSection>
  );
};
