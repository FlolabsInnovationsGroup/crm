import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledAxisText = styled.text`
  fill: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-variant-numeric: tabular-nums;
`;

export const AnalyticsChartAxisText = StyledAxisText;
