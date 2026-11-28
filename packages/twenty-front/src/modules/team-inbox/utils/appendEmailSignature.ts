import { isNonEmptyString } from '@sniptt/guards';

// The signature is plain text; the DOM escapes it and keeps its line breaks.
const buildSignatureHtml = (signature: string) => {
  const paragraph = document.createElement('p');

  signature.split('\n').forEach((line, index) => {
    if (index > 0) {
      paragraph.append(document.createElement('br'));
    }

    paragraph.append(line);
  });

  return paragraph.outerHTML;
};

export const appendEmailSignature = (
  bodyHtml: string,
  signature: string | null,
): string => {
  const trimmedSignature = signature?.trim();

  if (!isNonEmptyString(trimmedSignature)) {
    return bodyHtml;
  }

  // An empty reply keeps a first line to type on, above the signature.
  const body = isNonEmptyString(bodyHtml.trim()) ? bodyHtml : '<p></p>';

  return `${body}${buildSignatureHtml(trimmedSignature)}`;
};
