import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme';

import { SkeletonLine } from '@/ui/feedback/skeleton/components/SkeletonLine';
import { TAB_LIST_HEIGHT } from '@/ui/layout/tab-list/constants/TabListHeight';

const FIGURE_COUNT = 3;
const TAB_COUNT = 5;
const FILTER_COUNT = 6;

const StyledControlsRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  display: flex;
  gap: ${themeCssVariables.spacing[4]};
  overflow: hidden;
  padding: 0 ${themeCssVariables.spacing[4]};
`;

const StyledTabsRow = styled(StyledControlsRow)`
  height: ${TAB_LIST_HEIGHT};
`;

// Holds a small select plus the filter bar's padding and border, so the row keeps its height.
const StyledFiltersRow = styled(StyledControlsRow)`
  gap: ${themeCssVariables.spacing[2]};
  min-height: calc(
    ${themeCssVariables.spacing[6]} + ${themeCssVariables.spacing[4]} + 1px
  );
`;

const StyledFigures = styled.div`
  background: ${themeCssVariables.border.color.light};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-wrap: wrap;
  gap: 1px;
  overflow: hidden;
`;

const StyledFigure = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1 1 160px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledHeroFigure = styled(StyledFigure)`
  flex: 2 1 240px;
`;

const StyledTable = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  overflow: hidden;
`;

const StyledTableRow = styled.div<{ isHeader?: boolean }>`
  align-items: center;
  background: ${({ isHeader }) =>
    isHeader ? themeCssVariables.background.secondary : 'transparent'};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  height: 32px;
  padding: 0 ${themeCssVariables.spacing[3]};

  &:last-child {
    border-bottom: none;
  }
`;

const StyledChart = styled.div`
  height: 280px;
`;

type AnalyticsSkeletonProps = {
  shape: 'controls' | 'figures' | 'table' | 'chart';
  rowCount?: number;
  columnCount?: number;
};

// Holds the geometry of the view it stands in for, so nothing jumps when data arrives.
export const AnalyticsSkeleton = ({
  shape,
  rowCount = 8,
  columnCount = 3,
}: AnalyticsSkeletonProps) => {
  if (shape === 'controls') {
    return (
      <div role="status" aria-label={t`Loading`}>
        <StyledTabsRow>
          {Array.from({ length: TAB_COUNT }, (_, index) => (
            <SkeletonLine key={index} width={64} height={12} />
          ))}
        </StyledTabsRow>
        <StyledFiltersRow>
          {Array.from({ length: FILTER_COUNT }, (_, index) => (
            <SkeletonLine key={index} width={112} height={24} />
          ))}
        </StyledFiltersRow>
      </div>
    );
  }

  if (shape === 'chart') {
    return (
      <StyledChart role="status" aria-label={t`Loading`}>
        <SkeletonLine width="100%" height={280} />
      </StyledChart>
    );
  }

  if (shape === 'figures') {
    return (
      <StyledFigures role="status" aria-label={t`Loading`}>
        <StyledHeroFigure>
          <SkeletonLine width={96} height={12} />
          <SkeletonLine width={120} height={44} />
          <SkeletonLine width={160} height={10} />
        </StyledHeroFigure>
        {Array.from({ length: FIGURE_COUNT }, (_, index) => (
          <StyledFigure key={index}>
            <SkeletonLine width={80} height={12} />
            <SkeletonLine width={64} height={24} />
            <SkeletonLine width={112} height={10} />
          </StyledFigure>
        ))}
      </StyledFigures>
    );
  }

  const gridTemplateColumns = `minmax(0, 2fr) repeat(${columnCount - 1}, minmax(0, 1fr))`;

  return (
    <StyledTable role="status" aria-label={t`Loading`}>
      {Array.from({ length: rowCount + 1 }, (_, rowIndex) => (
        <StyledTableRow
          key={rowIndex}
          isHeader={rowIndex === 0}
          style={{ gridTemplateColumns }}
        >
          {Array.from({ length: columnCount }, (_, columnIndex) => (
            <SkeletonLine
              key={columnIndex}
              width={columnIndex === 0 ? '60%' : '40%'}
              height={10}
            />
          ))}
        </StyledTableRow>
      ))}
    </StyledTable>
  );
};
