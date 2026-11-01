import { isNonEmptyString } from '@sniptt/guards';

import { parseLegacyMarkdownDocument } from '@/advanced-text-editor/utils/parseLegacyMarkdownDocument';

export type EmailTemplateBodySource = {
  body?: { markdown?: string | null } | null;
  bodyHtml?: string | null;
};

// Whitespace is dropped: paragraphs join differently in the two formats.
const toComparableText = (html: string) =>
  (
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  ).replace(/\s+/g, '');

// The team edits `body`. `bodyHtml` is the HubSpot import: it keeps the
// original formatting, so it is used only while the text is still the same.
export const getEmailTemplateBody = (template: EmailTemplateBodySource) => {
  const markdown = template.body?.markdown?.trim();
  const importedHtml = template.bodyHtml ?? '';

  if (!isNonEmptyString(markdown)) {
    return importedHtml;
  }

  const editedHtml = String(parseLegacyMarkdownDocument(markdown));

  return isNonEmptyString(importedHtml) &&
    toComparableText(importedHtml) === toComparableText(editedHtml)
    ? importedHtml
    : editedHtml;
};
