import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { VisuallyHidden } from 'twenty-ui/primitives/accessibility';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledDash = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

// A dash means not enough data. It is what stands in wherever a 0% would be a lie.
export const AnalyticsChartUnknownValue = () => (
  <>
    <StyledDash aria-hidden="true">-</StyledDash>
    <VisuallyHidden>{t`Not enough data`}</VisuallyHidden>
  </>
);
