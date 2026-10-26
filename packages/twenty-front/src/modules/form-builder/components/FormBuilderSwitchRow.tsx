import { styled } from '@linaria/react';
import { Switch } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledRow = styled.label`
  align-items: center;
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-size: ${themeCssVariables.font.size.md};
  gap: ${themeCssVariables.spacing[2]};
`;

type FormBuilderSwitchRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export const FormBuilderSwitchRow = ({
  label,
  checked,
  onChange,
}: FormBuilderSwitchRowProps) => (
  <StyledRow>
    <Switch checked={checked} onCheckedChange={onChange} />
    {label}
  </StyledRow>
);
