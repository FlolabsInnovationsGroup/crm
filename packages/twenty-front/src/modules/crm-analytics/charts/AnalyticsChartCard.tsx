import { type ErrorLike } from '@apollo/client';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import {
  IconChevronDown,
  IconChevronRight,
  IconInfoCircle,
  IconRefresh,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartNoData } from '@/crm-analytics/charts/AnalyticsChartNoData';
import { AnalyticsSkeleton } from '@/crm-analytics/components/AnalyticsSkeleton';

const StyledCard = styled.section<{
  isFullWidth: boolean;
  isRefetching: boolean;
}>`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  grid-column: ${({ isFullWidth }) => (isFullWidth ? '1 / -1' : 'auto')};
  min-width: 0;
  opacity: ${({ isRefetching }) => (isRefetching ? 0.6 : 1)};
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
  position: relative;
`;

const StyledHeader = styled.div`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledHeading = styled.div`
  align-items: center;
  display: flex;
  flex: 1 1 200px;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
  margin: 0;
`;

const StyledInfoButton = styled.button`
  align-items: center;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  cursor: help;
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }

  &:hover {
    color: ${themeCssVariables.font.color.secondary};
  }
`;

const StyledAction = styled.div`
  flex-shrink: 0;
  max-width: 100%;
`;

const StyledBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const StyledError = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  min-height: 120px;
  text-align: center;
`;

const StyledNumbers = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding-top: ${themeCssVariables.spacing[2]};
`;

const StyledNumbersToggle = styled.button`
  align-items: center;
  align-self: flex-start;
  background: none;
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
  padding: 2px ${themeCssVariables.spacing[1]};

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
  }

  &:hover {
    color: ${themeCssVariables.font.color.primary};
  }
`;

const StyledNumbersContent = styled.div`
  min-width: 0;
  overflow-x: auto;
`;

type AnalyticsChartCardProps = {
  // A plain question, such as "Where is everyone now?".
  title: string;
  // Long explanations go here, behind the info icon.
  note?: string;
  action?: ReactNode;
  isLoading?: boolean;
  // Old numbers are still on screen while newer ones load.
  isRefetching?: boolean;
  error?: ErrorLike;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  // The table behind "Show numbers". It is mounted only while open.
  numbers?: ReactNode;
  isFullWidth?: boolean;
  children?: ReactNode;
};

export const AnalyticsChartCard = ({
  title,
  note,
  action,
  isLoading = false,
  isRefetching = false,
  error,
  onRetry,
  isEmpty = false,
  emptyMessage,
  numbers,
  isFullWidth = false,
  children,
}: AnalyticsChartCardProps) => {
  const [isNumbersOpen, setIsNumbersOpen] = useState(false);

  const renderBody = () => {
    if (isDefined(error)) {
      return (
        <StyledError>
          {t`This chart could not load`}
          {isDefined(onRetry) && (
            <Button
              variant="outline"
              size="sm"
              startIcon={<IconRefresh size={14} />}
              onClick={() => onRetry()}
            >
              {t`Retry`}
            </Button>
          )}
        </StyledError>
      );
    }

    if (isLoading) {
      return <AnalyticsSkeleton shape="chart" />;
    }

    if (isEmpty) {
      return <AnalyticsChartNoData message={emptyMessage} />;
    }

    return children;
  };

  const hasNumbers =
    isDefined(numbers) && !isDefined(error) && !isLoading && !isEmpty;

  return (
    <StyledCard
      aria-busy={isRefetching}
      aria-label={title}
      data-analytics-chart-card
      isFullWidth={isFullWidth}
      isRefetching={isRefetching}
    >
      <StyledHeader>
        <StyledHeading>
          <StyledTitle>{title}</StyledTitle>
          {isDefined(note) && (
            <Tooltip content={note}>
              <StyledInfoButton type="button" aria-label={note}>
                <IconInfoCircle size={14} aria-hidden="true" />
              </StyledInfoButton>
            </Tooltip>
          )}
        </StyledHeading>
        {isDefined(action) && <StyledAction>{action}</StyledAction>}
      </StyledHeader>
      <StyledBody>{renderBody()}</StyledBody>
      {hasNumbers && (
        <StyledNumbers>
          <StyledNumbersToggle
            type="button"
            aria-expanded={isNumbersOpen}
            onClick={() => setIsNumbersOpen(!isNumbersOpen)}
          >
            {isNumbersOpen ? (
              <IconChevronDown size={14} aria-hidden="true" />
            ) : (
              <IconChevronRight size={14} aria-hidden="true" />
            )}
            {isNumbersOpen ? t`Hide numbers` : t`Show numbers`}
          </StyledNumbersToggle>
          {isNumbersOpen && (
            <StyledNumbersContent>{numbers}</StyledNumbersContent>
          )}
        </StyledNumbers>
      )}
    </StyledCard>
  );
};
