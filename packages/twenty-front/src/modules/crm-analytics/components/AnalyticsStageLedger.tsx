import { i18n } from '@lingui/core';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsBarCell } from '@/crm-analytics/components/AnalyticsBarCell';
import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import {
  AnalyticsNote,
  AnalyticsNotice,
} from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import {
  type AnalyticsFunnel,
  type AnalyticsFunnelRow,
} from '@/crm-analytics/types/AnalyticsApi';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

const StyledReachedHeaderCell = styled(AnalyticsTable.HeaderCell)`
  min-width: 240px;
  width: 40%;
`;

const StyledToNextHeaderCell = styled(AnalyticsTable.HeaderCell)`
  min-width: 128px;
`;

const StyledCell = styled(AnalyticsTable.Cell)`
  border-bottom-color: ${themeCssVariables.border.color.medium};
  font-size: ${themeCssVariables.font.size.md};
  height: 40px;
`;

const StyledStageCell = styled(AnalyticsTable.RowHeaderCell)`
  border-bottom-color: ${themeCssVariables.border.color.medium};
  font-size: ${themeCssVariables.font.size.md};
  height: 40px;
`;

const StyledToNextCell = styled(StyledCell)`
  position: relative;
`;

// Opaque, so the rate interrupts the hairline between two stages instead of being struck through by it.
const StyledStepRate = styled.span<{ isLowest: boolean; isMeasured: boolean }>`
  align-items: center;
  background: ${({ isLowest }) =>
    isLowest
      ? themeCssVariables.color.blue3
      : themeCssVariables.background.primary};
  border-radius: ${themeCssVariables.border.radius.xs};
  bottom: 0;
  display: flex;
  font-weight: ${({ isMeasured }) =>
    isMeasured
      ? themeCssVariables.font.weight.medium
      : themeCssVariables.font.weight.regular};
  gap: ${themeCssVariables.spacing[2]};
  inset-inline-end: ${themeCssVariables.spacing[2]};
  line-height: 20px;
  padding: 0 ${themeCssVariables.spacing[1]};
  position: absolute;
  transform: translateY(50%);
  white-space: nowrap;
  z-index: 1;
`;

const StyledLowestStepLabel = styled.span`
  color: ${themeCssVariables.color.blue11};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledDetailValue = styled.span<{ isMuted: boolean }>`
  color: ${({ isMuted }) =>
    isMuted
      ? themeCssVariables.font.color.tertiary
      : themeCssVariables.font.color.secondary};
`;

const StyledSampleSize = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  margin-inline-start: ${themeCssVariables.spacing[1]};
`;

const StyledOverallCell = styled(StyledCell)`
  background: ${themeCssVariables.background.secondary};
  border-bottom: none;
  border-top: 1px solid ${themeCssVariables.border.color.strong};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledOverallStageCell = styled(StyledStageCell)`
  background: ${themeCssVariables.background.secondary};
  border-bottom: none;
  border-top: 1px solid ${themeCssVariables.border.color.strong};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledOverallDescription = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-weight: ${themeCssVariables.font.weight.regular};
