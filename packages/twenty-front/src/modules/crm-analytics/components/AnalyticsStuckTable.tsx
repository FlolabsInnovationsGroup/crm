import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { OverflowingTextWithTooltip } from 'twenty-ui/primitives/typography';
import { themeCssVariables } from 'twenty-ui/theme';

import {
  AnalyticsNote,
  AnalyticsNotice,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';

const STUCK_TABLE_MAX_HEIGHT = 480;

const StyledPersonButton = styled.button`
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.xs};
  color: inherit;
  cursor: pointer;
  display: block;
  font: inherit;
  padding: 0;
  text-align: start;
  width: 100%;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: -2px;
  }
`;

type AnalyticsStuckTableProps = {
  stuck: AnalyticsOverview['stuck'];
};

export const AnalyticsStuckTable = ({ stuck }: AnalyticsStuckTableProps) => {
  const { formatNumber } = useNumberFormat();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  if (stuck.rows.length === 0) {
    return (
      <AnalyticsNotice>
        {stuck.hasLimits
          ? t`No one is past their stage limit.`
          : t`No active people to list.`}
      </AnalyticsNotice>
    );
  }

  const openPerson = (personId: string) =>
    openRecordInSidePanel({
      recordId: personId,
      objectNameSingular: CoreObjectNameSingular.Person,
    });

  const shownCount = formatNumber(stuck.rows.length);
  const totalCount = formatNumber(stuck.total);

  return (
    <>
      {!stuck.hasLimits && (
        <AnalyticsNote>
          {t`No stage limits are set, so this list is sorted by days in stage.`}
        </AnalyticsNote>
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
            const daysOverLimit = isDefined(row.daysOverLimit)
              ? formatNumber(row.daysOverLimit)
              : null;
            const hasName = isNonEmptyString(row.displayName);

            return (
              // The row takes the click for its whole width; the button adds the keyboard and the role.
              <AnalyticsTable.Row
                key={row.personId}
                isInteractive
                onClick={() => openPerson(row.personId)}
              >
                <AnalyticsTable.Cell isTruncated isMuted={!hasName} dir="auto">
                  <StyledPersonButton type="button">
                    <OverflowingTextWithTooltip
                      text={hasName ? row.displayName : t`Unnamed person`}
                    />
                  </StyledPersonButton>
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isTruncated dir="auto">
                  <OverflowingTextWithTooltip text={row.stageLabel} />
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {row.isLowerBound ? t`at least ${daysInStage}` : daysInStage}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {row.isLowerBound && isDefined(daysOverLimit)
                    ? t`at least ${daysOverLimit}`
                    : daysOverLimit}
                </AnalyticsTable.Cell>
              </AnalyticsTable.Row>
            );
          })}
        </tbody>
      </AnalyticsTable.Root>
      {stuck.rows.length < stuck.total && (
        <AnalyticsNote>
          {t`Showing ${shownCount} of ${totalCount}`}
        </AnalyticsNote>
      )}
    </>
  );
};
