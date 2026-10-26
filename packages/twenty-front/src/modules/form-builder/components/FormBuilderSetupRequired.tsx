import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledContainer = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  height: 100%;
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
  text-align: center;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  margin: 0;
`;

export const FormBuilderSetupRequired = () => (
  <StyledContainer>
    <StyledTitle>{t`Forms are not set up in this workspace`}</StyledTitle>
    <span>
      {t`An admin needs to run the FloLabs forms setup script, which creates the Forms and Form submissions objects.`}
    </span>
  </StyledContainer>
);
