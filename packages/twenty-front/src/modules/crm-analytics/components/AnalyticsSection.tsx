import { styled } from '@linaria/react';
import { type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledTabLayout = styled.div<{ isRefetching: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[5]};
  opacity: ${({ isRefetching }) => (isRefetching ? 0.6 : 1)};
`;

const StyledIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledTakeaway = styled.p`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  line-height: ${themeCssVariables.text.lineHeight.lg};
  margin: 0;
  max-width: 88ch;
`;

const StyledTakeawayNotice = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  min-width: 0;
`;

const StyledSectionHeader = styled.div`
  align-items: flex-start;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledSectionHeading = styled.div`
  display: flex;
  flex: 1 1 320px;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledSectionAction = styled.div`
  flex-shrink: 0;
  max-width: 100%;
`;

const StyledSectionTitle = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledNote = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: ${themeCssVariables.text.lineHeight.lg};
  margin: 0;
  max-width: 88ch;
`;

const StyledNotice = styled.p`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
  padding: ${themeCssVariables.spacing[4]};
`;

export const AnalyticsNote = StyledNote;

export const AnalyticsNotice = StyledNotice;

type AnalyticsTabLayoutProps = {
  takeaway: string;
  notices?: string[];
  isRefetching?: boolean;
  children: ReactNode;
};

export const AnalyticsTabLayout = ({
  takeaway,
  notices = [],
  isRefetching = false,
  children,
}: AnalyticsTabLayoutProps) => (
  <StyledTabLayout aria-busy={isRefetching} isRefetching={isRefetching}>
    <StyledIntro>
      <StyledTakeaway role="status">{takeaway}</StyledTakeaway>
      {notices.map((notice) => (
        <StyledTakeawayNotice key={notice}>{notice}</StyledTakeawayNotice>
      ))}
    </StyledIntro>
    {children}
  </StyledTabLayout>
);

type AnalyticsSectionProps = {
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
};

export const AnalyticsSection = ({
  title,
  note,
  action,
  children,
}: AnalyticsSectionProps) => (
  <StyledSection aria-label={title}>
    <StyledSectionHeader>
      <StyledSectionHeading>
        <StyledSectionTitle>{title}</StyledSectionTitle>
        {isDefined(note) && <StyledNote>{note}</StyledNote>}
      </StyledSectionHeading>
      {isDefined(action) && <StyledSectionAction>{action}</StyledSectionAction>}
    </StyledSectionHeader>
    {children}
  </StyledSection>
);
