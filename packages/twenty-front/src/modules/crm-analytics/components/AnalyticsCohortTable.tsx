import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import {
  type AnalyticsCohortCell,
  type AnalyticsCohortRow,
  type AnalyticsPeriod,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { formatAnalyticsBucketLabel } from '@/crm-analytics/utils/formatAnalyticsBucketLabel';
import { formatAnalyticsOfPeople } from '@/crm-analytics/utils/formatAnalyticsOfPeople';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const COHORT_TABLE_MAX_HEIGHT = 448;

type AnalyticsStageLabel = Pick<AnalyticsStageDefinition, 'stageKey' | 'label'>;

// A fixed slot keeps the rates in one column aligned however wide each count is.
const StyledSampleSize = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: inline-block;
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
  margin-inline-start: ${themeCssVariables.spacing[2]};
  min-width: 14ch;
  text-align: end;
`;

const getStepColumns = (
  rows: AnalyticsCohortRow[],
  stages: AnalyticsStageLabel[],
) => {
  const stageKeys = new Set(
    rows.flatMap((row) => row.cells.map((cell) => cell.stageKey)),
  );

  return [...stageKeys].map((stageKey) => ({
    stageKey,
    label:
      stages.find((stage) => stage.stageKey === stageKey)?.label ?? stageKey,
  }));
};

type AnalyticsCohortStepCellProps = {
  cell: AnalyticsCohortCell | undefined;
  minimumSample: number;
};

const AnalyticsCohortStepCell = ({
  cell,
  minimumSample,
}: AnalyticsCohortStepCellProps) => {
  const { formatNumber } = useNumberFormat();

  if (!isDefined(cell)) {
    return (
      <AnalyticsTable.Cell isNumeric>
        <AnalyticsRateCell rate={null} isCompact />
      </AnalyticsTable.Cell>
    );
  }

  // A cell still inside its window only has a so far value, even when some people have passed it.
  return (
    <AnalyticsTable.Cell isNumeric>
      <AnalyticsRateCell
        rate={cell.isMature && cell.eligible > 0 ? cell.rate : null}
        soFarRate={cell.soFarRate}
        isUnderMinimum={cell.eligible < minimumSample}
        isCompact
      />
      <StyledSampleSize>
        {cell.entered > 0
          ? formatAnalyticsOfPeople(cell.entered, formatNumber)
          : null}
      </StyledSampleSize>
    </AnalyticsTable.Cell>
  );
};

type AnalyticsCohortTableProps = {
  rows: AnalyticsCohortRow[];
  stages: AnalyticsStageLabel[];
  period: AnalyticsPeriod;
  minimumSample: number;
};

export const AnalyticsCohortTable = ({
  rows,
  stages,
  period,
  minimumSample,
}: AnalyticsCohortTableProps) => {
  const { formatNumber } = useNumberFormat();

  const stepColumns = getStepColumns(rows, stages);

  const newestFirstRows = rows.toSorted((rowA, rowB) =>
    rowB.bucketStart.localeCompare(rowA.bucketStart),
  );

  return (
    <AnalyticsTable.Root
      aria-label={t`Conversion by application date`}
      hasStickyFirstColumn
      maxHeight={COHORT_TABLE_MAX_HEIGHT}
    >
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>
            {period === 'MONTH' ? t`Applied in` : t`Applied in week of`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`People`}
          </AnalyticsTable.HeaderCell>
          {stepColumns.map(({ stageKey, label: stageLabel }) => (
            <AnalyticsTable.HeaderCell key={stageKey} isNumeric>
              {t`${stageLabel} to next`}
            </AnalyticsTable.HeaderCell>
          ))}
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Overall`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {newestFirstRows.map((row) => (
          <AnalyticsTable.Row key={row.bucketStart}>
            <AnalyticsTable.Cell>
              {formatAnalyticsBucketLabel({
                bucketStart: row.bucketStart,
                period,
              })}
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {formatNumber(row.size)}
            </AnalyticsTable.Cell>
            {stepColumns.map((column) => (
              <AnalyticsCohortStepCell
                key={column.stageKey}
                cell={row.cells.find(
                  (cell) => cell.stageKey === column.stageKey,
                )}
                minimumSample={minimumSample}
              />
            ))}
            <AnalyticsTable.Cell isNumeric>
              <AnalyticsRateCell
                rate={row.overallRate}
                soFarRate={row.overallSoFarRate}
                eligible={row.size}
                isUnderMinimum={row.size < minimumSample}
                isCompact
              />
            </AnalyticsTable.Cell>
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};
