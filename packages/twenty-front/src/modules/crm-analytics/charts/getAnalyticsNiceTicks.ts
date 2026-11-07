const NICE_STEP_MULTIPLES = [1, 2, 2.5, 5, 10];
const FLOATING_POINT_PRECISION = 12;
const ONE_PERCENT = 0.01;

type AnalyticsNiceTicksArgs = {
  maxValue: number;
  targetCount?: number;
  hasOnlyWholeValues?: boolean;
  // Rates print as whole percents, so a 2.5 point step would read 3%, 5%, 8%.
  isRate?: boolean;
};

const isWholePercentStep = (step: number) =>
  Number.isInteger(Number((step * 100).toPrecision(FLOATING_POINT_PRECISION)));

// Clean axis values from zero. People counts never get a step such as 0.5.
export const getAnalyticsNiceTicks = ({
  maxValue,
  targetCount = 4,
  hasOnlyWholeValues = false,
  isRate = false,
}: AnalyticsNiceTicksArgs) => {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0, 1];
  }

  const roughStep = maxValue / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const multiple =
    NICE_STEP_MULTIPLES.find(
      (step) =>
        roughStep / magnitude <= step &&
        (!isRate || isWholePercentStep(step * magnitude)),
    ) ?? 10;
  const niceStep = isRate
    ? Math.max(multiple * magnitude, ONE_PERCENT)
    : multiple * magnitude;
  const step = hasOnlyWholeValues ? Math.ceil(niceStep) : niceStep;

  return Array.from({ length: Math.ceil(maxValue / step) + 1 }, (_, index) =>
    Number((index * step).toPrecision(FLOATING_POINT_PRECISION)),
  );
};
