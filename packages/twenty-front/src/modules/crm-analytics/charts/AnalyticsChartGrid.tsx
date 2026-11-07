import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

// The max() holds it at two columns on very wide screens, and min(100%) lets one column shrink on a phone.
const StyledGrid = styled.div`
  align-items: stretch;
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(
    auto-fit,
    minmax(
      min(100%, max(440px, calc(50% - ${themeCssVariables.spacing[2]}))),
      1fr
    )
  );
`;

export const AnalyticsChartGrid = StyledGrid;
