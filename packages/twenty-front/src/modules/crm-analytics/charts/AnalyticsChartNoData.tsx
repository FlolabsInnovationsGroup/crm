import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledMessage = styled.p`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
  line-height: ${themeCssVariables.text.lineHeight.lg};
  margin: 0;
  min-height: 120px;
  padding: ${themeCssVariables.spacing[4]};
  text-align: center;
`;

type AnalyticsChartNoDataProps = {
  message?: string;
};

export const AnalyticsChartNoData = ({
  message,
}: AnalyticsChartNoDataProps) => (
  <StyledMessage>{message ?? t`Not enough data yet`}</StyledMessage>
);
