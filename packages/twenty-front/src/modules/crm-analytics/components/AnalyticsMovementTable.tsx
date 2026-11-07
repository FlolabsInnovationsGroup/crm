import { t } from '@lingui/core/macro';

import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { type AnalyticsMovementRow } from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

type AnalyticsMovementTableProps = {
  rows: AnalyticsMovementRow[];
};

export const AnalyticsMovementTable = ({
  rows,
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
            {t`Left`}
          </AnalyticsTable.HeaderCell>
          <AnalyticsTable.HeaderCell isNumeric>
            {t`Now`}
          </AnalyticsTable.HeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <AnalyticsTable.Row key={row.stageKey}>
            <AnalyticsTable.Cell isTruncated dir="auto">
              {row.label}
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
