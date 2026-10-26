import { Input } from 'twenty-ui/primitives/input';

type FormBuilderTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  type?: 'text' | 'url' | 'number';
  min?: number;
  max?: number;
  dir?: 'ltr' | 'rtl' | 'auto';
};

export const FormBuilderTextInput = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  min,
  max,
  dir = 'auto',
}: FormBuilderTextInputProps) => (
  <Input
    value={value}
    type={type}
    min={min}
    max={max}
    dir={dir}
    placeholder={placeholder}
    aria-label={ariaLabel}
    onChange={(event) => onChange(event.target.value)}
  />
);
