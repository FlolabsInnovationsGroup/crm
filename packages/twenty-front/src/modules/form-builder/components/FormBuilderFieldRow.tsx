import { styled } from '@linaria/react';
import { type ReactNode } from 'react';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledRow = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
`;

const StyledLabel = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
`;

const StyledHint = styled.span`
  color: ${themeCssVariables.font.color.light};
  font-size: ${themeCssVariables.font.size.xs};
`;

type FormBuilderFieldRowProps = {
  label: string;
  hint?: string;
  children: ReactNode;
};

export const FormBuilderFieldRow = ({
  label,
  hint,
  children,
}: FormBuilderFieldRowProps) => (
  <StyledRow>
    <StyledLabel>{label}</StyledLabel>
    {children}
    {hint && <StyledHint>{hint}</StyledHint>}
  </StyledRow>
);
