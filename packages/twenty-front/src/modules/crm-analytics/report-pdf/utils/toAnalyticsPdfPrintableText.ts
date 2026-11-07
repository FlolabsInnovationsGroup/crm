const WINDOWS_ANSI_EXTRAS = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ',
);
const COMBINING_MARKS = /\p{Mark}/gu;
const MINUS_SIGN = '\u2212';
const UNPRINTABLE_CHARACTER = '?';

const isPrintable = (character: string) => {
  const code = character.codePointAt(0) ?? 0;

  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    WINDOWS_ANSI_EXTRAS.has(character)
  );
};

const toPrintableCharacter = (character: string) => {
  if (isPrintable(character)) {
    return character;
  }

  if (character === MINUS_SIGN) {
    return '-';
  }

  const simplified = character.normalize('NFKD').replace(COMBINING_MARKS, '');

  return simplified.length > 0 && Array.from(simplified).every(isPrintable)
    ? simplified
    : UNPRINTABLE_CHARACTER;
};

// Built-in PDF fonts cover Windows ANSI only, and pdfkit prints anything else as wrong
// characters without an error: a narrow space from a date or number format becomes " /".
export const toAnalyticsPdfPrintableText = (text: string) =>
  Array.from(text).map(toPrintableCharacter).join('');
