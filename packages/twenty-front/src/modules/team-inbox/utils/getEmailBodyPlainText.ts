import { isDefined, parseTipTapJsonDocument } from 'twenty-shared/utils';

type TextNode = {
  type: string;
  text?: string;
  content?: TextNode[];
};

const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock',
]);

const getNodeText = (node: TextNode): string => {
  if (node.type === 'text') {
    return node.text ?? '';
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  const text = (node.content ?? []).map(getNodeText).join('');

  return BLOCK_NODE_TYPES.has(node.type) ? `${text}\n\n` : text;
};

const normalizeLines = (text: string) =>
  text
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// The composer holds TipTap JSON once someone types, but a template that was
// applied and sent unedited is still the template's HTML.
export const getEmailBodyPlainText = (body: string): string => {
  const document = parseTipTapJsonDocument(body);

  if (isDefined(document)) {
    return normalizeLines(getNodeText(document));
  }

  const html = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '$&\n\n');

  return normalizeLines(
    new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '',
  );
};
