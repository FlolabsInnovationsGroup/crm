import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsBarCell } from '@/crm-analytics/components/AnalyticsBarCell';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { type AnalyticsStageTotalRow } from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledBarHeaderCell = styled(AnalyticsTable.HeaderCell)`
  width: 56%;
`;

const StyledNestedLabel = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  padding-inline-start: ${themeCssVariables.spacing[4]};
`;

const getRowLabel = (row: AnalyticsStageTotalRow) => {
  switch (row.rowKind) {
    case 'UNMAPPED': {
      const rawValue = row.label;

      return t`Unmapped: ${rawValue}`;
    }
    case 'NO_STAGE':
      return t`No stage`;
    default:
      return row.label;
  }
};

const getBarTone = (row: AnalyticsStageTotalRow, largestRowKey?: string) => {
  if (row.rowKey === largestRowKey) {
    return 'accent';
  }

  return row.rowKind === 'MAIN' ? 'default' : 'muted';
};

type AnalyticsStageTotalsTableProps = {
  rows: AnalyticsStageTotalRow[];
};

export const AnalyticsStageTotalsTable = ({
  rows,
}: AnalyticsStageTotalsTableProps) => {
  const { formatNumber } = useNumberFormat();

  const topRows = rows.filter((row) => row.rowKind !== 'NESTED');
  const maxCount = Math.max(0, ...topRows.map((row) => row.count));

  // The one accent on this tab marks where most of the active pipeline sits.
  const largestMainRow = topRows
    .filter((row) => row.rowKind === 'MAIN' && row.count > 0)
    .reduce<AnalyticsStageTotalRow | undefined>(
      (largestRow, row) =>
        !isDefined(largestRow) || row.count > largestRow.count
          ? row
          : largestRow,
      undefined,
    );

  return (
    <AnalyticsTable.Root aria-label={t`People by current stage`}>
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>{t`Stage`}</AnalyticsTable.HeaderCell>
          <StyledBarHeaderCell isNumeric>{t`People`}</StyledBarHeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Past limit`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Inactive`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const previousTopRow = rows
            .slice(0, rowIndex)
            .reverse()
            .find((candidate) => candidate.rowKind !== 'NESTED');

          return (
            <AnalyticsTable.Row
              key={row.rowKey}
              data-group-start={
                row.rowKind !== 'NESTED' &&
                isDefined(previousTopRow) &&
                previousTopRow.rowKind !== row.rowKind
              }
            >
              <AnalyticsTable.Cell isTruncated dir="auto">
                {row.rowKind === 'NESTED' ? (
                  <StyledNestedLabel>
                    <OverflowingTextWithTooltip text={row.label} />
                  </StyledNestedLabel>
                ) : (
                  <OverflowingTextWithTooltip
                    text={getRowLabel(row)}
                    isFocusable={row.rowKind === 'UNMAPPED'}
                  />
                )}
              </AnalyticsTable.Cell>
              <AnalyticsTable.Cell>
                <AnalyticsBarCell
                  value={row.count}
                  maxValue={maxCount}
                  tone={getBarTone(row, largestMainRow?.rowKey)}
                />
              </AnalyticsTable.Cell>
              <AnalyticsTable.Cell isNumeric>
                {isDefined(row.pastLimitCount)
                  ? formatNumber(row.pastLimitCount)
                  : null}
              </AnalyticsTable.Cell>
              <AnalyticsTable.Cell isNumeric>
                {isDefined(row.pastLimitCount) || row.inactiveCount > 0
                  ? formatNumber(row.inactiveCount)
                  : null}
              </AnalyticsTable.Cell>
            </AnalyticsTable.Row>
          );
        })}
      </tbody>
    </AnalyticsTable.Root>
  );
};
