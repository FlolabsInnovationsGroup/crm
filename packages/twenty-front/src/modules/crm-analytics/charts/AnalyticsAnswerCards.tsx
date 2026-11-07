import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

import { AnalyticsChartUnknownValue } from '@/crm-analytics/charts/AnalyticsChartUnknownValue';

const MAXIMUM_ANSWER_CARDS = 3;

export type AnalyticsAnswerCard = {
  key: string;
  label: string;
  // Already formatted. Null shows a dash, never a made-up number.
  value: string | null;
  detail?: string | null;
};

const StyledCards = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[4]};
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  margin: 0;
`;

const StyledCard = styled.div`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};
`;

const StyledLabel = styled.dt`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledValue = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xxl};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin: 0;
  overflow-wrap: anywhere;
`;

const StyledDetail = styled.dd`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: ${themeCssVariables.text.lineHeight.lg};
  margin: 0;
`;

type AnalyticsAnswerCardsProps = {
  cards: AnalyticsAnswerCard[];
};

export const AnalyticsAnswerCards = ({ cards }: AnalyticsAnswerCardsProps) => (
  <StyledCards>
    {cards.slice(0, MAXIMUM_ANSWER_CARDS).map((card) => (
      <StyledCard key={card.key}>
        <StyledLabel>{card.label}</StyledLabel>
        <StyledValue>
          {isDefined(card.value) ? (
            card.value
          ) : (
            <AnalyticsChartUnknownValue />
          )}
        </StyledValue>
        {isDefined(card.detail) && <StyledDetail>{card.detail}</StyledDetail>}
      </StyledCard>
    ))}
  </StyledCards>
);
