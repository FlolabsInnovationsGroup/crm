import { styled } from '@linaria/react';
import { plural, t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconChevronDown, IconChevronRight } from 'twenty-ui/icon';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsBarCell } from '@/crm-analytics/components/AnalyticsBarCell';
import { AnalyticsRateCell } from '@/crm-analytics/components/AnalyticsRateCell';
import { AnalyticsNote } from '@/crm-analytics/components/AnalyticsSection';
import { AnalyticsTable } from '@/crm-analytics/components/AnalyticsTable';
import {
  type AnalyticsCategories,
  type AnalyticsCategoryRow,
  type AnalyticsStageDefinition,
} from '@/crm-analytics/types/AnalyticsApi';
import { getAnalyticsCategoryLabel } from '@/crm-analytics/utils/getAnalyticsCategoryLabel';
import { isAnalyticsCatchAllRow } from '@/crm-analytics/utils/isAnalyticsCatchAllRow';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';

type AnalyticsCategoryLabelIndent = 'none' | 'chevron' | 'program';

const INDENT_BY_LEVEL: Record<AnalyticsCategoryLabelIndent, string> = {
  none: themeCssVariables.spacing[0],
  chevron: themeCssVariables.spacing[5],
  program: themeCssVariables.spacing[8],
};

const CATEGORY_TABLE_MAX_HEIGHT = 640;

const StyledPeopleHeaderCell = styled(AnalyticsTable.HeaderCell)`
  min-width: 200px;
`;

// The label wraps rather than truncates, so the sticky column needs its own width in an auto-layout table.
const StyledLabelBox = styled.div`
  line-height: 1.3;
  max-width: 320px;
  min-width: 220px;
  padding-block: ${themeCssVariables.spacing[1]};
  white-space: normal;

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    min-width: 120px;
  }
`;

const StyledLabel = styled.span<{
  indent: AnalyticsCategoryLabelIndent;
  isProgram: boolean;
}>`
  color: ${({ isProgram }) =>
    isProgram
      ? themeCssVariables.font.color.secondary
      : themeCssVariables.font.color.primary};
  display: block;
  padding-inline-start: ${({ indent }) => INDENT_BY_LEVEL[indent]};
`;

const StyledExpandButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.xs};
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: ${themeCssVariables.spacing[1]};
  min-height: ${themeCssVariables.spacing[6]};
  padding: 0;
  text-align: start;
  width: 100%;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledChevron = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-shrink: 0;
