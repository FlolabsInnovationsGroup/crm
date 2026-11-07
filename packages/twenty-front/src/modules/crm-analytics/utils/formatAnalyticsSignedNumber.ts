export const formatAnalyticsSignedNumber = (
  value: number,
  formatNumber: (value: number) => string,
) => {
  // Rounding a small fall gives -0, which number formatting prints with its sign.
  if (value === 0) {
    return formatNumber(0);
  }

  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
};
