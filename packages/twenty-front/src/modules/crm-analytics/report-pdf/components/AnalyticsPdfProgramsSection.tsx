import { t } from '@lingui/core/macro';
import { StyleSheet, View } from '@react-pdf/renderer';
import { isDefined } from 'twenty-shared/utils';

import { AnalyticsPdfActiveLegend } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfActiveLegend';
import { AnalyticsPdfHorizontalBars } from '@/crm-analytics/report-pdf/charts/AnalyticsPdfHorizontalBars';
import { AnalyticsPdfChartBlock } from '@/crm-analytics/report-pdf/components/AnalyticsPdfChartBlock';
import { AnalyticsPdfHeatmapBlocks } from '@/crm-analytics/report-pdf/components/AnalyticsPdfHeatmapBlocks';
import { AnalyticsPdfSection } from '@/crm-analytics/report-pdf/components/AnalyticsPdfSection';
import { AnalyticsPdfText } from '@/crm-analytics/report-pdf/components/AnalyticsPdfText';
import { ANALYTICS_PDF_COLOR } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfColor';
import { ANALYTICS_PDF_FONT_SIZE } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfFontSize';
import { ANALYTICS_PDF_PAGE_LAYOUT } from '@/crm-analytics/report-pdf/constants/AnalyticsPdfPageLayout';
import {
  buildAnalyticsPdfConversionBars,
  buildAnalyticsPdfCountBars,
} from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfCategoryBars';
import {
  buildAnalyticsPdfStepHeatmapRow,
  getAnalyticsPdfStepColumns,
} from '@/crm-analytics/report-pdf/utils/buildAnalyticsPdfStepHeatmap';
import { chunkAnalyticsPdfRows } from '@/crm-analytics/report-pdf/utils/chunkAnalyticsPdfRows';
import { formatAnalyticsPdfPeople } from '@/crm-analytics/report-pdf/utils/formatAnalyticsPdfNumber';
import { getAnalyticsPdfCategoryLabel } from '@/crm-analytics/report-pdf/utils/getAnalyticsPdfCategoryLabel';
import {
  type AnalyticsCategoryRow,
  type AnalyticsReport,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsRate } from '@/crm-analytics/utils/formatAnalyticsRate';

const FULL_WIDTH = ANALYTICS_PDF_PAGE_LAYOUT.contentWidth;
const LABEL_WIDTH = 158;
const PEOPLE_PANEL_WIDTH = 300;
const CONVERSION_PANEL_WIDTH = FULL_WIDTH - PEOPLE_PANEL_WIDTH;
const BAR_ROW_HEIGHT = 17;
const HEATMAP_ROW_HEIGHT = 20;

const styles = StyleSheet.create({
  conversionHead: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    width: CONVERSION_PANEL_WIDTH,
  },
  panelHeads: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  panels: {
    flexDirection: 'row',
  },
  noRate: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.label,
    lineHeight: 1.3,
    width: CONVERSION_PANEL_WIDTH,
  },
  peopleHead: {
    color: ANALYTICS_PDF_COLOR.inkSecondary,
    fontSize: ANALYTICS_PDF_FONT_SIZE.axis,
    paddingLeft: LABEL_WIDTH,
    width: PEOPLE_PANEL_WIDTH,
  },
});

type ProgramGroup = {
  key: string;
  trackTitle: string;
  title: string;
  rows: AnalyticsCategoryRow[];
};

const buildProgramGroups = (report: AnalyticsReport): ProgramGroup[] => {
  const { rows, groupBy } = report.categories;
  const programRows = rows.filter(({ parentKey }) => isDefined(parentKey));
  const parentKeys = Array.from(
    new Set(programRows.map(({ parentKey }) => parentKey)),
  ).filter(isDefined);

  return parentKeys.flatMap((parentKey) => {
    const parentRow = rows.find(
      ({ key, parentKey: ancestorKey }) =>
        key === parentKey && !isDefined(ancestorKey),
    );
    const title = isDefined(parentRow)
      ? getAnalyticsPdfCategoryLabel(parentRow, groupBy)
      : parentKey;
    const groupRows = programRows
      .filter((row) => row.parentKey === parentKey)
      .sort((first, second) => second.people - first.people);

    return chunkAnalyticsPdfRows(groupRows).map((chunkRows, chunkIndex) => ({
      key: `${parentKey}-${chunkIndex}`,
      trackTitle: title,
      title: chunkIndex === 0 ? title : t`${title}, continued`,
      rows: chunkRows,
    }));
  });
};

type AnalyticsPdfProgramsSectionProps = {
  report: AnalyticsReport;
};

