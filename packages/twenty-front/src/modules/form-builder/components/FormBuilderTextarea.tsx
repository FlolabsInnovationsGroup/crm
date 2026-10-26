import { styled } from '@linaria/react';
import { Textarea } from 'twenty-ui/primitives/input';

const StyledMonospace = styled.div`
  display: contents;
  font-family: monospace;
`;

type FormBuilderTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxRows?: number;
  isMonospace?: boolean;
};

export const FormBuilderTextarea = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxRows = 8,
  isMonospace = false,
}: FormBuilderTextareaProps) => {
  const textarea = (
    <Textarea
      autoResize
      maxRows={maxRows}
      value={value}
      dir="auto"
      placeholder={placeholder}
      aria-label={ariaLabel}
      onValueChange={(nextValue) => onChange(nextValue)}
    />
  );

  return isMonospace ? <StyledMonospace>{textarea}</StyledMonospace> : textarea;
};
