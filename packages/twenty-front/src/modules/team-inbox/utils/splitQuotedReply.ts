// Where the quoted earlier email starts: "On … wrote:", "… 写道：",
// Outlook's "-----Original Message-----" / "From: … Sent:" block, or ">" lines.
const QUOTE_START_REGEXES = [
  /^.*\bwrote:\s*$/m,
  /^.*写道[:：]?\s*$/m,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^From:.*\n(?:.*\n)?Sent:/m,
  /^>/m,
];

export const splitQuotedReply = (
  text: string,
): { reply: string; quoted: string } => {
  const quoteStart = Math.min(
    ...QUOTE_START_REGEXES.map((regex) => {
      const index = text.search(regex);

      return index < 0 ? text.length : index;
    }),
  );

  const reply = text.slice(0, quoteStart).trim();

  // A message that is only a quote keeps its text visible.
  if (reply === '') {
    return { reply: text.trim(), quoted: '' };
  }

  return { reply, quoted: text.slice(quoteStart).trim() };
};
