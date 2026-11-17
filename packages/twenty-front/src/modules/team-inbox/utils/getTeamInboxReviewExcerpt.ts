const EXCERPT_MAX_LENGTH = 320;

const LINK_LINE_REGEX = /\[https?:\/\/[^\]\s]+\]/;

// Button lines ("Label [url]") repeat what the card's own buttons do.
export const getTeamInboxReviewExcerpt = (body: string) => {
  const text = body
    .split('\n')
    .filter((line) => !LINK_LINE_REGEX.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > EXCERPT_MAX_LENGTH
    ? `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`
    : text;
};
