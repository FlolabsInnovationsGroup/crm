import { t } from '@lingui/core/macro';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';

import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { type AnalyticsMovementRow } from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

type AnalyticsMovementTableProps = {
  rows: AnalyticsMovementRow[];
  countHeading?: string;
};

export const AnalyticsMovementTable = ({
  rows,
  countHeading,
}: AnalyticsMovementTableProps) => {
  const { formatNumber } = useNumberFormat();

  return (
    <AnalyticsTable.Root aria-label={t`Stage movement`}>
      <thead>
        <tr>
          <AnalyticsTable.HeaderCell>{t`Stage`}</AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Entered`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Moved out`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {countHeading ?? t`Now`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <AnalyticsTable.Row key={row.stageKey}>
            <AnalyticsTable.Cell isTruncated dir="auto">
              <OverflowingTextWithTooltip text={row.label} />
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {formatNumber(row.enteredInPeriod)}
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {formatNumber(row.leftInPeriod)}
            </AnalyticsTable.Cell>
            <AnalyticsTable.Cell isNumeric>
              {formatNumber(row.countNow)}
            </AnalyticsTable.Cell>
          </AnalyticsTable.Row>
        ))}
      </tbody>
    </AnalyticsTable.Root>
  );
};
