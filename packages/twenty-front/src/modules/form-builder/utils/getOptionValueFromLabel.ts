// Mirrors how CRM select options are keyed: "Social media" → "SOCIAL_MEDIA".
export const getOptionValueFromLabel = (label: string, fallback: string) => {
  const value = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return value === '' ? fallback : value;
};
