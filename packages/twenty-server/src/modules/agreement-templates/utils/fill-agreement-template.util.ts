import { isNonEmptyString } from '@sniptt/guards';

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

// Unknown or empty placeholders stay in the text so the sender sees what to
// fill in by hand.
export const fillAgreementTemplate = (
  text: string,
  values: Record<string, string | null>,
): { text: string; missingPlaceholders: string[] } => {
  const missing = new Set<string>();

  const filled = text.replace(PLACEHOLDER, (placeholder, key: string) => {
    const value = values[key];

    if (isNonEmptyString(value)) {
      return value;
    }

    missing.add(key);

    return placeholder;
  });

  return { text: filled, missingPlaceholders: [...missing] };
};