`;

type AnalyticsLedgerCountCellProps = {
  count: number;
  isFinalStage: boolean;
};

const AnalyticsLedgerCountCell = ({
  count,
  isFinalStage,
}: AnalyticsLedgerCountCellProps) => {
  const { formatNumber } = useNumberFormat();

  // People stay at the last stage, so a zero here would report on a step that does not exist.
  if (isFinalStage) {
    return <StyledCell isNumeric />;
  }

  return (
    <StyledCell isNumeric>
      <StyledDetailValue isMuted={count === 0}>
        {formatNumber(count)}
      </StyledDetailValue>
    </StyledCell>
  );
};

type AnalyticsLedgerMedianCellProps = {
  row: AnalyticsFunnelRow;
  isFinalStage: boolean;
  minimumSample: number;
};

const AnalyticsLedgerMedianCell = ({
  row,
  isFinalStage,
  minimumSample,
}: AnalyticsLedgerMedianCellProps) => {
  const { formatNumber } = useNumberFormat();

  if (!isDefined(row.medianDays)) {
    return (
      <StyledCell isNumeric>
        {!isFinalStage && <AnalyticsRateCell rate={null} />}
      </StyledCell>
    );
  }

  const isUnderMinimum = row.completedStays < minimumSample;
  const sampleSize = formatNumber(row.completedStays);

  return (
    <StyledCell isNumeric>
      <StyledDetailValue isMuted={isUnderMinimum}>
        {formatNumber(row.medianDays, { decimals: 1 })}
      </StyledDetailValue>
      {isUnderMinimum && (
        <StyledSampleSize>{t`n=${sampleSize}`}</StyledSampleSize>
      )}
    </StyledCell>
  );
};

const getReachedBarTone = (row: AnalyticsFunnelRow, isLowest: boolean) => {
  if (isLowest) {
    return 'accent';
  }

  return row.entered === 0 ? 'muted' : 'default';
};

type AnalyticsStageLedgerProps = {
  funnel: AnalyticsFunnel;
};

export const AnalyticsStageLedger = ({ funnel }: AnalyticsStageLedgerProps) => {
  const { formatNumber } = useNumberFormat();

  const { lowestStepStageKey, minimumSample, overall, rows } = funnel;

  const cohortSize = formatNumber(funnel.cohortSize);
  const excludedUnmapped = formatNumber(funnel.cohortExcludedUnmapped);
  const trackingStartedOn = i18n.date(new Date(funnel.trackingStartedAt), {
    dateStyle: 'medium',
    timeZone: funnel.reportingTimeZone,
  });

  const note = [
    t`Cohort size: ${cohortSize}. Tracking started ${trackingStartedOn}.`,
    funnel.cohortExcludedUnmapped > 0
      ? t`${excludedUnmapped} left out because every stage they had is unmapped.`
      : null,
    t`Someone who applies again counts once, and their furthest stage carries over.`,
  ]
    .filter(isDefined)
    .join(' ');

  if (funnel.cohortSize === 0) {
    return (
      <>
        <AnalyticsNotice>
          {t`No one in this view has entered the funnel yet. The Overview tab shows where people are now.`}
        </AnalyticsNotice>
        <AnalyticsNote>{note}</AnalyticsNote>
      </>
    );
  }

  const firstRowReached = rows[0]?.entered ?? 0;
  const finalStageLabel = rows.find(
    (row) => row.stageKey === overall.finalStageKey,
  )?.label;

  const overallWindowDays = overall.windowDays;
  const overallReached = formatNumber(overall.reached);
  const overallEligible = formatNumber(overall.eligible);

  return (
    <>
      <AnalyticsTable.Root aria-label={t`Conversion by stage`}>
        <thead>
          <tr>
            <AnalyticsTable.HeaderCell>{t`Stage`}</AnalyticsTable.HeaderCell>
            <StyledReachedHeaderCell isNumeric>
              {t`Reached`}
            </StyledReachedHeaderCell>
            <StyledToNextHeaderCell isNumeric>
              {t`To next`}
            </StyledToNextHeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Timed out`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Exited`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Too recent`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Median days`}
            </AnalyticsTable.HeaderCell>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isFinalStage = rowIndex === rows.length - 1;
            const isLowest =
              !isFinalStage && row.stageKey === lowestStepStageKey;

            return (
              <tr key={row.stageKey}>
                <StyledStageCell scope="row" dir="auto">
                  {row.label}
                </StyledStageCell>
                <StyledCell>
                  <AnalyticsBarCell
                    value={row.entered}
                    maxValue={firstRowReached}
                    tone={getReachedBarTone(row, isLowest)}
                  />
                </StyledCell>
                <StyledToNextCell isNumeric>
                  {!isFinalStage && (
                    <StyledStepRate
                      isLowest={isLowest}
                      isMeasured={
                        isDefined(row.stepRate) && !row.isUnderMinimum
                      }
                    >
                      {isLowest && (
                        <StyledLowestStepLabel>
                          {t`Lowest step`}
                        </StyledLowestStepLabel>
                      )}
                      <AnalyticsRateCell
                        rate={row.stepRate}
                        soFarRate={row.soFarRate}
                        eligible={row.eligible}
                        isUnderMinimum={row.isUnderMinimum}
                      />
                    </StyledStepRate>
                  )}
                </StyledToNextCell>
                <AnalyticsLedgerCountCell
                  count={row.timedOut}
                  isFinalStage={isFinalStage}
                />
                <AnalyticsLedgerCountCell
                  count={row.exited}
                  isFinalStage={isFinalStage}
                />
                <AnalyticsLedgerCountCell
                  count={row.inWindow}
                  isFinalStage={isFinalStage}
                />
                <AnalyticsLedgerMedianCell
                  row={row}
                  isFinalStage={isFinalStage}
                  minimumSample={minimumSample}
                />
              </tr>
            );
          })}
        </tbody>
        {isDefined(finalStageLabel) && (
          <tfoot>
            <tr>
              <StyledOverallStageCell scope="row">
                {t`Overall`}
              </StyledOverallStageCell>
              <StyledOverallCell>
                <StyledOverallDescription>
                  {overall.eligible > 0
                    ? t`${overallReached} of ${overallEligible} reached ${finalStageLabel} within ${overallWindowDays} days`
                    : t`No one has passed the ${overallWindowDays}-day window yet`}
                </StyledOverallDescription>
              </StyledOverallCell>
              <StyledOverallCell isNumeric>
                <AnalyticsRateCell
                  rate={overall.rate}
                  soFarRate={overall.soFarRate}
                  eligible={overall.eligible}
                  isUnderMinimum={overall.isUnderMinimum}
                />
              </StyledOverallCell>
              <StyledOverallCell colSpan={4} />
            </tr>
          </tfoot>
        )}
      </AnalyticsTable.Root>
      <AnalyticsNote>{note}</AnalyticsNote>
    </>
  );
};
