const EXCERPT_MAX_LENGTH = 320;

// Link targets are long and the card has its own button for the one that matters.
export const getTeamInboxReviewExcerpt = (body: string) => {
  const text = body
    .replace(/\s*\[https?:\/\/[^\]\s]+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > EXCERPT_MAX_LENGTH
    ? `${text.slice(0, EXCERPT_MAX_LENGTH).trimEnd()}…`
    : text;
};
