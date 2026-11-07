import { styled } from '@linaria/react';
import { type ReactNode } from 'react';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledScrollBox = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  min-width: 0;
  overflow: auto;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledTable = styled.table`
  border-collapse: separate;
  border-spacing: 0;
  font-size: ${themeCssVariables.font.size.sm};
  width: 100%;

  tbody tr:last-child td,
  tbody tr:last-child th {
    border-bottom: none;
  }

  tbody tr[data-group-start='true'] td {
    border-top: 1px solid ${themeCssVariables.border.color.strong};
  }

  tbody tr:has(+ tr[data-group-start='true']) td {
    border-bottom: none;
  }

  &[data-sticky-first-column='true'] th:first-child,
  &[data-sticky-first-column='true'] td:first-child {
    border-inline-end: 1px solid ${themeCssVariables.border.color.light};
    inset-inline-start: 0;
    position: sticky;
  }

  &[data-sticky-first-column='true'] th:first-child {
    z-index: 2;
  }

  &[data-sticky-first-column='true'] td:first-child {
    background: ${themeCssVariables.background.primary};
    z-index: 1;
  }
`;

const StyledHeaderCell = styled.th<{ isNumeric?: boolean }>`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.tertiary};
  font-weight: ${themeCssVariables.font.weight.medium};
  height: 32px;
  padding: 0 ${themeCssVariables.spacing[3]};
  position: sticky;
  text-align: ${({ isNumeric }) => (isNumeric ? 'end' : 'start')};
  top: 0;
  white-space: nowrap;
  z-index: 1;
`;

const StyledRowHeaderCell = styled.th`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.regular};
  height: 32px;
  padding: 0 ${themeCssVariables.spacing[3]};
  text-align: start;
  white-space: nowrap;
`;

const StyledCell = styled.td<{
  isNumeric?: boolean;
  isMuted?: boolean;
  isTruncated?: boolean;
}>`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  box-sizing: border-box;
  color: ${({ isMuted }) =>
    isMuted
      ? themeCssVariables.font.color.tertiary
      : themeCssVariables.font.color.primary};
  font-variant-numeric: ${({ isNumeric }) =>
    isNumeric ? 'tabular-nums' : 'normal'};
  height: 32px;
  max-width: ${({ isTruncated }) => (isTruncated ? '240px' : 'none')};
  overflow: ${({ isTruncated }) => (isTruncated ? 'hidden' : 'visible')};
  padding: 0 ${themeCssVariables.spacing[3]};
  text-align: ${({ isNumeric }) => (isNumeric ? 'end' : 'start')};
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StyledRow = styled.tr<{ isInteractive?: boolean }>`
  cursor: ${({ isInteractive }) => (isInteractive ? 'pointer' : 'default')};

  &:hover {
    background: ${({ isInteractive }) =>
      isInteractive
        ? themeCssVariables.background.transparent.light
        : 'transparent'};
  }
`;

type AnalyticsTableRootProps = {
  'aria-label': string;
  hasFocusableRows?: boolean;
  hasStickyFirstColumn?: boolean;
  maxHeight?: number;
  children: ReactNode;
};

// Safari does not focus a scroller by itself, so the box is the tab stop unless every row has one.
const AnalyticsTableRoot = ({
  'aria-label': ariaLabel,
  hasFocusableRows = false,
  hasStickyFirstColumn = false,
  maxHeight,
  children,
}: AnalyticsTableRootProps) => (
  <StyledScrollBox
    aria-label={hasFocusableRows ? undefined : ariaLabel}
    role={hasFocusableRows ? undefined : 'region'}
    style={{ maxHeight }}
    tabIndex={hasFocusableRows ? undefined : 0}
  >
    <StyledTable
      aria-label={ariaLabel}
      data-sticky-first-column={hasStickyFirstColumn}
    >
      {children}
    </StyledTable>
  </StyledScrollBox>
);

export const AnalyticsTable = {
  Root: AnalyticsTableRoot,
  Row: StyledRow,
  HeaderCell: StyledHeaderCell,
  RowHeaderCell: StyledRowHeaderCell,
  Cell: StyledCell,
};
