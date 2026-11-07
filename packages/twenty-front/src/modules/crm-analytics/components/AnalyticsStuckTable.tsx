import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type KeyboardEvent } from 'react';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

const STUCK_TABLE_MAX_HEIGHT = 480;

const StyledHint = styled.p`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
`;

const StyledEmpty = styled.p`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding: ${themeCssVariables.spacing[3]};
`;

type AnalyticsStuckTableProps = {
  stuck: AnalyticsOverview['stuck'];
};

export const AnalyticsStuckTable = ({ stuck }: AnalyticsStuckTableProps) => {
  const { formatNumber } = useNumberFormat();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  if (stuck.rows.length === 0) {
    return (
      <StyledEmpty>
        {stuck.hasLimits
          ? t`No one is past their stage limit.`
          : t`No active people to list.`}
      </StyledEmpty>
    );
  }

  const openPerson = (personId: string) =>
    openRecordInSidePanel({
      recordId: personId,
      objectNameSingular: CoreObjectNameSingular.Person,
    });

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    personId: string,
  ) => {
    if (event.key === 'Enter') {
      openPerson(personId);
    }
  };

  const shownCount = formatNumber(stuck.rows.length);
  const totalCount = formatNumber(stuck.total);

  return (
    <>
      {!stuck.hasLimits && (
        <StyledHint>
          {t`No stage limits are set, so this list is sorted by days in stage.`}
        </StyledHint>
      )}
      <AnalyticsTable.Root
        aria-label={t`People to follow up`}
        hasFocusableRows
        maxHeight={STUCK_TABLE_MAX_HEIGHT}
      >
        <thead>
          <tr>
            <AnalyticsTable.HeaderCell>{t`Name`}</AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell>{t`Stage`}</AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Days in stage`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Days over limit`}
            </AnalyticsTable.HeaderCell>
          </tr>
        </thead>
        <tbody>
          {stuck.rows.map((row) => {
            const daysInStage = formatNumber(row.daysInStage);

            return (
              <AnalyticsTable.Row
                key={row.personId}
                isInteractive
                tabIndex={0}
                onClick={() => openPerson(row.personId)}
                onKeyDown={(event) => handleRowKeyDown(event, row.personId)}
              >
                <AnalyticsTable.Cell isTruncated dir="auto">
                  {row.displayName}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isTruncated dir="auto">
                  {row.stageLabel}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {row.isLowerBound ? t`at least ${daysInStage}` : daysInStage}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {isDefined(row.daysOverLimit)
                    ? formatNumber(row.daysOverLimit)
                    : null}
                </AnalyticsTable.Cell>
              </AnalyticsTable.Row>
            );
          })}
        </tbody>
      </AnalyticsTable.Root>
      {stuck.rows.length < stuck.total && (
        <StyledHint>{t`Showing ${shownCount} of ${totalCount}`}</StyledHint>
      )}
    </>
  );
};