export const AnalyticsPdfProgramsSection = ({
  report,
}: AnalyticsPdfProgramsSectionProps) => {
  const groups = buildProgramGroups(report);

  if (
    report.periodType !== 'MONTH' ||
    !groups.some(({ rows }) => rows.some(({ people }) => people > 0))
  ) {
    return null;
  }

  const { categories, minimumSample } = report;
  const groupBy = categories.groupBy;
  const stepColumns = getAnalyticsPdfStepColumns(report);
  const programRows = groups.flatMap(({ rows }) => rows);
  const maximumPeople = Math.max(1, ...programRows.map(({ people }) => people));
  const conversionBars = buildAnalyticsPdfConversionBars(
    programRows,
    groupBy,
    minimumSample,
  );
  const conversionByKey = new Map(conversionBars.map((bar) => [bar.key, bar]));
  const maximumRate = Math.max(
    0,
    ...conversionBars.map(({ value }) => value ?? 0),
  );
  const finalLabel = report.funnel.rows.find(
    ({ stageKey }) => stageKey === report.funnel.overall.finalStageKey,
  )?.label;
  const windowDays = report.funnel.overall.windowDays;
  const highestRate = formatAnalyticsRate(maximumRate);
  const severalProgramsPeople = formatAnalyticsPdfPeople(
    categories.peopleInSeveral,
  );
  const scaleNote =
    maximumRate > 0 ? t`Bars scaled to the highest rate, ${highestRate}.` : '';
  const overlapNote =
    categories.peopleInSeveral > 0
      ? t`${severalProgramsPeople} in several programs count once in each.`
      : '';
  const peopleNote = [
    t`People when this report was generated. Overall conversion from all applications since tracking start.`,
    scaleNote,
    overlapNote,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ');

  return (
    <AnalyticsPdfSection
      name={t`Programs`}
      question={t`How does each program compare?`}
      startsNewPage
    >
      {groups.map(({ key, title, rows }) => {
        const peopleBars = buildAnalyticsPdfCountBars(
          rows,
          groupBy,
          ({ people }) => people,
          ({ activePeople }) => activePeople,
        );
        const hasKnownRate = peopleBars.some(({ key: rowKey }) =>
          isDefined(conversionByKey.get(rowKey)?.value),
        );

        return (
          <AnalyticsPdfChartBlock
            key={key}
            title={title}
            note={peopleNote}
            legend={<AnalyticsPdfActiveLegend />}
          >
            <View style={styles.panelHeads}>
              <AnalyticsPdfText style={styles.peopleHead}>
                {t`People`}
              </AnalyticsPdfText>
              <AnalyticsPdfText style={styles.conversionHead}>
                {isDefined(finalLabel)
                  ? t`Reached ${finalLabel} within ${windowDays} days`
                  : t`Reached the last stage within ${windowDays} days`}
              </AnalyticsPdfText>
            </View>
            <View style={styles.panels}>
              <AnalyticsPdfHorizontalBars
                rows={peopleBars}
                width={PEOPLE_PANEL_WIDTH}
                labelWidth={LABEL_WIDTH}
                rowHeight={BAR_ROW_HEIGHT}
                maximumValue={maximumPeople}
              />
              {hasKnownRate ? (
                <AnalyticsPdfHorizontalBars
                  rows={peopleBars.flatMap(
                    ({ key: rowKey }) => conversionByKey.get(rowKey) ?? [],
                  )}
                  width={CONVERSION_PANEL_WIDTH}
                  labelWidth={0}
                  rowHeight={BAR_ROW_HEIGHT}
                  maximumValue={maximumRate}
                />
              ) : (
                <AnalyticsPdfText style={styles.noRate}>
                  {t`Conversion appears once people have had ${windowDays} days.`}
                </AnalyticsPdfText>
              )}
            </View>
          </AnalyticsPdfChartBlock>
        );
      })}
      {stepColumns.length > 0 &&
        groups.map(({ key, trackTitle, title, rows }) => (
          <AnalyticsPdfHeatmapBlocks
            key={`${key}-steps`}
            title={t`Conversion at every step: ${title}`}
            continuedTitle={t`Conversion at every step: ${trackTitle}, continued`}
            note={t`Share of people in each program who moved on within the step's window, all applications since tracking start.`}
            noDataLine={t`Conversion appears once people have had a step's full window.`}
            columns={stepColumns}
            rows={rows.map((row) =>
              buildAnalyticsPdfStepHeatmapRow(row, report),
            )}
            labelWidth={LABEL_WIDTH}
            rowHeight={HEATMAP_ROW_HEIGHT}
          />
        ))}
    </AnalyticsPdfSection>
  );
};
