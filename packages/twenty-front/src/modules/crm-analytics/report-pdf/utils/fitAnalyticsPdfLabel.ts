const NARROW_CHARACTERS = new Set("fijlrtI.,:;!|' ()[]-");
const WIDE_CHARACTERS = new Set('mwMW@%&');
const NARROW_EM = 0.3;
const WIDE_EM = 0.88;
const UPPERCASE_EM = 0.72;
const DEFAULT_EM = 0.57;
const BOLD_FACTOR = 1.07;
const ELLIPSIS = '…';

const estimateCharacterEm = (character: string) => {
  if (NARROW_CHARACTERS.has(character)) {
    return NARROW_EM;
  }

  if (WIDE_CHARACTERS.has(character)) {
    return WIDE_EM;
  }

  return character >= 'A' && character <= 'Z' ? UPPERCASE_EM : DEFAULT_EM;
};

// react-pdf cannot measure text before layout. These Helvetica widths round up, so an estimate is never short.
export const estimateAnalyticsPdfTextWidth = (
  text: string,
  fontSize: number,
  isBold = false,
) => {
  const widthInEm = Array.from(text).reduce(
    (total, character) => total + estimateCharacterEm(character),
    0,
  );

  return widthInEm * fontSize * (isBold ? BOLD_FACTOR : 1);
};

type FitAnalyticsPdfLabelArgs = {
  text: string;
  maximumWidth: number;
  fontSize: number;
  isBold?: boolean;
  maximumLines?: number;
};

export const truncateAnalyticsPdfLabel = ({
  text,
  maximumWidth,
  fontSize,
  isBold = false,
}: Omit<FitAnalyticsPdfLabelArgs, 'maximumLines'>) => {
  if (estimateAnalyticsPdfTextWidth(text, fontSize, isBold) <= maximumWidth) {
    return text;
  }

  const characters = Array.from(text);

  for (let length = characters.length - 1; length > 0; length -= 1) {
    const candidate = `${characters.slice(0, length).join('').trimEnd()}${ELLIPSIS}`;

    if (
      estimateAnalyticsPdfTextWidth(candidate, fontSize, isBold) <= maximumWidth
    ) {
      return candidate;
    }
  }

  return ELLIPSIS;
};

export const wrapAnalyticsPdfLabel = ({
  text,
  maximumWidth,
  fontSize,
  isBold = false,
  maximumLines = 2,
}: FitAnalyticsPdfLabelArgs): string[] => {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const lines: string[] = [];
  let currentLine = '';
  let wordIndex = 0;

  for (; wordIndex < words.length; wordIndex += 1) {
    const candidate =
      currentLine === ''
        ? words[wordIndex]
        : `${currentLine} ${words[wordIndex]}`;

    if (
      currentLine === '' ||
      estimateAnalyticsPdfTextWidth(candidate, fontSize, isBold) <= maximumWidth
    ) {
      currentLine = candidate;
      continue;
    }

    if (lines.length === maximumLines - 1) {
      break;
    }

    lines.push(currentLine);
    currentLine = words[wordIndex];
  }

  // The last line takes every word left over, then the ellipsis shows some were cut.
  const lastLine = [currentLine, ...words.slice(wordIndex)].join(' ');

  return [...lines, lastLine]
    .filter((line) => line.length > 0)
    .map((line) =>
      truncateAnalyticsPdfLabel({
        text: line,
        maximumWidth,
        fontSize,
        isBold,
      }),
    );
};
