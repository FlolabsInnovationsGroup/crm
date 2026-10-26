import { styled } from '@linaria/react';
import { useState } from 'react';
import { Input } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const StyledContainer = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSwatch = styled.input`
  background: none;
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  cursor: pointer;
  flex: none;
  height: 32px;
  padding: 2px;
  width: 40px;
`;

type FormBuilderColorInputProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
};

export const FormBuilderColorInput = ({
  value,
  onChange,
  ariaLabel,
}: FormBuilderColorInputProps) => {
  const [draftValue, setDraftValue] = useState(value);

  const handleTextChange = (nextValue: string) => {
    setDraftValue(nextValue);

    if (HEX_COLOR_PATTERN.test(nextValue)) {
      onChange(nextValue.toLowerCase());
    }
  };

  const handleSwatchChange = (nextValue: string) => {
    setDraftValue(nextValue);
    onChange(nextValue.toLowerCase());
  };

  return (
    <StyledContainer>
      <StyledSwatch
        type="color"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => handleSwatchChange(event.target.value)}
      />
      <Input
        value={draftValue}
        aria-label={ariaLabel}
        maxLength={7}
        onChange={(event) => handleTextChange(event.target.value)}
        onBlur={() => setDraftValue(value)}
      />
    </StyledContainer>
  );
};
