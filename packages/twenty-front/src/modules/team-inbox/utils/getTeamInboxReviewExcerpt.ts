const EXCERPT_MAX_LENGTH = 320;

const BUTTON_LINE_REGEX = /^\s*[^[\]]{0,80}\[https?:\/\/[^\]\s]+\]\s*$/;
const LINK_TARGET_REGEX = /\s*\[https?:\/\/[^\]\s]+\]/g;

// Button lines ("Label [url]") repeat what the card's own buttons do.
export const getTeamInboxReviewExcerpt = (body: string) => {
  const text = body
    .split('\n')
    .filter((line) => !BUTTON_LINE_REGEX.test(line))
    .join('\n')
    .replace(LINK_TARGET_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > EXCERPT_MAX_LENGTH
    ? `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`
    : text;
};
