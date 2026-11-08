import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

export type AnalyticsChartLegendItem = {
  key: string;
  label: string;
  color: string;
  onClick?: () => void;
};

const StyledLegend = styled.ul`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
  list-style: none;
  margin: 0;
  padding: 0;
`;

const StyledItem = styled.li`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledItemButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.xs};
  color: inherit;
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: 0;
  text-align: start;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledBlockKey = styled.span`
  border-radius: ${themeCssVariables.border.radius.xs};
  flex-shrink: 0;
  height: 10px;
  width: 10px;
`;

const StyledLineKey = styled.span`
  border-radius: 1px;
  flex-shrink: 0;
  height: 2px;
  width: 14px;
`;

type AnalyticsChartLegendProps = {
  items: AnalyticsChartLegendItem[];
  keyShape?: 'block' | 'line';
};

export const AnalyticsChartLegend = ({
  items,
  keyShape = 'block',
}: AnalyticsChartLegendProps) => {
  const renderItemContent = ({ color, label }: AnalyticsChartLegendItem) => (
    <>
      {keyShape === 'line' ? (
        <StyledLineKey style={{ background: color }} />
      ) : (
        <StyledBlockKey style={{ background: color }} />
      )}
      {label}
    </>
  );

  return (
    <StyledLegend>
      {items.map((item) => (
        <StyledItem key={item.key}>
          {isDefined(item.onClick) ? (
            <StyledItemButton
              type="button"
              title={t`Click to filter the page.`}
              onClick={item.onClick}
            >
              {renderItemContent(item)}
            </StyledItemButton>
          ) : (
            renderItemContent(item)
          )}
        </StyledItem>
      ))}
    </StyledLegend>
  );
};
