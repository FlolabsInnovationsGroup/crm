import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledSelect = styled.select`
  appearance: none;
  background: ${themeCssVariables.background.primary}
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 8px center;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  height: 32px;
  min-width: 0;
  padding: 0 28px 0 8px;
  width: 100%;

  &:focus {
    border-color: ${themeCssVariables.color.blue};
    outline: none;
  }
`;

export type FormBuilderSelectOption = {
  value: string;
  label: string;
};

type FormBuilderNativeSelectProps = {
  value: string;
  options: FormBuilderSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
};

export const FormBuilderNativeSelect = ({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: FormBuilderNativeSelectProps) => (
  <StyledSelect
    value={value}
    aria-label={ariaLabel}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </StyledSelect>
);