`;

const compareRows = (
  firstRow: AnalyticsCategoryRow,
  secondRow: AnalyticsCategoryRow,
) => {
  if (isAnalyticsCatchAllRow(firstRow) !== isAnalyticsCatchAllRow(secondRow)) {
    return isAnalyticsCatchAllRow(firstRow) ? 1 : -1;
  }

  return secondRow.people - firstRow.people;
};

type AnalyticsCategoryTableProps = {
  categories: AnalyticsCategories;
  stages: Pick<AnalyticsStageDefinition, 'stageKey' | 'label'>[];
};

export const AnalyticsCategoryTable = ({
  categories,
  stages,
}: AnalyticsCategoryTableProps) => {
  const { formatNumber } = useNumberFormat();
  const [expandedTrackKeys, setExpandedTrackKeys] = useState<string[]>([]);

  const { groupBy, minimumSample, rows, stepStageKeys } = categories;

  const handleTrackToggle = (trackKey: string) =>
    setExpandedTrackKeys((previousKeys) =>
      previousKeys.includes(trackKey)
        ? previousKeys.filter((key) => key !== trackKey)
        : [...previousKeys, trackKey],
    );

  const sortedRows = [...rows].sort(compareRows);
  const rowKeys = new Set(rows.map((row) => row.key));

  // A program whose track is not in the payload still has to be counted somewhere visible.
  const topRows = sortedRows.filter(
    (row) => !isDefined(row.parentKey) || !rowKeys.has(row.parentKey),
  );

  const getProgramRows = (trackKey: string) =>
    sortedRows.filter((row) => row.parentKey === trackKey);

  const hasExpandableRow = topRows.some(
    (row) => getProgramRows(row.key).length > 0,
  );

  const visibleRows = topRows.flatMap((row) =>
    expandedTrackKeys.includes(row.key)
      ? [row, ...getProgramRows(row.key)]
      : [row],
  );

  const maxPeople = Math.max(0, ...topRows.map((row) => row.people));

  const largestRow = topRows.find(
    (row) => !isAnalyticsCatchAllRow(row) && row.people >= minimumSample,
  );

  const getBarTone = (row: AnalyticsCategoryRow) => {
    if (row === largestRow) {
      return 'accent';
    }

    return topRows.includes(row) && !isAnalyticsCatchAllRow(row)
      ? 'default'
      : 'muted';
  };

  const getLabelIndent = (row: AnalyticsCategoryRow) => {
    if (!topRows.includes(row)) {
      return 'program';
    }

    return hasExpandableRow ? 'chevron' : 'none';
  };

  const peopleInSeveralRows =
    visibleRows.length > topRows.length
      ? categories.peopleInSeveral
      : categories.peopleInSeveralTracks;
  const formattedPeopleInSeveralRows = formatNumber(peopleInSeveralRows);
  const distinctPeople = formatNumber(categories.distinctPeople);

  return (
    <>
      <AnalyticsTable.Root
        aria-label={
          groupBy === 'SOURCE'
            ? t`People and conversion by source`
            : t`People and conversion by track and program`
        }
        hasStickyFirstColumn
        maxHeight={CATEGORY_TABLE_MAX_HEIGHT}
      >
        <thead>
          <tr>
            <AnalyticsTable.HeaderCell>
              {groupBy === 'SOURCE' ? t`Source` : t`Track and program`}
            </AnalyticsTable.HeaderCell>
            <StyledPeopleHeaderCell isNumeric>
              {t`People`}
            </StyledPeopleHeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Active`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`New applications`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`People who applied`}
            </AnalyticsTable.HeaderCell>
            <AnalyticsTable.HeaderCell isNumeric>
              {t`Overall`}
            </AnalyticsTable.HeaderCell>
            {stepStageKeys.map((stageKey) => {
              const stageLabel =
                stages.find((stage) => stage.stageKey === stageKey)?.label ??
                stageKey;

              return (
                <AnalyticsTable.HeaderCell key={stageKey} isNumeric>
                  {t`${stageLabel} to next`}
                </AnalyticsTable.HeaderCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const isProgram = !topRows.includes(row);
            const isExpandable = getProgramRows(row.key).length > 0;
            const isExpanded = expandedTrackKeys.includes(row.key);

            return (
              <AnalyticsTable.Row key={row.key}>
                <AnalyticsTable.Cell dir="auto">
                  <StyledLabelBox>
                    {isExpandable ? (
                      <StyledExpandButton
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => handleTrackToggle(row.key)}
                      >
                        <StyledChevron aria-hidden="true">
                          {isExpanded ? (
                            <IconChevronDown size={16} />
                          ) : (
                            <IconChevronRight size={16} />
                          )}
                        </StyledChevron>
                        {getAnalyticsCategoryLabel(row, groupBy)}
                      </StyledExpandButton>
                    ) : (
                      <StyledLabel
                        isProgram={isProgram}
                        indent={getLabelIndent(row)}
                      >
                        {getAnalyticsCategoryLabel(row, groupBy)}
                      </StyledLabel>
                    )}
                  </StyledLabelBox>
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell>
                  <AnalyticsBarCell
                    value={row.people}
                    maxValue={maxPeople}
                    tone={getBarTone(row)}
                  />
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {formatNumber(row.activePeople)}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell
                  isNumeric
                  isMuted={!isDefined(row.newApplications)}
                >
                  {isDefined(row.newApplications)
                    ? formatNumber(row.newApplications)
                    : t`Not available`}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  {formatNumber(row.cohortSize)}
                </AnalyticsTable.Cell>
                <AnalyticsTable.Cell isNumeric>
                  <AnalyticsRateCell
                    rate={row.overallRate}
                    soFarRate={row.overallSoFarRate}
                    eligible={row.overallEligible}
                    isUnderMinimum={row.overallEligible < minimumSample}
                    isCompact
                  />
                </AnalyticsTable.Cell>
                {stepStageKeys.map((stageKey) => {
                  const stepRate = row.stepRates.find(
                    (candidate) => candidate.stageKey === stageKey,
                  );

                  return (
                    <AnalyticsTable.Cell key={stageKey} isNumeric>
                      <AnalyticsRateCell
                        rate={stepRate?.rate ?? null}
                        soFarRate={stepRate?.soFarRate}
                        eligible={stepRate?.eligible}
                        isUnderMinimum={
                          isDefined(stepRate) &&
                          stepRate.eligible < minimumSample
                        }
                        isCompact
                      />
                    </AnalyticsTable.Cell>
                  );
                })}
              </AnalyticsTable.Row>
            );
          })}
        </tbody>
      </AnalyticsTable.Root>
      {peopleInSeveralRows > 0 && (
        <AnalyticsNote>
          {plural(peopleInSeveralRows, {
            one: `${formattedPeopleInSeveralRows} person counts in several rows; rows do not add up to ${distinctPeople}.`,
            other: `${formattedPeopleInSeveralRows} people count in several rows; rows do not add up to ${distinctPeople}.`,
          })}
        </AnalyticsNote>
      )}
    </>
  );
};
