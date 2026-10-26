import { useState } from 'react';

import { FormBuilderTextInput } from '@/form-builder/components/FormBuilderTextInput';

const HTTPS_URL_PATTERN = /^https:\/\/\S+$/i;

type FormBuilderImageUrlInputProps = {
  value: string | undefined;
  onChange: (imageUrl: string | undefined) => void;
};

// Keeps what is typed until it is a valid https link, so typing is not reset.
export const FormBuilderImageUrlInput = ({
  value,
  onChange,
}: FormBuilderImageUrlInputProps) => {
  const [draft, setDraft] = useState(value ?? '');

  return (
    <FormBuilderTextInput
      type="url"
      dir="ltr"
      value={draft}
      placeholder="https://…"
      onChange={(nextDraft) => {
        const trimmedDraft = nextDraft.trim();

        setDraft(nextDraft);
        onChange(
          HTTPS_URL_PATTERN.test(trimmedDraft) ? trimmedDraft : undefined,
        );
      }}
    />
  );
};
